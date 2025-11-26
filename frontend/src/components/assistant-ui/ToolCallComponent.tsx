/**
 * ToolCallComponent - Native assistant-ui tool call component
 *
 * This component renders tool calls using assistant-ui's native styling
 * and structure, properly handling streaming and agent actions.
 */

import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

const getFileExtension = (filePath: string): string => {
  const match = filePath.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
};

const getLanguageFromExtension = (ext: string): string => {
  const langMap: { [key: string]: string } = {
    'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
    'py': 'python', 'rb': 'ruby', 'java': 'java', 'cpp': 'cpp', 'c': 'c',
    'cs': 'csharp', 'go': 'go', 'rs': 'rust', 'php': 'php', 'swift': 'swift',
    'kt': 'kotlin', 'scala': 'scala', 'sh': 'bash', 'bash': 'bash', 'zsh': 'bash',
    'yml': 'yaml', 'yaml': 'yaml', 'json': 'json', 'xml': 'xml', 'html': 'html',
    'css': 'css', 'scss': 'scss', 'sass': 'sass', 'sql': 'sql',
    'md': 'markdown', 'markdown': 'markdown',
  };
  return langMap[ext] || ext;
};

// Helper to format args as pretty JSON
const formatArgs = (args: any): string => {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return args;
    }
  }
  return JSON.stringify(args, null, 2);
};

// Helper to format result content
const formatResult = (result: any): string => {
  if (typeof result === 'string') {
    return result;
  }
  if (result?.result) {
    return formatResult(result.result);
  }
  if (result?.output) {
    return formatResult(result.output);
  }
  if (result?.data) {
    return formatResult(result.data);
  }
  return JSON.stringify(result, null, 2);
};

interface ToolCallComponentProps {
  toolCallId: string;
  toolName: string;
  args: any;
  result?: any;
  isError?: boolean;
  status?: { type: 'running' | 'complete' };
  addResult: (result: any) => void;
  resume: (payload: any) => void;
}

export const ToolCallComponent: React.FC<ToolCallComponentProps> = ({
  toolName,
  args,
  result,
  isError,
  status,
}) => {
  const isRunning = status?.type === 'running';
  const isFileWrite = toolName && (
    toolName.toLowerCase().includes('file_write') ||
    toolName.toLowerCase().includes('write_file') ||
    toolName.toLowerCase().includes('writefile')
  );

  // Parse args for file operations
  let filePath = '';
  let content = '';
  if (isFileWrite && args) {
    const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
    filePath = parsedArgs.file_path || parsedArgs.path || parsedArgs.filename || '';
    content = parsedArgs.content || parsedArgs.data || '';
  }

  return (
    <div style={{
      marginTop: '12px',
      marginBottom: '12px',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '1px solid #e5e7eb',
    }}>
      {/* Tool Header */}
      <div style={{
        padding: '12px 16px',
        background: isRunning ? 'linear-gradient(to right, #fef3c7, #fde68a)' : '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{ fontSize: '16px' }}>
          {isRunning ? '⚙️' : '🔧'}
        </span>
        <strong style={{ color: '#111827' }}>
          {toolName}
        </strong>
        {isRunning && (
          <span style={{
            fontSize: '12px',
            color: '#92400e',
            marginLeft: 'auto',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}>
            Running...
          </span>
        )}
      </div>

      {/* Tool Arguments */}
      {args && (
        <div style={{
          padding: '16px',
          background: '#ffffff',
          borderBottom: result !== undefined ? '1px solid #e5e7eb' : 'none',
        }}>
          {isFileWrite && filePath ? (
            <div>
              <div style={{
                marginBottom: '8px',
                fontSize: '14px',
                color: '#374151',
                fontWeight: 500,
              }}>
                Writing to: <code style={{
                  padding: '2px 6px',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                }}>{filePath}</code>
              </div>
              {content && (
                <SyntaxHighlighter
                  language={getLanguageFromExtension(getFileExtension(filePath))}
                  style={oneLight}
                  customStyle={{
                    margin: '8px 0',
                    borderRadius: '6px',
                    fontSize: '13px',
                    maxHeight: '400px',
                  }}
                >
                  {content}
                </SyntaxHighlighter>
              )}
            </div>
          ) : (
            <pre style={{
              margin: 0,
              padding: '12px',
              background: '#f9fafb',
              borderRadius: '6px',
              fontSize: '13px',
              fontFamily: 'monospace',
              overflow: 'auto',
              maxHeight: '300px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {formatArgs(args)}
            </pre>
          )}
        </div>
      )}

      {/* Tool Result */}
      {result !== undefined && (
        <div style={{
          padding: '16px',
          background: isError ? '#fef2f2' : '#f0fdf4',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
          }}>
            <span style={{ fontSize: '16px' }}>
              {isError ? '❌' : '✅'}
            </span>
            <strong style={{
              color: isError ? '#991b1b' : '#166534',
              fontSize: '14px',
            }}>
              {isError ? 'Error' : 'Success'}
            </strong>
          </div>
          <pre style={{
            margin: 0,
            padding: '12px',
            background: '#ffffff',
            border: `1px solid ${isError ? '#fca5a5' : '#86efac'}`,
            borderRadius: '6px',
            fontSize: '13px',
            fontFamily: 'monospace',
            overflow: 'auto',
            maxHeight: '300px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: isError ? '#7f1d1d' : '#14532d',
          }}>
            {formatResult(result)}
          </pre>
        </div>
      )}
    </div>
  );
};