"""Integration tests for incremental message saving during streaming."""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Message, MessageRole, AgentAction, ChatSession, AgentConfiguration
from app.api.websocket.chat_handler import ChatWebSocketHandler


@pytest.mark.asyncio
async def test_assistant_message_created_at_start_simple_response(db_session: AsyncSession):
    """Test that assistant message is created BEFORE streaming starts in simple mode."""
    # Create test session and config
    session = ChatSession(
        project_id="test-project",
        name="Test Session",
        status="active"
    )
    db_session.add(session)

    config = AgentConfiguration(
        project_id="test-project",
        agent_type="react",
        system_instructions="Test instructions",
        enabled_tools=[],  # Empty = simple mode
        llm_provider="openai",
        llm_model="gpt-4",
        llm_config={}
    )
    db_session.add(config)
    await db_session.commit()

    # Mock WebSocket and LLM provider
    mock_ws = MagicMock()
    mock_ws.send_json = AsyncMock()

    mock_llm = MagicMock()

    # Track when message is created
    message_creation_time = None
    streaming_started = False

    async def mock_generate_stream(messages):
        nonlocal streaming_started
        streaming_started = True
        # Check if message exists before streaming
        result = await db_session.execute(
            select(Message).where(Message.chat_session_id == session.id)
        )
        messages_before = result.scalars().all()
        # Should have user message + assistant message created at start
        assert len(messages_before) >= 1  # At least assistant message

        # Yield some chunks
        yield "Hello "
        yield "world!"

    mock_llm.generate_stream = mock_generate_stream

    # Create handler
    handler = ChatWebSocketHandler(mock_ws, db_session)

    # Mock create_llm_provider_with_db
    with patch('app.api.websocket.chat_handler.create_llm_provider_with_db', return_value=mock_llm):
        await handler._handle_user_message(
            session.id,
            "Test message",
            config
        )

    # Verify message was created before streaming
    result = await db_session.execute(
        select(Message)
        .where(Message.chat_session_id == session.id)
        .where(Message.role == MessageRole.ASSISTANT)
    )
    assistant_message = result.scalar_one()

    assert assistant_message is not None
    assert assistant_message.content == "Hello world!"
    assert assistant_message.message_metadata.get("streaming") == False
    assert streaming_started


@pytest.mark.asyncio
async def test_message_content_updated_incrementally(db_session: AsyncSession):
    """Test that message content is updated in database after each chunk."""
    # Create test session and config
    session = ChatSession(
        project_id="test-project",
        name="Test Session",
        status="active"
    )
    db_session.add(session)

    config = AgentConfiguration(
        project_id="test-project",
        agent_type="react",
        system_instructions="Test",
        enabled_tools=[],
        llm_provider="openai",
        llm_model="gpt-4",
        llm_config={}
    )
    db_session.add(config)
    await db_session.commit()

    # Mock WebSocket
    mock_ws = MagicMock()
    mock_ws.send_json = AsyncMock()

    # Track content after each chunk
    content_snapshots = []

    mock_llm = MagicMock()

    async def mock_generate_stream(messages):
        # Yield chunks one by one
        for chunk in ["First ", "second ", "third"]:
            yield chunk
            # Give time for database commit
            await asyncio.sleep(0.01)
            # Check current content in database
            result = await db_session.execute(
                select(Message)
                .where(Message.chat_session_id == session.id)
                .where(Message.role == MessageRole.ASSISTANT)
            )
            msg = result.scalar_one()
            content_snapshots.append(msg.content)

    mock_llm.generate_stream = mock_generate_stream

    # Create handler
    handler = ChatWebSocketHandler(mock_ws, db_session)

    with patch('app.api.websocket.chat_handler.create_llm_provider_with_db', return_value=mock_llm):
        await handler._handle_user_message(session.id, "Test", config)

    # Verify incremental updates
    assert len(content_snapshots) == 3
    assert content_snapshots[0] == "First "
    assert content_snapshots[1] == "First second "
    assert content_snapshots[2] == "First second third"


