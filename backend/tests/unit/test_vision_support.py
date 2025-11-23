"""Test vision support for image file reading.

This test verifies that:
1. Vision models (VLMs) receive images in proper API format
2. Non-vision models receive text descriptions only
3. Image metadata is properly passed through the conversation history
4. VLM detection works correctly
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.models.database.message import Message, MessageRole
from app.models.database.agent_action import AgentAction, AgentActionStatus
from app.models.database.chat_session import ChatSession
from app.api.websocket.chat_handler import is_vision_model, build_tool_result_content


def test_is_vision_model_openai():
    """Test VLM detection for OpenAI models."""
    # Vision models
    assert is_vision_model("gpt-4o") == True
    assert is_vision_model("gpt-4-turbo") == True
    assert is_vision_model("gpt-4-vision-preview") == True
    assert is_vision_model("GPT-4o") == True  # Case insensitive

    # Non-vision models
    assert is_vision_model("gpt-3.5-turbo") == False
    assert is_vision_model("gpt-4") == False

    print("✓ OpenAI VLM detection works correctly")


def test_is_vision_model_anthropic():
    """Test VLM detection for Anthropic models."""
    # Vision models (all Claude 3+ support vision)
    assert is_vision_model("claude-3-opus") == True
    assert is_vision_model("claude-3-sonnet") == True
    assert is_vision_model("claude-3-haiku") == True
    assert is_vision_model("claude-sonnet-4-5") == True
    assert is_vision_model("claude-opus-next") == True

    # Non-vision models (Claude 2 and earlier)
    assert is_vision_model("claude-2") == False
    assert is_vision_model("claude-v1") == False

    print("✓ Anthropic VLM detection works correctly")


def test_is_vision_model_google():
    """Test VLM detection for Google models."""
    # Vision models
    assert is_vision_model("gemini-pro-vision") == True
    assert is_vision_model("gemini-1.5-pro") == True

    # Non-vision models
    assert is_vision_model("palm-2") == False

    print("✓ Google VLM detection works correctly")


def test_build_tool_result_content_text_only():
    """Test that text-only results work for both VLM and non-VLM."""
    # Create a text-only action (no image)
    action = AgentAction(
        message_id="test-msg",
        action_type="file_read",
        action_input={"path": "/workspace/out/script.py"},
        action_output={"success": True, "result": "print('hello world')"},
        action_metadata=None,
        status=AgentActionStatus.SUCCESS
    )

    # Test with VLM
    result_vlm = build_tool_result_content(action, "gpt-4o")
    assert "[SUCCESS]" in result_vlm
    assert "print('hello world')" in result_vlm
    assert "Note:" not in result_vlm  # No vision disclaimer

    # Test with non-VLM
    result_non_vlm = build_tool_result_content(action, "gpt-3.5-turbo")
    assert "[SUCCESS]" in result_non_vlm
    assert "print('hello world')" in result_non_vlm
    assert "Note:" not in result_non_vlm  # No vision disclaimer for text

    print("✓ Text-only results work correctly for both VLM and non-VLM")


def test_build_tool_result_content_image_for_vlm():
    """Test that image results for VLM get short text only (image passed separately)."""
    # Create an image action
    action = AgentAction(
        message_id="test-msg",
        action_type="file_read",
        action_input={"path": "/workspace/out/chart.png"},
        action_output={
            "success": True,
            "result": "Successfully read image file: /workspace/out/chart.png (10KB, image/png)\nImage will be displayed to the user in the chat."
        },
        action_metadata={
            "type": "image",
            "image_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...",
            "filename": "chart.png",
            "mime_type": "image/png"
        },
        status=AgentActionStatus.SUCCESS
    )

    # Test with VLM - should get SHORT text only (image passed separately in conversation history)
    result = build_tool_result_content(action, "gpt-4o")
    assert "[SUCCESS]" in result
    assert "Successfully read image file" in result
    assert "Note:" not in result  # VLM can see images, no disclaimer needed
    # Should NOT contain the base64 data
    assert "iVBORw0KGgoAAAANSUhEUgAAAAUA" not in result

    print("✓ Image results for VLM return short text only")


def test_build_tool_result_content_image_for_non_vlm():
    """Test that image results for non-VLM get explanation."""
    # Create an image action
    action = AgentAction(
        message_id="test-msg",
        action_type="file_read",
        action_input={"path": "/workspace/out/chart.png"},
        action_output={
            "success": True,
            "result": "Successfully read image file: /workspace/out/chart.png (10KB, image/png)\nImage will be displayed to the user in the chat."
        },
        action_metadata={
            "type": "image",
            "image_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...",
            "filename": "chart.png",
            "mime_type": "image/png"
        },
        status=AgentActionStatus.SUCCESS
    )

    # Test with non-VLM - should get explanation
    result = build_tool_result_content(action, "gpt-3.5-turbo")
    assert "[SUCCESS]" in result
    assert "Successfully read image file" in result
    assert "Note:" in result
    assert "Image content cannot be analyzed by this model" in result
    assert "displayed to the user" in result

    print("✓ Image results for non-VLM include explanation that model can't see images")


@pytest.mark.asyncio
async def test_conversation_history_with_image_for_vlm(db_session: AsyncSession):
    """Test that VLM conversation history includes images in proper vision API format."""
    from app.api.websocket.chat_handler import ChatWebSocketHandler

    # Create session
    session = ChatSession(
        id="test-vision-session",
        name="Test Vision Session",
        project_id="test-project",
        environment_type="python3.11"
    )
    db_session.add(session)

    # User asks to read an image
    user_msg = Message(
        chat_session_id=session.id,
        role=MessageRole.USER,
        content="Show me the chart",
        message_metadata={}
    )
    db_session.add(user_msg)

    # Assistant reads the image file
    assistant_msg = Message(
        chat_session_id=session.id,
        role=MessageRole.ASSISTANT,
        content="I'll read the chart image for you.",
        message_metadata={"agent_mode": True}
    )
    db_session.add(assistant_msg)
    await db_session.flush()

    # file_read action with image result
    action = AgentAction(
        message_id=assistant_msg.id,
        action_type="file_read",
        action_input={"path": "/workspace/out/chart.png"},
        action_output={
            "success": True,
            "result": "Successfully read image file: /workspace/out/chart.png (10KB, image/png)\nImage will be displayed to the user in the chat."
        },
        action_metadata={
            "type": "image",
            "image_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...",
            "filename": "chart.png",
            "mime_type": "image/png"
        },
        status=AgentActionStatus.SUCCESS
    )
    db_session.add(action)
    await db_session.commit()

    # Create handler and get conversation history for VLM
    handler = ChatWebSocketHandler(websocket=None, db=db_session)
    history = await handler._get_conversation_history(session.id, "gpt-4o")

    # Verify structure
    assert len(history) == 4  # user msg, assistant msg, tool call, tool result

    # Verify tool result uses multi-content format with image
    tool_result = history[3]
    assert tool_result["role"] == "user"
    assert isinstance(tool_result["content"], list), "VLM tool result should use multi-content format"
    assert len(tool_result["content"]) == 2, "Should have text + image"

    # Verify text content
    text_part = tool_result["content"][0]
    assert text_part["type"] == "text"
    assert "[SUCCESS]" in text_part["text"]
    assert "Successfully read image file" in text_part["text"]

    # Verify image content
    image_part = tool_result["content"][1]
    assert image_part["type"] == "image_url"
    assert "image_url" in image_part
    assert image_part["image_url"]["url"].startswith("data:image/png;base64,")

    print("✓ VLM conversation history uses proper vision API format with images")


@pytest.mark.asyncio
async def test_conversation_history_with_image_for_non_vlm(db_session: AsyncSession):
    """Test that non-VLM conversation history includes text-only explanation."""
    from app.api.websocket.chat_handler import ChatWebSocketHandler

    # Create session
    session = ChatSession(
        id="test-non-vision-session",
        name="Test Non-Vision Session",
        project_id="test-project",
        environment_type="python3.11"
    )
    db_session.add(session)

    # User asks to read an image
    user_msg = Message(
        chat_session_id=session.id,
        role=MessageRole.USER,
        content="Show me the chart",
        message_metadata={}
    )
    db_session.add(user_msg)

    # Assistant reads the image file
    assistant_msg = Message(
        chat_session_id=session.id,
        role=MessageRole.ASSISTANT,
        content="I'll read the chart image for you.",
        message_metadata={"agent_mode": True}
    )
    db_session.add(assistant_msg)
    await db_session.flush()

    # file_read action with image result
    action = AgentAction(
        message_id=assistant_msg.id,
        action_type="file_read",
        action_input={"path": "/workspace/out/chart.png"},
        action_output={
            "success": True,
            "result": "Successfully read image file: /workspace/out/chart.png (10KB, image/png)\nImage will be displayed to the user in the chat."
        },
        action_metadata={
            "type": "image",
            "image_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...",
            "filename": "chart.png",
            "mime_type": "image/png"
        },
        status=AgentActionStatus.SUCCESS
    )
    db_session.add(action)
    await db_session.commit()

    # Create handler and get conversation history for non-VLM
    handler = ChatWebSocketHandler(websocket=None, db=db_session)
    history = await handler._get_conversation_history(session.id, "gpt-3.5-turbo")

    # Verify structure
    assert len(history) == 4

    # Verify tool result uses TEXT-ONLY format with explanation
    tool_result = history[3]
    assert tool_result["role"] == "user"
    assert isinstance(tool_result["content"], str), "Non-VLM tool result should be plain text"

    # Verify explanation is included
    assert "[SUCCESS]" in tool_result["content"]
    assert "Successfully read image file" in tool_result["content"]
    assert "Note:" in tool_result["content"]
    assert "Image content cannot be analyzed by this model" in tool_result["content"]
    assert "displayed to the user" in tool_result["content"]

    # Verify no base64 data in the text
    assert "data:image/png;base64," not in tool_result["content"]

    print("✓ Non-VLM conversation history uses text-only format with explanation")


@pytest.mark.asyncio
async def test_conversation_history_mixed_text_and_images(db_session: AsyncSession):
    """Test conversation history with both text files and images."""
    from app.api.websocket.chat_handler import ChatWebSocketHandler

    # Create session
    session = ChatSession(
        id="test-mixed-session",
        name="Test Mixed Session",
        project_id="test-project",
        environment_type="python3.11"
    )
    db_session.add(session)

    user_msg = Message(
        chat_session_id=session.id,
        role=MessageRole.USER,
        content="Read script.py and chart.png",
        message_metadata={}
    )
    db_session.add(user_msg)

    assistant_msg = Message(
        chat_session_id=session.id,
        role=MessageRole.ASSISTANT,
        content="I'll read both files.",
        message_metadata={"agent_mode": True}
    )
    db_session.add(assistant_msg)
    await db_session.flush()

    # First action: Read text file
    action1 = AgentAction(
        message_id=assistant_msg.id,
        action_type="file_read",
        action_input={"path": "/workspace/out/script.py"},
        action_output={
            "success": True,
            "result": "print('hello world')"
        },
        action_metadata=None,  # No image metadata
        status=AgentActionStatus.SUCCESS
    )
    db_session.add(action1)

    # Second action: Read image file
    action2 = AgentAction(
        message_id=assistant_msg.id,
        action_type="file_read",
        action_input={"path": "/workspace/out/chart.png"},
        action_output={
            "success": True,
            "result": "Successfully read image file: /workspace/out/chart.png (10KB, image/png)\nImage will be displayed to the user in the chat."
        },
        action_metadata={
            "type": "image",
            "image_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...",
            "filename": "chart.png",
            "mime_type": "image/png"
        },
        status=AgentActionStatus.SUCCESS
    )
    db_session.add(action2)
    await db_session.commit()

    # Get history for VLM
    handler = ChatWebSocketHandler(websocket=None, db=db_session)
    history = await handler._get_conversation_history(session.id, "gpt-4o")

    # Expected: user msg, assistant msg,
    #           tool call 1, tool result 1 (text),
    #           tool call 2, tool result 2 (image)
    assert len(history) == 6

    # Verify first tool result is text-only
    tool_result_1 = history[3]
    assert isinstance(tool_result_1["content"], str)
    assert "print('hello world')" in tool_result_1["content"]

    # Verify second tool result is multi-content with image
    tool_result_2 = history[5]
    assert isinstance(tool_result_2["content"], list)
    assert len(tool_result_2["content"]) == 2
    assert tool_result_2["content"][0]["type"] == "text"
    assert tool_result_2["content"][1]["type"] == "image_url"

    print("✓ Mixed text and image files handled correctly in conversation history")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
