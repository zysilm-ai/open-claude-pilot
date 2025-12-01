/**
 * AssistantUIChatList - Virtualized chat list using assistant-ui components
 *
 * This component provides virtualized rendering with assistant-ui message components
 * for optimal performance with large message histories.
 */

import { useRef, useEffect, forwardRef, memo, useCallback } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { AssistantUIMessage } from './AssistantUIMessage';
import './AssistantUIChat.css';
import {Message, StreamEvent} from "@/types";

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
  const isUserScrollingRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);

  // Track whether user is at the bottom
  const handleScroll = useCallback((e: any) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLElement;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold

    // If user scrolled up manually, disable auto-scroll
    if (scrollTop < lastScrollTopRef.current && !isAtBottom) {
      autoScrollEnabledRef.current = false;
      isUserScrollingRef.current = true;
    }

    // Re-enable auto-scroll if user scrolls back to bottom
    if (isAtBottom) {
      autoScrollEnabledRef.current = true;
      isUserScrollingRef.current = false;
    }

    lastScrollTopRef.current = scrollTop;
  }, []);

  // Auto-scroll to bottom only if enabled and not user scrolling
  useEffect(() => {
    if (messages.length > 0 && autoScrollEnabledRef.current && !isUserScrollingRef.current) {
      // Use scrollToIndex for smoother scrolling to last message
      const timeoutId = setTimeout(() => {
        if (virtuosoRef.current) {
          virtuosoRef.current.scrollToIndex({
            index: messages.length - 1,
            behavior: isStreaming ? 'auto' : 'smooth',
            align: 'end',
          });
        }
      }, isStreaming ? 0 : 10);

      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, isStreaming, streamEvents.length]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
        onScroll={handleScroll}
        followOutput={autoScrollEnabledRef.current ? 'auto' : false}
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