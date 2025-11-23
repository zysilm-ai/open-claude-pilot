"""Unit tests for the agent task registry."""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock

from app.api.websocket.task_registry import AgentTaskRegistry, get_agent_task_registry


@pytest.mark.asyncio
async def test_register_task():
    """Test registering a new task."""
    registry = AgentTaskRegistry()

    # Create a simple task
    async def dummy_task():
        await asyncio.sleep(0.1)

    task = asyncio.create_task(dummy_task())
    cancel_event = asyncio.Event()

    # Register the task
    await registry.register_task(
        session_id="session-1",
        message_id="msg-1",
        task=task,
        cancel_event=cancel_event
    )

    # Verify task was registered
    agent_task = await registry.get_task("session-1")
    assert agent_task is not None
    assert agent_task.session_id == "session-1"
    assert agent_task.message_id == "msg-1"
    assert agent_task.task == task
    assert agent_task.cancel_event == cancel_event
    assert agent_task.status == "running"

    # Cleanup
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


@pytest.mark.asyncio
async def test_register_task_cancels_existing():
    """Test that registering a new task for a session cancels the old one."""
    registry = AgentTaskRegistry()

    # Create first task
    async def dummy_task1():
        await asyncio.sleep(10)

    task1 = asyncio.create_task(dummy_task1())
    cancel_event1 = asyncio.Event()

    await registry.register_task(
        session_id="session-1",
        message_id="msg-1",
        task=task1,
        cancel_event=cancel_event1
    )

    # Create second task for same session
    async def dummy_task2():
        await asyncio.sleep(10)

    task2 = asyncio.create_task(dummy_task2())
    cancel_event2 = asyncio.Event()

    await registry.register_task(
        session_id="session-1",
        message_id="msg-2",
        task=task2,
        cancel_event=cancel_event2
    )

    # Give cancellation time to take effect
    await asyncio.sleep(0.01)

    # First task should be cancelled
    assert cancel_event1.is_set()
    assert task1.cancelled() or task1.done()

    # Second task should be registered
    agent_task = await registry.get_task("session-1")
    assert agent_task.message_id == "msg-2"
    assert agent_task.task == task2

    # Cleanup
    task2.cancel()
    try:
        await task2
    except asyncio.CancelledError:
        pass


@pytest.mark.asyncio
async def test_get_task():
    """Test retrieving a task."""
    registry = AgentTaskRegistry()

    # No task registered
    agent_task = await registry.get_task("nonexistent")
    assert agent_task is None

    # Register a task
    async def dummy_task():
        await asyncio.sleep(0.1)

    task = asyncio.create_task(dummy_task())
    cancel_event = asyncio.Event()

    await registry.register_task(
        session_id="session-1",
        message_id="msg-1",
        task=task,
        cancel_event=cancel_event
    )

    # Retrieve the task
    agent_task = await registry.get_task("session-1")
    assert agent_task is not None
    assert agent_task.session_id == "session-1"

    # Cleanup
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


@pytest.mark.asyncio
async def test_cancel_task():
    """Test cancelling a running task."""
    registry = AgentTaskRegistry()

    # Create and register a long-running task
    async def long_running_task():
        await asyncio.sleep(10)

    task = asyncio.create_task(long_running_task())
    cancel_event = asyncio.Event()

    await registry.register_task(
        session_id="session-1",
        message_id="msg-1",
        task=task,
        cancel_event=cancel_event
    )

    # Cancel the task
    cancelled = await registry.cancel_task("session-1")
    assert cancelled is True
    assert cancel_event.is_set()

    # Give cancellation time to take effect
    await asyncio.sleep(0.01)
    assert task.cancelled() or task.done()

    # Verify status updated
    agent_task = await registry.get_task("session-1")
    assert agent_task.status == "cancelled"

    # Try to cancel again (should return False since already done)
    cancelled = await registry.cancel_task("session-1")
    assert cancelled is False


@pytest.mark.asyncio
async def test_cancel_nonexistent_task():
    """Test cancelling a task that doesn't exist."""
    registry = AgentTaskRegistry()

    # Try to cancel nonexistent task
    cancelled = await registry.cancel_task("nonexistent")
    assert cancelled is False


@pytest.mark.asyncio
async def test_mark_completed():
    """Test marking a task as completed."""
    registry = AgentTaskRegistry()

    # Create and register a task
    async def dummy_task():
        await asyncio.sleep(0.01)

    task = asyncio.create_task(dummy_task())
    cancel_event = asyncio.Event()

    await registry.register_task(
        session_id="session-1",
        message_id="msg-1",
        task=task,
        cancel_event=cancel_event
    )

    # Wait for task to complete
    await task

    # Mark as completed
    await registry.mark_completed("session-1", "completed")

    # Verify status
    agent_task = await registry.get_task("session-1")
    assert agent_task.status == "completed"


