# Implementation Plan: Line-Based File Editing Tool

## Research Summary

### How Other Coding Agents Handle File Editing

| Agent | Approach | Line Numbers | Whitespace Handling | Key Insight |
|-------|----------|--------------|---------------------|-------------|
| **Claude Code (Anthropic)** | `str_replace` + `insert` commands | `insert_line` for insertion, `view_range` for viewing | Exact match required | Official `insert` command uses line numbers |
| **OpenAI Codex** | Patch format with context anchors | Avoids line numbers | Uses `apply_patch` with fuzzy fallbacks | "Successful formats avoid line numbers" - but context-based matching works |
| **Aider** | SEARCH/REPLACE blocks | No line numbers | Exact match (common failure point) | Multiple formats available, but all struggle with whitespace |
| **SWE-Agent** | Custom editor with linter | Uses line-based chunks (100 lines) | Linter validates before applying | **Linter prevents syntax errors from being committed** |
| **RooCode** | Search/replace with fuzzy matching | No line numbers | **"Middle-out fuzzy matching"** captures and reapplies indentation | Best indentation handling |
| **Cursor** | Two-model approach | N/A | Separate "Apply" model handles integration | Specialized model for applying changes |

### Key Best Practices from Research

1. **Avoid pure line-number dependency** - Line numbers can shift during multi-edit sessions
2. **Provide context for matching** - Include surrounding lines to disambiguate
3. **Implement layered matching**: Exact → Fuzzy → Error with suggestions
4. **Capture and preserve indentation** automatically (RooCode's approach)
5. **Validate syntax before committing** (SWE-Agent's linter approach)
6. **Provide actionable error feedback** with specific suggestions

---

## Proposed Solution: Hybrid Line-Based Editing

We'll implement a **hybrid approach** combining the best of each system:

1. **Line-range replacement** (from Claude's `insert` + `view_range`)
2. **Automatic indentation handling** (from RooCode's capture/reapply)
3. **Syntax validation** (from SWE-Agent's linter)
4. **Fuzzy matching fallback** (from RooCode/Codex)

---

## Implementation Plan

### Phase 1: New Tool - `edit_lines`

#### Tool Definition

**File**: `backend/app/core/agent/tools/line_edit_tool.py`

```python
class LineEditTool(Tool):
    """Line-based file editing tool that handles indentation automatically."""

    @property
    def name(self) -> str:
        return "edit_lines"

    @property
    def description(self) -> str:
        return (
            "Edit files by replacing, inserting, or deleting specific lines.\n\n"
            "ADVANTAGES over pattern-based edit:\n"
            "- No whitespace matching issues\n"
            "- Automatic indentation handling\n"
            "- Line numbers visible in file_read output\n\n"
            "COMMANDS:\n"
            "1. REPLACE: Replace lines start_line to end_line with new_content\n"
            "2. INSERT: Insert new_content after insert_line (0 = beginning)\n"
            "3. DELETE: Delete lines start_line to end_line\n\n"
            "INDENTATION:\n"
            "- New content is auto-indented to match context\n"
            "- Or specify indent_level (number of spaces) to override\n\n"
            "VALIDATION:\n"
            "- Python files are syntax-checked before saving\n"
            "- Invalid edits are rejected with error details"
        )

    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(
                name="command",
                type="string",
                description="Action: 'replace', 'insert', or 'delete'",
                required=True,
            ),
            ToolParameter(
                name="path",
                type="string",
                description="File path (e.g., '/workspace/out/main.py')",
                required=True,
            ),
            ToolParameter(
                name="start_line",
                type="integer",
                description="Starting line number (1-indexed). Required for replace/delete.",
                required=False,
            ),
            ToolParameter(
                name="end_line",
                type="integer",
                description="Ending line number (inclusive). Required for replace/delete.",
                required=False,
            ),
            ToolParameter(
                name="insert_line",
                type="integer",
                description="Line number after which to insert (0 = beginning). Required for insert.",
                required=False,
            ),
            ToolParameter(
                name="new_content",
                type="string",
                description="New content to insert/replace. Required for replace/insert.",
                required=False,
            ),
            ToolParameter(
                name="indent_level",
                type="integer",
                description="Override auto-indent with specific number of spaces.",
                required=False,
            ),
            ToolParameter(
                name="dry_run",
                type="boolean",
                description="Preview changes without applying. Default: false",
                required=False,
                default=False,
            ),
        ]
```

#### Core Implementation

```python
async def execute(self, command: str, path: str, **kwargs) -> ToolResult:
    """Execute line-based edit command."""

    # 1. Read current file content
    content = await self._read_file(path)
    lines = content.split('\n')

    # 2. Execute command
    if command == "replace":
        new_lines = self._replace_lines(lines, **kwargs)
    elif command == "insert":
        new_lines = self._insert_lines(lines, **kwargs)
    elif command == "delete":
        new_lines = self._delete_lines(lines, **kwargs)
    else:
        return ToolResult(success=False, error=f"Unknown command: {command}")

    # 3. Validate Python syntax (if applicable)
    new_content = '\n'.join(new_lines)
    if path.endswith('.py'):
        syntax_error = self._validate_python_syntax(new_content)
        if syntax_error:
            return ToolResult(
                success=False,
                error=f"Edit would create syntax error:\n{syntax_error}\n\nEdit NOT applied.",
                metadata={"validation_failed": True}
            )

    # 4. Apply or preview
    if kwargs.get('dry_run', False):
        return self._preview_changes(lines, new_lines, path)

    await self._write_file(path, new_content)
    return ToolResult(
        success=True,
        output=f"Successfully edited {path} (lines {start_line}-{end_line})"
    )
```

#### Automatic Indentation Handling (RooCode-inspired)

```python
def _apply_smart_indentation(
    self,
    new_content: str,
    context_lines: List[str],
    target_line: int,
    explicit_indent: Optional[int] = None
) -> str:
    """Apply smart indentation to new content based on context.

    Algorithm (inspired by RooCode's "middle-out" approach):
    1. Detect the indentation of the target line or surrounding context
    2. Calculate the base indentation level of the new content
    3. Re-indent new content to match the target context
    """

    if explicit_indent is not None:
        # User specified exact indentation
        return self._reindent_to_level(new_content, explicit_indent)

    # Detect target indentation from context
    target_indent = self._detect_context_indent(context_lines, target_line)

    # Detect base indentation of new content
    new_lines = new_content.split('\n')
    base_indent = self._detect_base_indent(new_lines)

    # Re-indent each line relative to target
    result_lines = []
    for line in new_lines:
        if not line.strip():  # Empty or whitespace-only
            result_lines.append('')
        else:
            line_indent = len(line) - len(line.lstrip())
            relative_indent = line_indent - base_indent
            new_indent = max(0, target_indent + relative_indent)
            result_lines.append(' ' * new_indent + line.lstrip())

    return '\n'.join(result_lines)

def _detect_context_indent(self, lines: List[str], target_line: int) -> int:
    """Detect appropriate indentation level from surrounding context."""

    # Look at the line before and after for context
    for offset in [0, -1, 1, -2, 2]:
        idx = target_line + offset
        if 0 <= idx < len(lines):
            line = lines[idx]
            if line.strip():  # Non-empty line
                indent = len(line) - len(line.lstrip())

                # If line ends with ':', next line should be indented more
                if offset < 0 and line.rstrip().endswith(':'):
                    return indent + 4  # Standard Python indent

                return indent

    return 0  # Default to no indent

def _detect_base_indent(self, lines: List[str]) -> int:
    """Detect the minimum indentation in the new content (base level)."""
    min_indent = float('inf')

    for line in lines:
        if line.strip():  # Non-empty line
            indent = len(line) - len(line.lstrip())
            min_indent = min(min_indent, indent)

    return 0 if min_indent == float('inf') else min_indent
```

#### Python Syntax Validation (SWE-Agent-inspired)

```python
def _validate_python_syntax(self, content: str) -> Optional[str]:
    """Validate Python syntax before applying edit.

    Returns None if valid, or error message if invalid.
    """
    try:
        # Use Python's AST parser for syntax validation
        import ast
        ast.parse(content)
        return None
    except SyntaxError as e:
        return (
            f"Line {e.lineno}: {e.msg}\n"
            f"  {e.text.rstrip() if e.text else ''}\n"
            f"  {' ' * (e.offset - 1 if e.offset else 0)}^"
        )
```

---

### Phase 2: Enhanced `file_read` with Line Numbers

Modify `file_read` to always include line numbers in output (essential for line-based editing):

**File**: `backend/app/core/agent/tools/file_tools.py`

```python
@property
def description(self) -> str:
    return (
        "Read file contents with line numbers.\n\n"
        "Output format:\n"
        "  1: first line content\n"
        "  2: second line content\n"
        "  ...\n\n"
        "Line numbers are essential for using edit_lines tool.\n"
        "Use start_line/end_line to read specific ranges."
    )

async def execute(self, path: str, start_line: int = None, end_line: int = None) -> ToolResult:
    """Read file with line numbers."""

    content = await self._container.read_file(path)
    lines = content.split('\n')

    # Apply line range filter
    if start_line:
        start_idx = max(0, start_line - 1)
        end_idx = end_line if end_line else len(lines)
        lines = lines[start_idx:end_idx]
        first_line_num = start_line
    else:
        first_line_num = 1

    # Format with line numbers (like Claude's text editor tool)
    formatted_lines = []
    for i, line in enumerate(lines):
        line_num = first_line_num + i
        formatted_lines.append(f"{line_num:>4}: {line}")

    return ToolResult(
        success=True,
        output='\n'.join(formatted_lines),
        metadata={"line_count": len(lines), "first_line": first_line_num}
    )
```

---

### Phase 3: Fuzzy Matching Mode for Legacy `edit` Tool

Add a fuzzy whitespace matching option to the existing `edit` tool:

**File**: `backend/app/core/agent/tools/ast_edit_tool.py`

```python
async def _text_based_edit_fuzzy(
    self,
    file_path: Path,
    pattern: str,
    replacement: str,
    dry_run: bool
) -> ToolResult:
    """Text-based editing with fuzzy whitespace matching."""

    content = await self._read_file(file_path)

    # Try exact match first
    if pattern in content:
        return await self._text_based_edit(file_path, pattern, replacement, dry_run)

    # Fuzzy match: normalize whitespace
    norm_pattern = self._normalize_whitespace(pattern)
    norm_content = self._normalize_whitespace(content)

    if norm_pattern not in norm_content:
        return ToolResult(
            success=False,
            error="Pattern not found (even with fuzzy matching).\n"
                  f"Pattern preview: {pattern[:100]}...\n\n"
                  "Try using edit_lines with specific line numbers instead."
        )

    # Find the actual text that matches (preserving original whitespace)
    actual_match = self._find_matching_segment(content, pattern)

    # Apply replacement with smart indentation
    new_content = content.replace(actual_match, replacement, 1)

    # Continue with write...

def _normalize_whitespace(self, text: str) -> str:
    """Normalize whitespace for fuzzy comparison."""
    # Convert tabs to spaces
    text = text.replace('\t', '    ')
    # Normalize line endings
    text = text.replace('\r\n', '\n')
    # Collapse multiple spaces to single (but preserve line structure)
    lines = []
    for line in text.split('\n'):
        # Normalize leading whitespace to single spaces
        stripped = line.lstrip()
        if stripped:
            # Keep relative indent structure but normalize
            indent = (len(line) - len(stripped)) // 4 * 4  # Round to 4-space increments
            lines.append(' ' * indent + ' '.join(stripped.split()))
        else:
            lines.append('')
    return '\n'.join(lines)
```

---

### Phase 4: Tool Registration & Configuration

**File**: `backend/app/api/websocket/chat_handler.py`

```python
# Register new line-based edit tool
if "edit_lines" in agent_config.enabled_tools:
    tool_registry.register(LineEditTool(container))
```

**File**: `backend/app/models/chat.py` (AgentConfig)

```python
# Add to default enabled tools
enabled_tools: List[str] = [
    "file_read",
    "file_write",
    "edit",           # Pattern-based (keep for compatibility)
    "edit_lines",     # NEW: Line-based editing
    "bash",
    "search",
    "setup_environment",
    "think"
]
```

---

### Phase 5: Update System Prompts

**File**: `backend/app/core/agent/templates.py`

Add guidance for when to use each tool:

```python
EDIT_TOOL_GUIDANCE = """
## File Editing Tools

You have TWO editing tools. Choose based on the situation:

### edit_lines (PREFERRED for fixes)
Use for: Fixing syntax errors, indentation issues, small targeted changes
- Specify line numbers (visible in file_read output)
- Automatic indentation handling
- Python syntax validation prevents bad edits

Example - Fix indentation on line 15:
```
edit_lines(
    command="replace",
    path="/workspace/out/main.py",
    start_line=15,
    end_line=15,
    new_content="        return self.data"
)
```

### edit (for refactoring)
Use for: Renaming functions/variables, bulk changes with AST patterns
- Use $VAR for AST pattern matching
- Works across multiple files

Example - Rename function:
```
edit(
    pattern="def $OLD($$$ARGS)",
    rewrite="def $NEW($$$ARGS)",
    path="/workspace/out/"
)
```

### When Pattern-Based Edit Fails
If edit() fails due to whitespace mismatch:
1. Use file_read to get exact line numbers
2. Use edit_lines with those line numbers
3. The content will be auto-indented correctly
"""
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `backend/app/core/agent/tools/line_edit_tool.py` | **NEW** | Line-based editing tool implementation |
| `backend/app/core/agent/tools/__init__.py` | Modify | Export LineEditTool |
| `backend/app/core/agent/tools/file_tools.py` | Modify | Enhanced file_read with line numbers |
| `backend/app/core/agent/tools/ast_edit_tool.py` | Modify | Add fuzzy matching mode |
| `backend/app/api/websocket/chat_handler.py` | Modify | Register edit_lines tool |
| `backend/app/models/chat.py` | Modify | Add edit_lines to default tools |
| `backend/app/core/agent/templates.py` | Modify | Add edit tool guidance |

---

## Testing Plan

### Unit Tests

1. **Line replacement accuracy**
   - Replace single line
   - Replace multi-line range
   - Edge cases: first line, last line, entire file

2. **Indentation handling**
   - Auto-indent matches context
   - Explicit indent_level overrides
   - Nested indentation (if/for/def blocks)
   - Mixed tabs/spaces normalization

3. **Syntax validation**
   - Valid edit passes
   - Invalid edit rejected with helpful error
   - Non-Python files skip validation

4. **Edge cases**
   - Empty file
   - Single line file
   - Line numbers out of range
   - Insert at position 0

### Integration Tests

1. **Fix real Python indentation errors**
   - Create file with IndentationError
   - Agent uses edit_lines to fix
   - Verify file runs correctly

2. **Multi-step editing session**
   - Agent reads file
   - Makes multiple edits using line numbers
   - Line numbers stay accurate between edits

---

## Migration Path

1. **Week 1**: Implement `edit_lines` tool, keep `edit` unchanged
2. **Week 2**: Update system prompts to prefer `edit_lines` for fixes
3. **Week 3**: Add fuzzy matching to `edit` as fallback
4. **Week 4**: Monitor performance, adjust prompts based on usage

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Edit success rate (first attempt) | ~60% | >90% |
| Average retries for indentation fixes | 3-5 | 1-2 |
| Syntax errors introduced by edits | ~15% | <2% |

---

## Sources

- [Claude Text Editor Tool Documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool)
- [Aider Edit Formats](https://aider.chat/docs/more/edit-formats.html)
- [Code Surgery: How AI Assistants Make Precise Edits](https://fabianhertwig.com/blog/coding-assistants-file-edits/)
- [SWE-Agent GitHub](https://github.com/SWE-agent/SWE-agent)
- [OpenAI Codex GitHub](https://github.com/openai/codex)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
