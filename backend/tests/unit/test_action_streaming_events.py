"""Unit tests for real-time action streaming events.

This test suite verifies that:
1. action_streaming events are emitted immediately when tool name is received
2. action_streaming events appear BEFORE action events
3. Multiple tool calls each get their own action_streaming event
4. No duplicate action_streaming events for the same tool call
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from app.core.agent.executor import ReActAgent
from app.core.agent.tools import ToolRegistry
from app.core.agent.tools.base import ToolResult


class MockTool:
    """Mock tool for testing."""

    def __init__(self, name="mock_tool"):
        self.name = name
        self.description = f"A mock tool named {name}"
        self.parameters = {}

    async def execute(self, **kwargs) -> ToolResult:
        return ToolResult(
            success=True,
            output=f"{self.name} executed with args: {kwargs}"
        )

    async def validate_and_execute(self, **kwargs) -> ToolResult:
        """Default implementation that just calls execute."""
        return await self.execute(**kwargs)

    def format_for_llm(self):
        """Return tool in LLM function calling format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters or {"type": "object", "properties": {}}
            }
        }


@pytest.mark.asyncio
async def test_action_streaming_event_emitted_immediately():
    """Test that action_streaming event is emitted as soon as tool name is received.

    Timeline:
    1. First chunk arrives with tool name -> action_streaming emitted
    2. Subsequent chunks with arguments arrive (no new events)
    3. Stream completes -> action event emitted (tool execution starts)
    """

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        """Simulate streaming function call chunks."""
        # First chunk has function name
        yield {"function_call": {"name": "tool_a", "arguments": ""}, "index": 0}
        # Simulate slow argument streaming
        await asyncio.sleep(0.05)
        yield {"function_call": {"name": None, "arguments": '{"x"'}, "index": 0}
        await asyncio.sleep(0.05)
        yield {"function_call": {"name": None, "arguments": ': 1}'}, "index": 0}

    mock_llm.generate_stream = mock_generate_stream

    # Create tool registry
    tool_registry = ToolRegistry()
    tool_registry.register(MockTool("tool_a"))

    # Create agent
    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    # Run agent and collect events with timestamps
    events = []
    async for event in agent.run("Test message"):
        events.append(event)

    # Verify we got action_streaming event
    streaming_events = [e for e in events if e.get("type") == "action_streaming"]
    assert len(streaming_events) == 1, f"Should have one action_streaming event, got {len(streaming_events)}"
    assert streaming_events[0]["tool"] == "tool_a"
    assert streaming_events[0]["status"] == "streaming"

    # Verify we got action event
    action_events = [e for e in events if e.get("type") == "action"]
    assert len(action_events) == 1, "Should have one action event"

    # CRITICAL: action_streaming must come BEFORE action
    streaming_index = events.index(streaming_events[0])
    action_index = events.index(action_events[0])
    assert streaming_index < action_index, "action_streaming event must appear before action event"


@pytest.mark.asyncio
async def test_action_streaming_with_multiple_tool_calls():
    """Test that each tool call gets its own action_streaming event (but only first is executed)."""

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        """Simulate multiple tool calls."""
        # Tool call index=0
        yield {"function_call": {"name": "tool_a", "arguments": ""}, "index": 0}
        yield {"function_call": {"name": None, "arguments": '{}'}, "index": 0}

        # Tool call index=1 (should get streaming event but not be executed)
        yield {"function_call": {"name": "tool_b", "arguments": ""}, "index": 1}
        yield {"function_call": {"name": None, "arguments": '{}'}, "index": 1}

    mock_llm.generate_stream = mock_generate_stream

    tool_registry = ToolRegistry()
    tool_registry.register(MockTool("tool_a"))
    tool_registry.register(MockTool("tool_b"))

    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    events = []
    async for event in agent.run("Test message"):
        events.append(event)

    # Both tools should get streaming events (immediate feedback)
    streaming_events = [e for e in events if e.get("type") == "action_streaming"]
    assert len(streaming_events) == 2, f"Should have two action_streaming events, got {len(streaming_events)}"

    streaming_tools = {e["tool"] for e in streaming_events}
    assert streaming_tools == {"tool_a", "tool_b"}, "Both tools should have streaming events"

    # But only tool_a should be executed (ReAct pattern)
    action_events = [e for e in events if e.get("type") == "action"]
    assert len(action_events) == 1, "Only first tool should be executed"
    assert action_events[0]["tool"] == "tool_a"


