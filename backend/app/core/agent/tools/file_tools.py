"""File operation tools for agent."""

from typing import List
from app.core.agent.tools.base import Tool, ToolParameter, ToolResult
from app.core.sandbox.container import SandboxContainer
from app.core.sandbox.security import validate_file_path


class FileReadTool(Tool):
    """Tool for reading files from the sandbox environment."""

    def __init__(self, container: SandboxContainer):
        """Initialize FileReadTool with a sandbox container.

        Args:
            container: SandboxContainer instance for file operations
        """
        self._container = container

    @property
    def name(self) -> str:
        return "file_read"

    @property
    def description(self) -> str:
        return (
            "Read the complete contents of a file from the sandbox environment. "
            "Use this to: inspect code before editing, understand file structure, "
            "view configuration files, check log outputs, or read any text-based file. "
            "Returns the entire file content as a string. For large files, consider "
            "using bash with 'head' or 'tail' commands. "
            "Examples: '/workspace/script.py', 'config.json', '../README.md'."
        )

    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(
                name="path",
                type="string",
                description="Path to the file to read (relative to /workspace or absolute path)",
                required=True,
            ),
        ]

    async def execute(self, path: str, **kwargs) -> ToolResult:
        """Read a file from the sandbox.

        Args:
            path: Path to the file to read

        Returns:
            ToolResult with file content
        """
        try:
            # Validate file path for security
            if not validate_file_path(path):
                return ToolResult(
                    success=False,
                    output="",
                    error=f"Invalid file path: {path}",
                    metadata={"path": path},
                )

            # Read file from container
            content = await self._container.read_file(path)

            return ToolResult(
                success=True,
                output=content,
                metadata={
                    "path": path,
                    "size": len(content),
                },
            )

        except FileNotFoundError:
            return ToolResult(
                success=False,
                output="",
                error=f"File not found: {path}",
                metadata={"path": path},
            )
        except Exception as e:
            return ToolResult(
                success=False,
                output="",
                error=f"Failed to read file: {str(e)}",
                metadata={"path": path},
            )


class FileWriteTool(Tool):
    """Tool for writing/creating files in the sandbox environment."""

    def __init__(self, container: SandboxContainer):
        """Initialize FileWriteTool with a sandbox container.

        Args:
            container: SandboxContainer instance for file operations
        """
        self._container = container

    @property
    def name(self) -> str:
        return "file_write"

    @property
    def description(self) -> str:
        return (
            "Write or create a file in the sandbox environment. Creates new files or "
            "completely overwrites existing files. Use this for: creating new source files, "
            "writing configuration files, generating scripts, saving outputs, or replacing "
            "entire file contents. WARNING: This overwrites existing files completely. "
            "For targeted changes to existing files, use file_edit instead. "
            "Parent directories are created automatically if they don't exist."
        )

    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(
                name="path",
                type="string",
                description="Path where the file should be written (relative to /workspace or absolute path)",
                required=True,
            ),
            ToolParameter(
                name="content",
                type="string",
                description="Content to write to the file",
                required=True,
            ),
        ]

    async def execute(self, path: str, content: str, **kwargs) -> ToolResult:
        """Write content to a file in the sandbox.

        Args:
            path: Path to the file to write
            content: Content to write

        Returns:
            ToolResult with operation status
        """
        try:
            # Validate file path for security
            if not validate_file_path(path):
                return ToolResult(
                    success=False,
                    output="",
                    error=f"Invalid file path: {path}",
                    metadata={"path": path},
                )

            # Write file to container
            await self._container.write_file(path, content)

            return ToolResult(
                success=True,
                output=f"Successfully wrote {len(content)} bytes to {path}",
                metadata={
                    "path": path,
                    "size": len(content),
                },
            )

        except Exception as e:
            return ToolResult(
                success=False,
                output="",
                error=f"Failed to write file: {str(e)}",
                metadata={"path": path},
            )


class FileEditTool(Tool):
    """Tool for editing existing files in the sandbox environment."""

    def __init__(self, container: SandboxContainer):
        """Initialize FileEditTool with a sandbox container.

        Args:
            container: SandboxContainer instance for file operations
        """
        self._container = container

    @property
    def name(self) -> str:
        return "file_edit"

    @property
    def description(self) -> str:
        return (
            "Make precise edits to existing files by replacing specific content. "
            "Searches for 'old_content' and replaces it with 'new_content' (exactly once). "
            "This is the PREFERRED way to modify existing files - much safer than file_write. "
            "Use this for: fixing bugs, updating functions, modifying config values, "
            "refactoring code, etc. The old_content must match EXACTLY (including whitespace). "
            "Returns error if: file not found, old_content not found, or old_content appears "
            "multiple times (ambiguous). Make old_content specific enough to match only once."
        )

    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(
                name="path",
                type="string",
                description="Path to the file to edit",
                required=True,
            ),
            ToolParameter(
                name="old_content",
                type="string",
                description="Content to search for and replace (must match exactly)",
                required=True,
            ),
            ToolParameter(
                name="new_content",
                type="string",
                description="New content to replace the old content with",
                required=True,
            ),
        ]

    async def execute(
        self,
        path: str,
        old_content: str,
        new_content: str,
        **kwargs
    ) -> ToolResult:
        """Edit a file by replacing specific content.

        Args:
            path: Path to the file to edit
            old_content: Content to find and replace
            new_content: New content to insert

        Returns:
            ToolResult with operation status
        """
        try:
            # Validate file path for security
            if not validate_file_path(path):
                return ToolResult(
                    success=False,
                    output="",
                    error=f"Invalid file path: {path}",
                    metadata={"path": path},
                )

            # Read current file content
            current_content = await self._container.read_file(path)

            # Check if old_content exists in the file
            if old_content not in current_content:
                return ToolResult(
                    success=False,
                    output="",
                    error=f"Content to replace not found in file: {path}",
                    metadata={"path": path},
                )

            # Check if old_content appears multiple times
            count = current_content.count(old_content)
            if count > 1:
                return ToolResult(
                    success=False,
                    output="",
                    error=f"Content appears {count} times in file. Please make old_content more specific.",
                    metadata={"path": path, "occurrences": count},
                )

            # Perform replacement
            new_file_content = current_content.replace(old_content, new_content, 1)

            # Write back to file
            await self._container.write_file(path, new_file_content)

            return ToolResult(
                success=True,
                output=f"Successfully edited {path}",
                metadata={
                    "path": path,
                    "old_size": len(current_content),
                    "new_size": len(new_file_content),
                },
            )

        except FileNotFoundError:
            return ToolResult(
                success=False,
                output="",
                error=f"File not found: {path}",
                metadata={"path": path},
            )
        except Exception as e:
            return ToolResult(
                success=False,
                output="",
                error=f"Failed to edit file: {str(e)}",
                metadata={"path": path},
            )
