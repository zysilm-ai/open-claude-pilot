"""WebSocket handler for chat streaming."""

import json
from typing import Dict, Any
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import ChatSession, Message, MessageRole, AgentConfiguration
from app.core.llm import create_llm_provider


class ChatWebSocketHandler:
    """Handle WebSocket connections for chat streaming."""

    def __init__(self, websocket: WebSocket, db: AsyncSession):
        self.websocket = websocket
        self.db = db

    async def handle_connection(self, session_id: str):
        """Handle WebSocket connection for a chat session."""
        await self.websocket.accept()

        try:
            # Verify session exists and get project config
            session_query = select(ChatSession).where(ChatSession.id == session_id)
            session_result = await self.db.execute(session_query)
            session = session_result.scalar_one_or_none()

            if not session:
                await self.websocket.send_json({
                    "type": "error",
                    "content": f"Chat session {session_id} not found"
                })
                await self.websocket.close()
                return

            # Get agent configuration
            config_query = select(AgentConfiguration).where(
                AgentConfiguration.project_id == session.project_id
            )
            config_result = await self.db.execute(config_query)
            agent_config = config_result.scalar_one_or_none()

            if not agent_config:
                await self.websocket.send_json({
                    "type": "error",
                    "content": "Agent configuration not found"
                })
                await self.websocket.close()
                return

            # Main message loop
            while True:
                # Receive message from client
                data = await self.websocket.receive_text()
                message_data = json.loads(data)

                if message_data.get("type") == "message":
                    await self._handle_user_message(
                        session_id,
                        message_data.get("content", ""),
                        agent_config
                    )

        except WebSocketDisconnect:
            print(f"WebSocket disconnected for session {session_id}")
        except Exception as e:
            print(f"WebSocket error: {str(e)}")
            await self.websocket.send_json({
                "type": "error",
                "content": f"Error: {str(e)}"
            })
        finally:
            try:
                await self.websocket.close()
            except:
                pass

    async def _handle_user_message(
        self,
        session_id: str,
        content: str,
        agent_config: AgentConfiguration
    ):
        """Handle incoming user message and stream LLM response."""
        # Save user message
        user_message = Message(
            chat_session_id=session_id,
            role=MessageRole.USER,
            content=content,
            message_metadata={},
        )
        self.db.add(user_message)
        await self.db.commit()

        # Send confirmation
        await self.websocket.send_json({
            "type": "user_message_saved",
            "message_id": user_message.id
        })

        # Get conversation history
        history = await self._get_conversation_history(session_id)

        # Add system instructions if present
        messages = []
        if agent_config.system_instructions:
            messages.append({
                "role": "system",
                "content": agent_config.system_instructions
            })

        # Add conversation history
        messages.extend(history)

        # Create LLM provider
        try:
            llm_provider = create_llm_provider(
                provider=agent_config.llm_provider,
                model=agent_config.llm_model,
                llm_config=agent_config.llm_config,
            )

            # Stream response
            assistant_content = ""
            await self.websocket.send_json({
                "type": "start"
            })

            async for chunk in llm_provider.generate_stream(messages):
                assistant_content += chunk
                await self.websocket.send_json({
                    "type": "chunk",
                    "content": chunk
                })

            # Save assistant message
            assistant_message = Message(
                chat_session_id=session_id,
                role=MessageRole.ASSISTANT,
                content=assistant_content,
                message_metadata={},
            )
            self.db.add(assistant_message)
            await self.db.commit()

            # Send completion
            await self.websocket.send_json({
                "type": "end",
                "message_id": assistant_message.id
            })

        except Exception as e:
            await self.websocket.send_json({
                "type": "error",
                "content": f"LLM Error: {str(e)}"
            })

    async def _get_conversation_history(self, session_id: str) -> list[Dict[str, str]]:
        """Get conversation history for a session."""
        query = (
            select(Message)
            .where(Message.chat_session_id == session_id)
            .order_by(Message.created_at.asc())
        )
        result = await self.db.execute(query)
        messages = result.scalars().all()

        history = []
        for msg in messages:
            history.append({
                "role": msg.role.value,
                "content": msg.content
            })

        return history