@pytest.mark.asyncio
async def test_no_duplicate_action_streaming_events():
    """Test that action_streaming event is emitted only once per tool call."""

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        """Simulate function call where name appears in first chunk only."""
        yield {"function_call": {"name": "tool_a", "arguments": ""}, "index": 0}
        # Subsequent chunks have name=None (standard OpenAI behavior)
        yield {"function_call": {"name": None, "arguments": '{"'}, "index": 0}
        yield {"function_call": {"name": None, "arguments": 'x":'}, "index": 0}
        yield {"function_call": {"name": None, "arguments": '1}'}, "index": 0}

    mock_llm.generate_stream = mock_generate_stream

    tool_registry = ToolRegistry()
    tool_registry.register(MockTool("tool_a"))

    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    events = []
    async for event in agent.run("Test"):
        events.append(event)

    # Should have exactly ONE action_streaming event
    streaming_events = [e for e in events if e.get("type") == "action_streaming"]
    assert len(streaming_events) == 1, f"Should have exactly one action_streaming event, got {len(streaming_events)}"


@pytest.mark.asyncio
async def test_action_streaming_event_fields():
    """Test that action_streaming event has all required fields."""

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        yield {"function_call": {"name": "my_tool", "arguments": ""}, "index": 0}
        yield {"function_call": {"name": None, "arguments": '{}'}, "index": 0}

    mock_llm.generate_stream = mock_generate_stream

    tool_registry = ToolRegistry()
    tool_registry.register(MockTool("my_tool"))

    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    events = []
    async for event in agent.run("Test"):
        events.append(event)

    streaming_events = [e for e in events if e.get("type") == "action_streaming"]
    assert len(streaming_events) == 1

    streaming_event = streaming_events[0]
    # Verify required fields
    assert streaming_event["type"] == "action_streaming"
    assert streaming_event["tool"] == "my_tool"
    assert streaming_event["status"] == "streaming"
    assert "step" in streaming_event
    assert streaming_event["step"] == 1


@pytest.mark.asyncio
async def test_text_response_has_no_action_streaming_events():
    """Test that text-only responses don't emit action_streaming events."""

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        """Simulate text response without any tool calls."""
        yield "The"
        yield " answer"
        yield " is"
        yield " 42"

    mock_llm.generate_stream = mock_generate_stream

    tool_registry = ToolRegistry()
    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    events = []
    async for event in agent.run("What is the answer?"):
        events.append(event)

    # Should have NO action_streaming events
    streaming_events = [e for e in events if e.get("type") == "action_streaming"]
    assert len(streaming_events) == 0, "Text responses should not have action_streaming events"

    # Should have chunk events instead
    chunk_events = [e for e in events if e.get("type") == "chunk"]
    assert len(chunk_events) > 0, "Should have text chunks"


@pytest.mark.asyncio
async def test_action_streaming_before_reasoning_text():
    """Test that reasoning text before function call still emits action_streaming correctly."""

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        """Simulate text reasoning followed by function call."""
        # Some models emit thinking text before the function call
        yield "I will use a tool"
        yield {"function_call": {"name": "tool_a", "arguments": ""}, "index": 0}
        yield {"function_call": {"name": None, "arguments": '{}'}, "index": 0}

    mock_llm.generate_stream = mock_generate_stream

    tool_registry = ToolRegistry()
    tool_registry.register(MockTool("tool_a"))

    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    events = []
    async for event in agent.run("Test"):
        events.append(event)

    # Should have chunk events for reasoning text
    chunk_events = [e for e in events if e.get("type") == "chunk"]
    assert len(chunk_events) > 0, "Should have chunk events for reasoning text"

    # Should have action_streaming event for function call
    streaming_events = [e for e in events if e.get("type") == "action_streaming"]
    assert len(streaming_events) == 1, "Should have action_streaming event"
    assert streaming_events[0]["tool"] == "tool_a"


@pytest.mark.asyncio
async def test_event_order_chunk_then_streaming_then_action():
    """Test the complete event order for a typical function call with reasoning."""

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        yield "Let me check that"  # Reasoning text
        yield {"function_call": {"name": "tool_x", "arguments": ""}, "index": 0}
        yield {"function_call": {"name": None, "arguments": '{"test": 1}'}, "index": 0}

    mock_llm.generate_stream = mock_generate_stream

    tool_registry = ToolRegistry()
    tool_registry.register(MockTool("tool_x"))

    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    events = []
    async for event in agent.run("Test"):
        events.append(event)

    # Get indices of different event types
    event_types = [e.get("type") for e in events]

    chunk_indices = [i for i, t in enumerate(event_types) if t == "chunk"]
    streaming_indices = [i for i, t in enumerate(event_types) if t == "action_streaming"]
    action_indices = [i for i, t in enumerate(event_types) if t == "action"]
    observation_indices = [i for i, t in enumerate(event_types) if t == "observation"]

    # Verify order: chunk(s) -> action_streaming -> action -> observation
    if chunk_indices:
        assert max(chunk_indices) < streaming_indices[0], "Chunks should come before action_streaming"
    assert streaming_indices[0] < action_indices[0], "action_streaming should come before action"
    assert action_indices[0] < observation_indices[0], "action should come before observation"


