"""Chat session schemas for API validation."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.models.database.chat_session import ChatSessionStatus


class ChatSessionBase(BaseModel):
    """Base chat session schema."""
    name: str = Field(..., min_length=1, max_length=255)


class ChatSessionCreate(ChatSessionBase):
    """Schema for creating a chat session."""
    pass


class ChatSessionUpdate(BaseModel):
    """Schema for updating a chat session."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    status: Optional[ChatSessionStatus] = None


class ChatSessionResponse(ChatSessionBase):
    """Schema for chat session response."""
    id: str
    project_id: str
    created_at: datetime
    container_id: Optional[str]
    status: ChatSessionStatus

    class Config:
        from_attributes = True


class ChatSessionListResponse(BaseModel):
    """Schema for chat session list response."""
    chat_sessions: list[ChatSessionResponse]
    total: int