@pytest.mark.asyncio
async def test_agent_actions_saved_immediately(db_session: AsyncSession):
    """Test that agent actions are saved to database immediately when they occur."""
    # Create test session and config with tools enabled
    session = ChatSession(
        project_id="test-project",
        name="Test Session",
        status="active",
        environment_type="python"
    )
    db_session.add(session)

    config = AgentConfiguration(
        project_id="test-project",
        agent_type="react",
        system_instructions="Test",
        enabled_tools=["bash", "file_write"],
        llm_provider="openai",
        llm_model="gpt-4",
        llm_config={}
    )
    db_session.add(config)
    await db_session.commit()

    # Mock WebSocket
    mock_ws = MagicMock()
    mock_ws.send_json = AsyncMock()

    # Mock agent run to emit action events
    async def mock_agent_run(user_message, history, cancel_event=None):
        # Emit action event
        yield {
            "type": "action",
            "tool": "bash",
            "args": {"command": "ls"},
            "step": 1
        }

        # Give time for database commit
        await asyncio.sleep(0.01)

        # Check if action was saved
        result = await db_session.execute(
            select(AgentAction).where(AgentAction.action_type == "bash")
        )
        action = result.scalar_one_or_none()
        assert action is not None, "Action should be saved immediately"
        assert action.status == "pending"
        assert action.action_input == {"command": "ls"}

        # Emit observation
        yield {
            "type": "observation",
            "content": "file1.txt\nfile2.txt",
            "success": True,
            "step": 1
        }

        # Give time for database commit
        await asyncio.sleep(0.01)

        # Check if action was updated
        await db_session.refresh(action)
        assert action.status == "success"
        assert action.action_output == {
            "result": "file1.txt\nfile2.txt",
            "success": True
        }

        # Emit final chunk
        yield {
            "type": "chunk",
            "content": "Done!"
        }

    # Create handler and mock dependencies
    handler = ChatWebSocketHandler(mock_ws, db_session)

    with patch('app.api.websocket.chat_handler.create_llm_provider_with_db') as mock_create_llm, \
         patch('app.api.websocket.chat_handler.get_container_manager') as mock_container_mgr, \
         patch('app.core.agent.executor.ReActAgent') as mock_agent_class:

        mock_agent = MagicMock()
        mock_agent.run = mock_agent_run
        mock_agent_class.return_value = mock_agent

        mock_container_mgr.return_value.get_container = AsyncMock(return_value=MagicMock())

        await handler._handle_user_message(session.id, "Test", config)

    # Verify final state
    result = await db_session.execute(
        select(AgentAction).where(AgentAction.action_type == "bash")
    )
    action = result.scalar_one()
    assert action.status == "success"


@pytest.mark.asyncio
async def test_websocket_disconnect_doesnt_stop_execution(db_session: AsyncSession):
    """Test that agent execution continues even when WebSocket disconnects."""
    # Create test session and config
    session = ChatSession(
        project_id="test-project",
        name="Test Session",
        status="active"
    )
    db_session.add(session)

    config = AgentConfiguration(
        project_id="test-project",
        agent_type="react",
        system_instructions="Test",
        enabled_tools=[],
        llm_provider="openai",
        llm_model="gpt-4",
        llm_config={}
    )
    db_session.add(config)
    await db_session.commit()

    # Mock WebSocket that fails after first chunk
    mock_ws = MagicMock()
    call_count = [0]

    async def failing_send_json(data):
        call_count[0] += 1
        if call_count[0] > 2:  # Fail after start and first chunk
            raise Exception("WebSocket disconnected")

    mock_ws.send_json = failing_send_json

    # Mock LLM that continues streaming
    mock_llm = MagicMock()
    chunks_generated = []

    async def mock_generate_stream(messages):
        for i, chunk in enumerate(["Chunk1 ", "Chunk2 ", "Chunk3"]):
            chunks_generated.append(chunk)
            yield chunk
            await asyncio.sleep(0.01)

    mock_llm.generate_stream = mock_generate_stream

    # Create handler
    handler = ChatWebSocketHandler(mock_ws, db_session)

    with patch('app.api.websocket.chat_handler.create_llm_provider_with_db', return_value=mock_llm):
        # Should not raise exception even though WebSocket fails
        await handler._handle_user_message(session.id, "Test", config)

    # Verify all chunks were generated (execution didn't stop)
    assert len(chunks_generated) == 3
    assert chunks_generated == ["Chunk1 ", "Chunk2 ", "Chunk3"]

    # Verify message was saved with full content
    result = await db_session.execute(
        select(Message)
        .where(Message.chat_session_id == session.id)
        .where(Message.role == MessageRole.ASSISTANT)
    )
    message = result.scalar_one()
    assert message.content == "Chunk1 Chunk2 Chunk3"


@pytest.mark.asyncio
async def test_streaming_metadata_flag(db_session: AsyncSession):
    """Test that streaming metadata flag is set correctly."""
    # Create test session and config
    session = ChatSession(
        project_id="test-project",
        name="Test Session",
        status="active"
    )
    db_session.add(session)

    config = AgentConfiguration(
        project_id="test-project",
        agent_type="react",
        system_instructions="Test",
        enabled_tools=[],
        llm_provider="openai",
        llm_model="gpt-4",
        llm_config={}
    )
    db_session.add(config)
    await db_session.commit()

    # Mock WebSocket
    mock_ws = MagicMock()
    mock_ws.send_json = AsyncMock()

    # Mock LLM
    mock_llm = MagicMock()
    streaming_flag_during = None

    async def mock_generate_stream(messages):
        # Check streaming flag during generation
        nonlocal streaming_flag_during
        result = await db_session.execute(
            select(Message)
            .where(Message.chat_session_id == session.id)
            .where(Message.role == MessageRole.ASSISTANT)
        )
        msg = result.scalar_one()
        streaming_flag_during = msg.message_metadata.get("streaming")

        yield "Test content"

    mock_llm.generate_stream = mock_generate_stream

    # Create handler
    handler = ChatWebSocketHandler(mock_ws, db_session)

    with patch('app.api.websocket.chat_handler.create_llm_provider_with_db', return_value=mock_llm):
        await handler._handle_user_message(session.id, "Test", config)

    # Verify streaming flag was True during generation
    assert streaming_flag_during == True

    # Verify streaming flag is False after completion
    result = await db_session.execute(
        select(Message)
        .where(Message.chat_session_id == session.id)
        .where(Message.role == MessageRole.ASSISTANT)
    )
    message = result.scalar_one()
    assert message.message_metadata.get("streaming") == False