@pytest.mark.asyncio
async def test_action_args_chunk_events_emitted():
    """Test that action_args_chunk events are emitted for each argument chunk."""

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        """Simulate streaming function call with arguments arriving in chunks."""
        # Tool name first
        yield {"function_call": {"name": "tool_a", "arguments": ""}, "index": 0}
        # Arguments arrive piece by piece
        yield {"function_call": {"name": None, "arguments": '{"x"'}, "index": 0}
        yield {"function_call": {"name": None, "arguments": ': 1'}, "index": 0}
        yield {"function_call": {"name": None, "arguments": '}'}, "index": 0}

    mock_llm.generate_stream = mock_generate_stream

    tool_registry = ToolRegistry()
    tool_registry.register(MockTool("tool_a"))

    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    events = []
    async for event in agent.run("Test"):
        events.append(event)

    # Should have action_args_chunk events for the argument chunks
    args_chunk_events = [e for e in events if e.get("type") == "action_args_chunk"]
    assert len(args_chunk_events) == 3, f"Should have 3 action_args_chunk events, got {len(args_chunk_events)}"

    # Verify cumulative arguments in each chunk
    assert args_chunk_events[0]["partial_args"] == '{"x"'
    assert args_chunk_events[1]["partial_args"] == '{"x": 1'
    assert args_chunk_events[2]["partial_args"] == '{"x": 1}'

    # Each should have the tool name
    for chunk_event in args_chunk_events:
        assert chunk_event["tool"] == "tool_a"
        assert chunk_event["step"] == 1


@pytest.mark.asyncio
async def test_action_args_chunk_order():
    """Test that action_args_chunk events appear in correct order."""

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        yield {"function_call": {"name": "my_tool", "arguments": ""}, "index": 0}
        yield {"function_call": {"name": None, "arguments": '{"a"'}, "index": 0}
        yield {"function_call": {"name": None, "arguments": ': 1}'}, "index": 0}

    mock_llm.generate_stream = mock_generate_stream

    tool_registry = ToolRegistry()
    tool_registry.register(MockTool("my_tool"))

    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    events = []
    async for event in agent.run("Test"):
        events.append(event)

    # Get indices of different event types
    event_types = [e.get("type") for e in events]

    streaming_idx = event_types.index("action_streaming")
    first_chunk_idx = event_types.index("action_args_chunk")
    action_idx = event_types.index("action")
    observation_idx = event_types.index("observation")

    # Verify order: action_streaming -> action_args_chunk -> action -> observation
    assert streaming_idx < first_chunk_idx, "action_streaming should come before action_args_chunk"
    assert first_chunk_idx < action_idx, "action_args_chunk should come before action"
    assert action_idx < observation_idx, "action should come before observation"


@pytest.mark.asyncio
async def test_no_action_args_chunk_for_empty_arguments():
    """Test that no action_args_chunk events are emitted if arguments are empty."""

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        """Simulate function call with no arguments."""
        yield {"function_call": {"name": "tool_a", "arguments": ""}, "index": 0}
        # No argument chunks - just empty arguments

    mock_llm.generate_stream = mock_generate_stream

    tool_registry = ToolRegistry()
    tool_registry.register(MockTool("tool_a"))

    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    events = []
    async for event in agent.run("Test"):
        events.append(event)

    # Should have NO action_args_chunk events since arguments are empty
    args_chunk_events = [e for e in events if e.get("type") == "action_args_chunk"]
    assert len(args_chunk_events) == 0, "Should have no action_args_chunk events for empty arguments"


@pytest.mark.asyncio
async def test_action_args_chunk_multiple_tools():
    """Test that each tool gets its own action_args_chunk events."""

    mock_llm = MagicMock()

    async def mock_generate_stream(*args, **kwargs):
        """Simulate multiple tool calls with arguments."""
        # Tool A
        yield {"function_call": {"name": "tool_a", "arguments": ""}, "index": 0}
        yield {"function_call": {"name": None, "arguments": '{"x": 1}'}, "index": 0}

        # Tool B (won't be executed but should get streaming events)
        yield {"function_call": {"name": "tool_b", "arguments": ""}, "index": 1}
        yield {"function_call": {"name": None, "arguments": '{"y": 2}'}, "index": 1}

    mock_llm.generate_stream = mock_generate_stream

    tool_registry = ToolRegistry()
    tool_registry.register(MockTool("tool_a"))
    tool_registry.register(MockTool("tool_b"))

    agent = ReActAgent(
        llm_provider=mock_llm,
        tool_registry=tool_registry,
        max_iterations=1
    )

    events = []
    async for event in agent.run("Test"):
        events.append(event)

    # Should have action_args_chunk events for both tools
    args_chunk_events = [e for e in events if e.get("type") == "action_args_chunk"]
    assert len(args_chunk_events) == 2, f"Should have 2 action_args_chunk events, got {len(args_chunk_events)}"

    # Verify each tool has its chunk
    tools_with_chunks = {e["tool"] for e in args_chunk_events}
    assert tools_with_chunks == {"tool_a", "tool_b"}, "Both tools should have arg chunk events"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
