"""Chat session and message API routes."""

import io
import zipfile
import base64
import mimetypes
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.core.storage.database import get_db
from app.models.database import ChatSession, Project, ContentBlock
from app.models.schemas import (
    ChatSessionCreate,
    ChatSessionUpdate,
    ChatSessionResponse,
    ChatSessionListResponse,
    ContentBlockResponse,
    ContentBlockListResponse,
)
from app.api.websocket import ChatWebSocketHandler
from app.core.sandbox import get_container_manager

router = APIRouter(prefix="/chats", tags=["chat"])


# Workspace file models
class WorkspaceFile(BaseModel):
    """Model for a file in the workspace."""
    name: str
    path: str
    size: int
    type: str  # 'uploaded' or 'output'
    mime_type: Optional[str] = None


class WorkspaceFilesResponse(BaseModel):
    """Response model for workspace files."""
    uploaded: List[WorkspaceFile]
    output: List[WorkspaceFile]


# Chat Session endpoints
@router.get("", response_model=ChatSessionListResponse)
async def list_chat_sessions(
    project_id: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """List chat sessions, optionally filtered by project."""
    query = select(ChatSession)

    if project_id:
        query = query.where(ChatSession.project_id == project_id)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Get chat sessions
    query = query.offset(skip).limit(limit).order_by(ChatSession.created_at.desc())
    result = await db.execute(query)
    sessions = result.scalars().all()

    return ChatSessionListResponse(
        chat_sessions=[ChatSessionResponse.model_validate(s) for s in sessions],
        total=total,
    )


@router.post("", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_session(
    project_id: str,
    session_data: ChatSessionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new chat session."""
    # Verify project exists
    project_query = select(Project).where(Project.id == project_id)
    project_result = await db.execute(project_query)
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id {project_id} not found",
        )

    # Create chat session
    session = ChatSession(
        project_id=project_id,
        name=session_data.name,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return ChatSessionResponse.model_validate(session)


@router.get("/{session_id}", response_model=ChatSessionResponse)
async def get_chat_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a chat session by ID."""
    query = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(query)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session with id {session_id} not found",
        )

    return ChatSessionResponse.model_validate(session)


@router.put("/{session_id}", response_model=ChatSessionResponse)
async def update_chat_session(
    session_id: str,
    session_data: ChatSessionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a chat session."""
    query = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(query)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session with id {session_id} not found",
        )

    # Update fields
    update_data = session_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(session, field, value)

    await db.commit()
    await db.refresh(session)

    return ChatSessionResponse.model_validate(session)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a chat session."""
    query = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(query)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session with id {session_id} not found",
        )

    await db.delete(session)
    await db.commit()


# Content Blocks endpoints (unified model)
@router.get("/{session_id}/blocks", response_model=ContentBlockListResponse)
async def list_content_blocks(
    session_id: str,
    skip: int = 0,
    limit: int = 500,
    db: AsyncSession = Depends(get_db),
):
    """
    List content blocks in a chat session, ordered by sequence_number.

    This is the new unified API that replaces the separate messages + agent_actions model.
    Each content block represents a single piece of content (text, tool call, or tool result)
    with guaranteed ordering via sequence_number.
    """
    # Verify session exists
    session_query = select(ChatSession).where(ChatSession.id == session_id)
    session_result = await db.execute(session_query)
    session = session_result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session with id {session_id} not found",
        )

    # Get total count
    count_query = select(func.count()).select_from(ContentBlock).where(
        ContentBlock.chat_session_id == session_id
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Get content blocks ordered by sequence_number
    query = (
        select(ContentBlock)
        .where(ContentBlock.chat_session_id == session_id)
        .order_by(ContentBlock.sequence_number.asc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    blocks = result.scalars().all()

    return ContentBlockListResponse(
        blocks=[ContentBlockResponse.model_validate(b) for b in blocks],
        total=total,
    )


@router.get("/{session_id}/blocks/{block_id}", response_model=ContentBlockResponse)
async def get_content_block(
    session_id: str,
    block_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific content block by ID."""
    query = select(ContentBlock).where(
        ContentBlock.id == block_id,
        ContentBlock.chat_session_id == session_id
    )
    result = await db.execute(query)
    block = result.scalar_one_or_none()

    if not block:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content block with id {block_id} not found in session {session_id}",
        )

    return ContentBlockResponse.model_validate(block)


# WebSocket endpoint for streaming chat
@router.websocket("/{session_id}/stream")
async def chat_stream(
    websocket: WebSocket,
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """WebSocket endpoint for streaming chat responses."""
    handler = ChatWebSocketHandler(websocket, db)
    await handler.handle_connection(session_id)


# Workspace file endpoints
async def _get_container_for_session(session_id: str):
    """Helper to get container for a session."""
    manager = get_container_manager()
    container = await manager.get_container(session_id)
    if not container:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sandbox not running. The environment must be set up first.",
        )
    return container


async def _list_files_in_directory(container, directory: str, file_type: str) -> List[WorkspaceFile]:
    """List files in a directory within the container."""
    files = []

    # Use find command to list files with size
    cmd = f"find {directory} -maxdepth 1 -type f -printf '%f\\t%s\\n' 2>/dev/null || true"
    exit_code, stdout, stderr = await container.execute(cmd, workdir="/workspace", timeout=10)

    if stdout.strip():
        for line in stdout.strip().split('\n'):
            if '\t' in line:
                parts = line.split('\t')
                name = parts[0]
                size = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
                path = f"{directory}/{name}"
                mime_type, _ = mimetypes.guess_type(name)
                files.append(WorkspaceFile(
                    name=name,
                    path=path,
                    size=size,
                    type=file_type,
                    mime_type=mime_type,
                ))

    return files


@router.get("/{session_id}/workspace/files", response_model=WorkspaceFilesResponse)
async def list_workspace_files(session_id: str):
    """List all files in the workspace (uploaded and output)."""
    container = await _get_container_for_session(session_id)

    # List files in both directories
    uploaded = await _list_files_in_directory(container, "/workspace/project_files", "uploaded")
    output = await _list_files_in_directory(container, "/workspace/out", "output")

    return WorkspaceFilesResponse(uploaded=uploaded, output=output)


@router.get("/{session_id}/workspace/files/content")
async def get_workspace_file_content(session_id: str, path: str):
    """Get the content of a workspace file."""
    container = await _get_container_for_session(session_id)

    # Validate path is within workspace
    if not path.startswith("/workspace/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path must be within /workspace/",
        )

    # Check if file exists
    exit_code, _, _ = await container.execute(f"test -f '{path}'", workdir="/workspace", timeout=5)
    if exit_code != 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {path}",
        )

    # Read file content
    content = await container.read_file(path)
    if content is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read file content",
        )

    # Determine if it's a binary file (data URI)
    is_binary = content.startswith('data:')
    mime_type, _ = mimetypes.guess_type(path)

    return {
        "path": path,
        "content": content,
        "is_binary": is_binary,
        "mime_type": mime_type,
    }


@router.get("/{session_id}/workspace/files/download")
async def download_workspace_file(session_id: str, path: str):
    """Download a single workspace file."""
    container = await _get_container_for_session(session_id)

    # Validate path
    if not path.startswith("/workspace/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path must be within /workspace/",
        )

    # Read file content
    content = await container.read_file(path)
    if content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {path}",
        )

    # Get filename and mime type
    filename = path.split('/')[-1]
    mime_type, _ = mimetypes.guess_type(filename)
    mime_type = mime_type or 'application/octet-stream'

    # Handle binary files (data URIs)
    if content.startswith('data:'):
        # Extract base64 content
        try:
            header, b64_data = content.split(',', 1)
            file_bytes = base64.b64decode(b64_data)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to decode file content",
            )
    else:
        file_bytes = content.encode('utf-8')

    return Response(
        content=file_bytes,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/{session_id}/workspace/download-all")
async def download_all_workspace_files(session_id: str, type: str = "output"):
    """Download all files of a type as a zip archive."""
    container = await _get_container_for_session(session_id)

    # Determine directory
    if type == "uploaded":
        directory = "/workspace/project_files"
    elif type == "output":
        directory = "/workspace/out"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Type must be 'uploaded' or 'output'",
        )

    # List files
    files = await _list_files_in_directory(container, directory, type)

    if not files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No {type} files found",
        )

    # Create zip file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for file in files:
            content = await container.read_file(file.path)
            if content:
                # Handle binary files
                if content.startswith('data:'):
                    try:
                        header, b64_data = content.split(',', 1)
                        file_bytes = base64.b64decode(b64_data)
                    except Exception:
                        continue
                else:
                    file_bytes = content.encode('utf-8')

                zip_file.writestr(file.name, file_bytes)

    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{type}_files.zip"',
        },
    )