@pytest.mark.asyncio
async def test_partial_content_preserved_on_error(db_session: AsyncSession):
    """Test that partial content is preserved even when an error occurs."""
    # Create test session and config
    session = ChatSession(
        project_id="test-project",
        name="Test Session",
        status="active"
    )
    db_session.add(session)

    config = AgentConfiguration(
        project_id="test-project",
        agent_type="react",
        system_instructions="Test",
        enabled_tools=[],
        llm_provider="openai",
        llm_model="gpt-4",
        llm_config={}
    )
    db_session.add(config)
    await db_session.commit()

    # Mock WebSocket
    mock_ws = MagicMock()
    mock_ws.send_json = AsyncMock()

    # Mock LLM that fails mid-stream
    mock_llm = MagicMock()

    async def mock_generate_stream(messages):
        yield "First chunk "
        await asyncio.sleep(0.01)
        yield "Second chunk "
        await asyncio.sleep(0.01)
        # Simulate error
        raise Exception("LLM API error")

    mock_llm.generate_stream = mock_generate_stream

    # Create handler
    handler = ChatWebSocketHandler(mock_ws, db_session)

    with patch('app.api.websocket.chat_handler.create_llm_provider_with_db', return_value=mock_llm):
        # Should handle error gracefully
        with pytest.raises(Exception):
            await handler._handle_user_message(session.id, "Test", config)

    # Verify partial content was saved
    result = await db_session.execute(
        select(Message)
        .where(Message.chat_session_id == session.id)
        .where(Message.role == MessageRole.ASSISTANT)
    )
    message = result.scalar_one()
    # Should have the chunks that were generated before error
    assert "First chunk" in message.content
    assert "Second chunk" in message.content


@pytest.mark.asyncio
async def test_multiple_actions_saved_in_sequence(db_session: AsyncSession):
    """Test that multiple agent actions are saved correctly in sequence."""
    # Create test session and config
    session = ChatSession(
        project_id="test-project",
        name="Test Session",
        status="active",
        environment_type="python"
    )
    db_session.add(session)

    config = AgentConfiguration(
        project_id="test-project",
        agent_type="react",
        system_instructions="Test",
        enabled_tools=["bash", "file_write"],
        llm_provider="openai",
        llm_model="gpt-4",
        llm_config={}
    )
    db_session.add(config)
    await db_session.commit()

    # Mock WebSocket
    mock_ws = MagicMock()
    mock_ws.send_json = AsyncMock()

    # Mock agent with multiple actions
    async def mock_agent_run(user_message, history, cancel_event=None):
        # First action
        yield {"type": "action", "tool": "bash", "args": {"command": "ls"}, "step": 1}
        await asyncio.sleep(0.01)
        yield {"type": "observation", "content": "file.txt", "success": True, "step": 1}
        await asyncio.sleep(0.01)

        # Second action
        yield {"type": "action", "tool": "file_write", "args": {"path": "/test.py", "content": "print('hi')"}, "step": 2}
        await asyncio.sleep(0.01)
        yield {"type": "observation", "content": "File written", "success": True, "step": 2}
        await asyncio.sleep(0.01)

        # Final answer
        yield {"type": "chunk", "content": "Done!"}

    # Create handler and mock dependencies
    handler = ChatWebSocketHandler(mock_ws, db_session)

    with patch('app.api.websocket.chat_handler.create_llm_provider_with_db') as mock_create_llm, \
         patch('app.api.websocket.chat_handler.get_container_manager') as mock_container_mgr, \
         patch('app.core.agent.executor.ReActAgent') as mock_agent_class:

        mock_agent = MagicMock()
        mock_agent.run = mock_agent_run
        mock_agent_class.return_value = mock_agent

        mock_container_mgr.return_value.get_container = AsyncMock(return_value=MagicMock())

        await handler._handle_user_message(session.id, "Test", config)

    # Verify both actions were saved
    result = await db_session.execute(
        select(AgentAction).order_by(AgentAction.created_at)
    )
    actions = result.scalars().all()

    assert len(actions) == 2

    # First action
    assert actions[0].action_type == "bash"
    assert actions[0].action_input == {"command": "ls"}
    assert actions[0].status == "success"
    assert actions[0].action_output["result"] == "file.txt"

    # Second action
    assert actions[1].action_type == "file_write"
    assert actions[1].action_input == {"path": "/test.py", "content": "print('hi')"}
    assert actions[1].status == "success"
    assert actions[1].action_output["result"] == "File written"
