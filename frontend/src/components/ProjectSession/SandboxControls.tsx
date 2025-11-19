import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sandboxAPI } from '@/services/api';
import './SandboxControls.css';

interface SandboxControlsProps {
  sessionId: string;
}

export default function SandboxControls({ sessionId }: SandboxControlsProps) {
  const queryClient = useQueryClient();
  const [showCommandInput, setShowCommandInput] = useState(false);
  const [command, setCommand] = useState('');

  // Fetch sandbox status
  const { data: status } = useQuery({
    queryKey: ['sandbox-status', sessionId],
    queryFn: () => sandboxAPI.status(sessionId),
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Start sandbox mutation
  const startMutation = useMutation({
    mutationFn: () => sandboxAPI.start(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-status', sessionId] });
    },
  });

  // Stop sandbox mutation
  const stopMutation = useMutation({
    mutationFn: () => sandboxAPI.stop(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-status', sessionId] });
    },
  });

  // Reset sandbox mutation
  const resetMutation = useMutation({
    mutationFn: () => sandboxAPI.reset(sessionId),
  });

  // Execute command mutation
  const executeMutation = useMutation({
    mutationFn: (cmd: string) => sandboxAPI.execute(sessionId, cmd),
  });

  const handleExecute = () => {
    if (command.trim()) {
      executeMutation.mutate(command.trim());
      setCommand('');
      setShowCommandInput(false);
    }
  };

  const isRunning = status?.running || false;

  return (
    <div className="sandbox-controls">
      <div className="sandbox-status">
        <span className={`status-indicator ${isRunning ? 'running' : 'stopped'}`} />
        <span className="status-text">
          {isRunning ? 'Sandbox Running' : 'Sandbox Stopped'}
        </span>
      </div>

      <div className="sandbox-actions">
        {!isRunning ? (
          <button
            className="sandbox-btn start"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? 'Starting...' : 'Start Sandbox'}
          </button>
        ) : (
          <>
            <button
              className="sandbox-btn reset"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              title="Reset workspace to clean state"
            >
              Reset
            </button>
            <button
              className="sandbox-btn execute"
              onClick={() => setShowCommandInput(!showCommandInput)}
              title="Execute custom command"
            >
              Execute
            </button>
            <button
              className="sandbox-btn stop"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
            >
              Stop
            </button>
          </>
        )}
      </div>

      {showCommandInput && isRunning && (
        <div className="command-input-container">
          <input
            type="text"
            className="command-input"
            placeholder="Enter command (e.g., python script.py)"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
          />
          <button
            className="execute-btn"
            onClick={handleExecute}
            disabled={!command.trim() || executeMutation.isPending}
          >
            Run
          </button>
        </div>
      )}

      {executeMutation.data && (
        <div className="execution-result">
          <div className="result-header">Command Result (exit: {executeMutation.data.exit_code})</div>
          {executeMutation.data.stdout && (
            <pre className="result-stdout">{executeMutation.data.stdout}</pre>
          )}
          {executeMutation.data.stderr && (
            <pre className="result-stderr">{executeMutation.data.stderr}</pre>
          )}
        </div>
      )}
    </div>
  );
}