@pytest.mark.asyncio
async def test_cleanup_task():
    """Test removing a task from registry."""
    registry = AgentTaskRegistry()

    # Create and register a task
    async def dummy_task():
        await asyncio.sleep(0.1)

    task = asyncio.create_task(dummy_task())
    cancel_event = asyncio.Event()

    await registry.register_task(
        session_id="session-1",
        message_id="msg-1",
        task=task,
        cancel_event=cancel_event
    )

    # Verify task exists
    agent_task = await registry.get_task("session-1")
    assert agent_task is not None

    # Cleanup task
    await registry.cleanup_task("session-1")

    # Verify task removed
    agent_task = await registry.get_task("session-1")
    assert agent_task is None

    # Cleanup
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


@pytest.mark.asyncio
async def test_cleanup_old_tasks():
    """Test cleaning up old completed tasks."""
    registry = AgentTaskRegistry()

    # Create multiple tasks with different ages
    async def dummy_task():
        await asyncio.sleep(0.01)

    # Recent task (should not be cleaned up)
    task1 = asyncio.create_task(dummy_task())
    await registry.register_task(
        session_id="session-1",
        message_id="msg-1",
        task=task1,
        cancel_event=asyncio.Event()
    )
    await task1

    # Old task (should be cleaned up)
    task2 = asyncio.create_task(dummy_task())
    await registry.register_task(
        session_id="session-2",
        message_id="msg-2",
        task=task2,
        cancel_event=asyncio.Event()
    )
    await task2

    # Manually set old creation time for task2
    agent_task2 = await registry.get_task("session-2")
    agent_task2.created_at = datetime.utcnow() - timedelta(hours=2)

    # Cleanup old tasks (older than 1 hour)
    cleaned_count = await registry.cleanup_old_tasks(max_age_seconds=3600)

    # Should have cleaned up 1 task
    assert cleaned_count == 1

    # Verify session-1 still exists (recent)
    agent_task1 = await registry.get_task("session-1")
    assert agent_task1 is not None

    # Verify session-2 was removed (old)
    agent_task2 = await registry.get_task("session-2")
    assert agent_task2 is None


@pytest.mark.asyncio
async def test_cleanup_old_tasks_only_removes_completed():
    """Test that cleanup only removes completed tasks, not running ones."""
    registry = AgentTaskRegistry()

    # Create old but still running task
    async def long_running_task():
        await asyncio.sleep(10)

    task = asyncio.create_task(long_running_task())
    await registry.register_task(
        session_id="session-1",
        message_id="msg-1",
        task=task,
        cancel_event=asyncio.Event()
    )

    # Manually set old creation time
    agent_task = await registry.get_task("session-1")
    agent_task.created_at = datetime.utcnow() - timedelta(hours=2)

    # Cleanup old tasks
    cleaned_count = await registry.cleanup_old_tasks(max_age_seconds=3600)

    # Should NOT have cleaned up the running task
    assert cleaned_count == 0

    # Verify task still exists
    agent_task = await registry.get_task("session-1")
    assert agent_task is not None

    # Cleanup
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


@pytest.mark.asyncio
async def test_get_agent_task_registry_singleton():
    """Test that get_agent_task_registry returns a singleton."""
    registry1 = get_agent_task_registry()
    registry2 = get_agent_task_registry()

    # Should be the same instance
    assert registry1 is registry2


@pytest.mark.asyncio
async def test_concurrent_access():
    """Test concurrent access to registry is thread-safe."""
    registry = AgentTaskRegistry()

    results = []

    async def register_multiple_tasks(start_id: int):
        for i in range(10):
            async def dummy_task():
                await asyncio.sleep(0.01)

            task = asyncio.create_task(dummy_task())
            session_id = f"session-{start_id + i}"

            await registry.register_task(
                session_id=session_id,
                message_id=f"msg-{i}",
                task=task,
                cancel_event=asyncio.Event()
            )

            results.append(session_id)

    # Run multiple registrations concurrently
    await asyncio.gather(
        register_multiple_tasks(0),
        register_multiple_tasks(100),
        register_multiple_tasks(200)
    )

    # All 30 tasks should be registered
    assert len(results) == 30

    # Verify all are in registry
    for i in range(30):
        if i < 10:
            session_id = f"session-{i}"
        elif i < 20:
            session_id = f"session-{100 + (i - 10)}"
        else:
            session_id = f"session-{200 + (i - 20)}"

        agent_task = await registry.get_task(session_id)
        assert agent_task is not None
