/**
 * AssistantUIChatList - Virtualized chat list using assistant-ui components
 *
 * This component provides virtualized rendering with assistant-ui message components
 * for optimal performance with large message histories.
 */

import { useRef, useEffect, forwardRef, memo } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { AssistantUIMessage } from './AssistantUIMessage';
import type { Message, StreamEvent } from '../ProjectSession/hooks/useOptimizedStreaming';
import './AssistantUIChat.css';

interface AssistantUIChatListProps {
  messages: Message[];
  isStreaming: boolean;
  streamEvents?: StreamEvent[];
}

// Custom scroller with thin scrollbar
const CustomScroller = forwardRef<HTMLDivElement, any>(({ style, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    style={{
      ...style,
      scrollbarWidth: 'thin',
      scrollbarColor: '#cbd5e0 transparent',
    }}
  />
));
CustomScroller.displayName = 'CustomScroller';

// Memoized message component for performance
const MemoizedAssistantUIMessage = memo(AssistantUIMessage, (prevProps, nextProps) => {
  // Only re-render if essential properties change
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.streamEvents?.length === nextProps.streamEvents?.length
  );
});

export const AssistantUIChatList: React.FC<AssistantUIChatListProps> = ({
  messages,
  isStreaming,
  streamEvents = [],
}) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Auto-scroll to bottom when new messages arrive or during streaming
  useEffect(() => {
    if (messages.length > 0) {
      const timeoutId = setTimeout(() => {
        if (virtuosoRef.current) {
          virtuosoRef.current.scrollTo({
            top: 999999999,
            behavior: isStreaming ? 'auto' : 'smooth',
          });
        }
      }, isStreaming ? 0 : 10);

      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, isStreaming, streamEvents]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
        itemContent={(index, message) => {
          const isLastMessage = index === messages.length - 1;
          const isCurrentlyStreaming = isStreaming && isLastMessage;

          return (
            <MemoizedAssistantUIMessage
              key={message.id}
              message={message}
              isStreaming={isCurrentlyStreaming}
              streamEvents={isCurrentlyStreaming ? streamEvents : []}
            />
          );
        }}
        components={{
          Scroller: CustomScroller,
          Footer: () => <div style={{ height: '80px' }} />,
          EmptyPlaceholder: () => (
            <div className="empty-chat">
              <h3>Start a conversation</h3>
              <p>Ask me anything, and I'll help you with code, data analysis, and more.</p>
            </div>
          ),
        }}
        style={{ height: '100%' }}
      />
    </div>
  );
};