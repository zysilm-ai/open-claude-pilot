/**
 * AssistantUIChatPage - Chat interface using assistant-ui library
 *
 * This component preserves ALL UI/UX features from the legacy ChatSessionPage:
 * - Header with back button, session title, environment badge
 * - Virtualized message scrolling
 * - Auto-scroll toggle
 * - Message input with Enter-to-send
 * - Streaming indicators
 * - Error handling
 * - Empty state placeholder
 * - Quick start (pending messages)
 *
 * Using assistant-ui for:
 * - Message threading and state management
 * - Composer input handling
 * - Built-in message primitives
 */
import { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatSessionsAPI, contentBlocksAPI } from '@/services/api';
import { useOptimizedStreaming } from '../ProjectSession/hooks/useOptimizedStreaming';
import { AssistantUIChatList } from './AssistantUIChatList';
import { ChatFileSidebar } from '../ChatFileSidebar';
import { FolderOpen } from 'lucide-react';
import '../ProjectSession/ChatSessionPage.css';

/**
 * For now, we use the existing streaming infrastructure and UI.
 * Assistant-ui integration will be gradual - first matching feature parity,
 * then enhancing with assistant-ui primitives.
 */
export default function AssistantUIChatPage() {
  const { projectId, sessionId } = useParams<{
    projectId: string;
    sessionId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fetch session metadata
  const { data: session } = useQuery({
    queryKey: ['chatSession', sessionId],
    queryFn: () => chatSessionsAPI.get(sessionId!),
    enabled: !!sessionId,
  });

  // Fetch existing content blocks from the backend
  const { data: blocksData } = useQuery({
    queryKey: ['contentBlocks', sessionId],
    queryFn: () => contentBlocksAPI.list(sessionId!),
    enabled: !!sessionId,
    staleTime: 5 * 60 * 1000,        // 5 minutes
    refetchOnWindowFocus: false,     // Prevent refetch on tab switch
    refetchOnReconnect: false,
  });

  // Callback for when workspace files change
  const handleWorkspaceFilesChanged = useCallback(() => {
    // Invalidate the workspace files query to trigger a refetch
    queryClient.invalidateQueries({ queryKey: ['workspaceFiles', sessionId] });
  }, [queryClient, sessionId]);

  // Use the optimized streaming hook with loaded content blocks
  const {
    blocks,
    streamEvents,
    isStreaming,
    error,
    sendMessage,
    cancelStream,
    clearError,
  } = useOptimizedStreaming({
    sessionId: sessionId!,
    initialBlocks: blocksData?.blocks || [],
    onWorkspaceFilesChanged: handleWorkspaceFilesChanged,
  });

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  // Handle pending message from sessionStorage (quick start feature)
  useEffect(() => {
    const pendingMessage = sessionStorage.getItem('pendingMessage');
    if (pendingMessage && sessionId) {
      sessionStorage.removeItem('pendingMessage');
      setTimeout(() => {
        sendMessage(pendingMessage);
      }, 500);
    }
  }, [sessionId, sendMessage]);

  const handleBackClick = useCallback(() => {
    navigate(`/projects/${projectId}`);
  }, [navigate, projectId]);

  const handleSend = useCallback(() => {
    if (input.trim() && !isStreaming) {
      sendMessage(input);
      setInput('');
    }
  }, [input, isStreaming, sendMessage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="chat-session-page">
      {/* Header - Preserved from legacy */}
      <div className="chat-header">
        <button
          onClick={handleBackClick}
          className="back-btn"
          aria-label="Back to project"
        >
          ← Back to Project
        </button>
        <h2 className="session-title">
          {session?.name || 'Chat Session'}
          {session?.environment_type && (
            <span className="environment-badge" title="Sandbox environment">
              {session.environment_type}
            </span>
          )}
        </h2>
        <button
          onClick={toggleSidebar}
          className={`files-toggle-btn ${sidebarOpen ? 'active' : ''}`}
          aria-label="Toggle files sidebar"
          title="Files"
        >
          <FolderOpen size={18} />
        </button>
      </div>

      {/* Main content area with optional sidebar */}
      <div className="chat-main-wrapper">
        {/* Chat content column */}
        <div className="chat-content-column">
          {/* Content Blocks - Using assistant-ui chat list */}
          <div className="chat-messages-container">
            <AssistantUIChatList
              blocks={blocks}
              isStreaming={isStreaming}
              streamEvents={streamEvents}
            />
          </div>

          {/* Error Banner - Preserved from legacy */}
          {error && (
            <div className="chat-error-banner">
              <div className="error-content">
                <span className="error-icon">⚠️</span>
                <div className="error-message">{error}</div>
                <button
                  className="error-close-btn"
                  onClick={clearError}
                  aria-label="Close error"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Message Input - Preserved from legacy */}
          <div className="chat-input-container">
            <div className="chat-input-wrapper">
              <textarea
                className="chat-input"
                placeholder="Type your message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                rows={1}
                disabled={isStreaming}
              />
              <button
                className={`send-btn ${isStreaming ? 'stop-btn' : ''}`}
                onClick={isStreaming ? cancelStream : handleSend}
                disabled={isStreaming ? false : !input.trim()}
                title={isStreaming ? 'Stop generating' : 'Send message'}
              >
                {isStreaming ? (
                  'Stop'
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* File Sidebar */}
        <ChatFileSidebar
          sessionId={sessionId!}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
    </div>
  );
}
