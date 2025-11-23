import { useEffect, useRef } from 'react';
import type { Message } from '@/types';
import type { AgentAction, StreamEvent } from '@/stores/chatStore';
import './MessageList.css';

interface MessageListProps {
  messages: Message[];
  streamingMessage: string;
  isStreaming: boolean;
  agentActions: AgentAction[];
  streamEvents: StreamEvent[];
}

export default function MessageList({
  messages,
  streamingMessage,
  isStreaming,
  streamEvents,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, streamEvents]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render a single stream event in the correct order
  const renderStreamEvent = (event: StreamEvent, index: number) => {
    switch (event.type) {
      case 'chunk':
        return event.content;

      case 'action_streaming':
        return (
          <div key={index} className="agent-action agent-action-streaming">
            <div className="action-tool">
              <span className="action-icon">⏳</span>
              <strong>{event.tool}</strong>
              <span className="action-status">{event.status}</span>
            </div>
          </div>
        );

      case 'action':
        return (
          <div key={index} className="agent-action agent-action-action">
            <div className="action-tool">
              <span className="action-icon">🔧</span>
              <strong>{event.tool}</strong>
              {event.args && (
                <pre className="action-args">{JSON.stringify(event.args, null, 2)}</pre>
              )}
            </div>
          </div>
        );

      case 'action_args_chunk':
        // Show partial arguments being built up in real-time
        return (
          <div key={index} className="agent-action agent-action-args-chunk">
            <div className="action-tool">
              <span className="action-icon">📝</span>
              <strong>{event.tool}</strong>
              <pre className="action-args partial">{event.partial_args}</pre>
            </div>
          </div>
        );

      case 'observation':
        return (
          <div key={index} className="agent-action agent-action-observation">
            <div className={`observation ${event.success ? 'success' : 'error'}`}>
              <span className="observation-icon">{event.success ? '✓' : '✗'}</span>
              <pre className="observation-content">{event.content}</pre>
            </div>
          </div>
        );

      case 'thought':
        return event.content;

      default:
        return null;
    }
  };

  return (
    <div className="message-list">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`message message-${message.role}`}
        >
          <div className="message-header">
            <span className="message-role">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </span>
            <span className="message-time">
              {formatTime(message.created_at)}
            </span>
          </div>
          <div className="message-content">
            {message.content}
          </div>
        </div>
      ))}

      {isStreaming && (
        <div className="message message-assistant streaming">
          <div className="message-header">
            <span className="message-role">Assistant</span>
            <span className="message-time">Now</span>
          </div>

          {/* Display unified stream of events in order */}
          {streamEvents.length > 0 && (
            <div className="message-content">
              {streamEvents.map((event, idx) => (
                <span key={idx}>{renderStreamEvent(event, idx)}</span>
              ))}
              <span className="streaming-cursor">▋</span>
            </div>
          )}
        </div>
      )}

      {messages.length === 0 && !isStreaming && (
        <div className="empty-messages">
          <p>No messages yet. Start a conversation!</p>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
