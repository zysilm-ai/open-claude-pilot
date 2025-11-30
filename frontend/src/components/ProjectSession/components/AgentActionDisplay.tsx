import React from 'react';
import {
  FileWriteActionArgs,
  ObservationContent,
  formatActionArgs,
} from './MessageHelpers';
import {AgentAction, StreamEvent} from "@/types";

interface AgentActionDisplayProps {
  actions?: AgentAction[];
  isStreaming?: boolean;
  streamEvents?: StreamEvent[];
}

export const AgentActionDisplay: React.FC<AgentActionDisplayProps> = ({
  actions = [],
  isStreaming = false,
  streamEvents = [],
}) => {
  // If we have persisted actions, render them
  if (actions && actions.length > 0 && !isStreaming) {
    return (
      <div className="agent-actions">
        {actions.map((action) => (
          <div key={action.id} className="action-block">
            {/* Action header */}
            <div className="action-header">
              🔧 Using {action.action_input?.tool || 'tool'}
            </div>

            {/* Action input/args */}
            {action.action_input && (
              <div className="action-args-container">
                <div className="action-args-header">📝 Arguments:</div>
                {action.action_input.tool === 'file_write' ? (
                  <FileWriteActionArgs args={action.action_input.input} />
                ) : (
                  <pre className="action-args">
                    {formatActionArgs(action.action_input.input)}
                  </pre>
                )}
              </div>
            )}

            {/* Action output/observation */}
            {action.action_output && (
              <div className="observation-container">
                <div className="observation-header">
                  {action.status === 'error' ? '❌ Error:' : '✅ Result:'}
                </div>
                <ObservationContent
                  content={action.action_output}
                  metadata={action.action_metadata}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // If we're streaming, render stream events
  if (isStreaming && streamEvents && streamEvents.length > 0) {
    const renderedElements: React.ReactNode[] = [];
    const actionArgsAccumulator: { [key: string]: string } = {};
    const seenFinalActions = new Set<string>();

    streamEvents.forEach((event, eventIndex) => {
      if (event.type === 'action_streaming') {
        renderedElements.push(
          <div key={`action-streaming-${eventIndex}`} className="action-block streaming">
            <div className="action-header">⏳ Preparing {event.action}...</div>
          </div>
        );
      } else if (event.type === 'action') {
        const actionKey = `${event.action}-${event.id || eventIndex}`;
        seenFinalActions.add(actionKey);

        renderedElements.push(
          <div key={`action-${eventIndex}`} className="action-block">
            <div className="action-header">🔧 Using {event.action}</div>
            {event.input && (
              <div className="action-args-container">
                <div className="action-args-header">📝 Arguments:</div>
                {event.action === 'file_write' ? (
                  <FileWriteActionArgs args={event.input} />
                ) : (
                  <pre className="action-args">
                    {formatActionArgs(event.input)}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      } else if (event.type === 'action_args_chunk') {
        const actionId = event.action_id || `unknown-${eventIndex}`;

        // Skip if we've already seen the final action
        if (Array.from(seenFinalActions).some(key => key.includes(actionId))) {
          return;
        }

        // Accumulate chunks
        if (!actionArgsAccumulator[actionId]) {
          actionArgsAccumulator[actionId] = '';
        }
        actionArgsAccumulator[actionId] += event.chunk;

        // Render partial args
        renderedElements.push(
          <div key={`action-args-chunk-${eventIndex}`} className="action-block streaming">
            <div className="action-header">🔧 Using tool...</div>
            <div className="action-args-container">
              <div className="action-args-header">📝 Arguments:</div>
              <pre className="action-args partial">
                {actionArgsAccumulator[actionId]}
              </pre>
            </div>
          </div>
        );
      } else if (event.type === 'observation') {
        renderedElements.push(
          <div key={`observation-${eventIndex}`} className="observation-container">
            <div className="observation-header">
              {event.error ? '❌ Error:' : '✅ Result:'}
            </div>
            <ObservationContent
              content={event.output}
              metadata={event.metadata}
            />
          </div>
        );
      } else if (event.type === 'thought') {
        renderedElements.push(
          <div key={`thought-${eventIndex}`} className="thought-container">
            <div className="thought-header">💭 Thinking:</div>
            <div className="thought-content">{event.content}</div>
          </div>
        );
      }
    });

    return <div className="agent-actions streaming">{renderedElements}</div>;
  }

  return null;
};

export default AgentActionDisplay;