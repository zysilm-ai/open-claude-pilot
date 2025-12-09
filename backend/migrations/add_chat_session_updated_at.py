"""
Migration script to add updated_at column to chat_sessions table.

Usage:
    cd backend
    poetry run python migrations/add_chat_session_updated_at.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


DATABASE_URL = "sqlite+aiosqlite:///./data/open_codex.db"


async def add_updated_at_column():
    """Add updated_at column to chat_sessions table."""
    engine = create_async_engine(DATABASE_URL, echo=True)

    async with engine.begin() as conn:
        # Check if column already exists
        result = await conn.execute(text("PRAGMA table_info(chat_sessions)"))
        columns = [row[1] for row in result.fetchall()]

        if 'updated_at' in columns:
            print("updated_at column already exists in chat_sessions")
            return

        # Add the column with default value of created_at
        print("Adding updated_at column to chat_sessions...")
        await conn.execute(text(
            "ALTER TABLE chat_sessions ADD COLUMN updated_at DATETIME"
        ))

        # Set updated_at to created_at for existing rows
        await conn.execute(text(
            "UPDATE chat_sessions SET updated_at = created_at WHERE updated_at IS NULL"
        ))

        print("Migration completed successfully!")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(add_updated_at_column())
