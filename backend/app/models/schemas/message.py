"""Message schemas for API validation."""

from datetime import datetime
from typing import Dict, Any
from pydantic import BaseModel, Field

from app.models.database.message import MessageRole


class MessageBase(BaseModel):
    """Base message schema."""
    content: str = Field(..., min_length=1)
    message_metadata: Dict[str, Any | None] = Field(default_factory=dict)


class MessageCreate(MessageBase):
    """Schema for creating a message."""
    role: MessageRole = MessageRole.USER


class MessageResponse(MessageBase):
    """Schema for message response."""
    id: str
    chat_session_id: str
    role: MessageRole
    created_at: datetime

    class Config:
        from_attributes = True


class MessageListResponse(BaseModel):
    """Schema for message list response."""
    messages: list[MessageResponse]
    total: int
