"""Test that file_write tool only writes to /workspace/out directory."""

import pytest
from app.core.agent.tools.file_tools import FileWriteTool
from app.core.sandbox.container import SandboxContainer


@pytest.mark.asyncio
async def test_file_write_accepts_simple_filename():
    """Test that file_write accepts simple filenames."""
    # This is a mock test to verify the logic - actual container test would need Docker
    tool = FileWriteTool(container=None)

    # Verify tool parameters
    params = {p.name: p for p in tool.parameters}
    assert "filename" in params, "Tool should accept 'filename' parameter"
    assert params["filename"].required is True

    # Verify description mentions workspace
    assert "workspace" in tool.description.lower()
    assert "filename" in tool.description.lower()


@pytest.mark.asyncio
async def test_file_write_rejects_path_with_slash():
    """Test that file_write rejects filenames with path separators."""
    tool = FileWriteTool(container=None)

    # Try to write with path separator
    result = await tool.execute(filename="subdir/file.py", content="test")

    assert result.success is False
    assert "Invalid filename" in result.error
    assert "path separators" in result.error


@pytest.mark.asyncio
async def test_file_write_rejects_path_with_backslash():
    """Test that file_write rejects filenames with backslash."""
    tool = FileWriteTool(container=None)

    result = await tool.execute(filename="subdir\\file.py", content="test")

    assert result.success is False
    assert "Invalid filename" in result.error


@pytest.mark.asyncio
async def test_file_write_rejects_hidden_files():
    """Test that file_write rejects hidden files starting with dot."""
    tool = FileWriteTool(container=None)

    result = await tool.execute(filename=".hidden", content="test")

    assert result.success is False
    assert "Invalid filename" in result.error


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
