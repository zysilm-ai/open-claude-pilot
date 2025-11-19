import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatSessionsAPI } from '@/services/api';
import type { ChatSession } from '@/types';
import './ChatSessionTabs.css';

interface ChatSessionTabsProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
}

export default function ChatSessionTabs({
  sessions,
  activeSessionId,
  onSelectSession,
}: ChatSessionTabsProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: chatSessionsAPI.delete,
    onSuccess: (_, deletedSessionId) => {
      // If we deleted the active session, clear the selection
      if (activeSessionId === deletedSessionId) {
        onSelectSession(null);
      }
      queryClient.invalidateQueries({ queryKey: ['chatSessions'] });
    },
  });

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirm('Delete this chat session?')) {
      deleteMutation.mutate(sessionId);
    }
  };

  return (
    <div className="chat-session-tabs">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`chat-session-tab ${
            session.id === activeSessionId ? 'active' : ''
          }`}
          onClick={() => onSelectSession(session.id)}
        >
          <span className="session-name">{session.name}</span>
          <button
            className="delete-session-btn"
            onClick={(e) => handleDelete(e, session.id)}
            title="Delete session"
          >
            ×
          </button>
        </div>
      ))}

      {sessions.length === 0 && (
        <div className="no-sessions">No chat sessions yet</div>
      )}
    </div>
  );
}
