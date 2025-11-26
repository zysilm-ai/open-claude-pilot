/**
 * AssistantUIMessage - Message component with assistant-ui styling
 *
 * This component handles streaming and tool calls with a clean UI
 * without requiring the full assistant-ui runtime context.
 */

import React, { useMemo } from 'react';
import { Streamdown } from 'streamdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ToolCallComponent } from './ToolCallComponent';
import type { Message, StreamEvent } from '../ProjectSession/hooks/useOptimizedStreaming';

interface AssistantUIMessageProps {
  message: Message;
  isStreaming?: boolean;
  streamEvents?: StreamEvent[];
}

export const AssistantUIMessage: React.FC<AssistantUIMessageProps> = ({
  message,
  isStreaming = false,
  streamEvents = [],
}) => {
  // Process message parts
  const messageParts = useMemo(() => {
    const parts: any[] = [];

    // Handle streaming events
    if (isStreaming && streamEvents.length > 0) {
      let currentText = '';
      const toolCalls: any[] = [];

      streamEvents.forEach((event: StreamEvent) => {
        if (event.type === 'chunk') {
          currentText += event.content || '';
        } else if (event.type === 'action' || event.type === 'action_args_chunk') {
          // Check if we have text to render first
          if (currentText) {
            parts.push({ type: 'text', content: currentText });
            currentText = '';
          }
          // Add tool call
          const existing = toolCalls.find(tc => tc.toolName === event.tool);
          if (!existing) {
            toolCalls.push({
              type: 'tool-call',
              toolCallId: `${event.tool}-${Date.now()}`,
              toolName: event.tool,
              args: event.args || event.partial_args || {},
              status: { type: 'running' },
            });
          }
        } else if (event.type === 'observation') {
          // Find the last tool call and add result
          const lastTool = toolCalls[toolCalls.length - 1];
          if (lastTool) {
            lastTool.result = event.content;
            lastTool.isError = !event.success;
            lastTool.status = { type: 'complete' };
          }
        }
      });

      // Add remaining text
      if (currentText) {
        parts.push({ type: 'text', content: currentText });
      }

      // Add tool calls
      toolCalls.forEach(tc => parts.push(tc));
    } else {
      // Non-streaming message
      if (message.content) {
        parts.push({ type: 'text', content: message.content });
      }

      // Add agent actions as tool calls
      if (message.agent_actions && Array.isArray(message.agent_actions)) {
        message.agent_actions
          .slice()
          .sort((a: any, b: any) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            return timeA - timeB;
          })
          .forEach((action: any) => {
            parts.push({
              type: 'tool-call',
              toolCallId: action.id || `action-${Date.now()}-${Math.random()}`,
              toolName: action.action_type || 'unknown',
              args: action.action_input || {},
              result: action.action_output,
              isError: action.status !== 'success',
              status: { type: 'complete' },
            });
          });
      }
    }

    return parts;
  }, [message, isStreaming, streamEvents]);

  const renderPart = (part: any, index: number) => {
    if (part.type === 'text') {
      if (isStreaming) {
        return (
          <div key={index} style={{ position: 'relative' }}>
            <Streamdown>{part.content}</Streamdown>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '20px',
              backgroundColor: '#111827',
              marginLeft: '2px',
              animation: 'blink 1s infinite',
            }} />
          </div>
        );
      } else {
        return (
          <ReactMarkdown
            key={index}
            remarkPlugins={[remarkGfm]}
            components={{
              code({ inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const language = match ? match[1] : '';

                return !inline && language ? (
                  <SyntaxHighlighter
                    style={oneLight}
                    language={language}
                    PreTag="div"
                    customStyle={{
                      margin: '12px 0',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                      fontSize: '13px',
                    }}
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {part.content}
          </ReactMarkdown>
        );
      }
    } else if (part.type === 'tool-call') {
      return (
        <ToolCallComponent
          key={index}
          toolName={part.toolName}
          args={part.args}
          result={part.result}
          isError={part.isError}
          status={part.status}
          toolCallId={part.toolCallId}
          addResult={() => {}}
          resume={() => {}}
        />
      );
    }
    return null;
  };

  return (
    <div className={`message-wrapper ${message.role}`}>
      <div className="message-content">
        <div className="message-role">
          {message.role === 'user' ? (
            <div className="avatar user-avatar">You</div>
          ) : (
            <div className="avatar assistant-avatar">AI</div>
          )}
        </div>
        <div className="message-text">
          <div className="message-body">
            {messageParts.map((part, index) => renderPart(part, index))}
          </div>
        </div>
      </div>
    </div>
  );
};