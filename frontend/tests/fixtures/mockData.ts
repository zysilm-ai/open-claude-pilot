import type {
  Project,
  ChatSession,
  Message,
  AgentConfiguration,
} from '@/types';

export const mockProject: Project = {
  id: 'test-project-id',
  name: 'Test Project',
  description: 'A test project for unit testing',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockProjects: Project[] = [
  mockProject,
  {
    id: 'test-project-id-2',
    name: 'Second Test Project',
    description: 'Another test project',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
];

export const mockChatSession: ChatSession = {
  id: 'test-session-id',
  project_id: 'test-project-id',
  name: 'Test Chat Session',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  container_id: null,
  status: 'active',
  environment_type: null,
};

export const mockChatSessions: ChatSession[] = [
  mockChatSession,
  {
    id: 'test-session-id-2',
    project_id: 'test-project-id',
    name: 'Second Test Session',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    container_id: 'container-123',
    status: 'active',
    environment_type: 'python',
  },
];

export const mockUserMessage: Message = {
  id: 'message-1',
  chat_session_id: 'test-session-id',
  role: 'user',
  content: 'Hello, this is a test message',
  created_at: '2024-01-01T00:00:00Z',
  message_metadata: {},
};

export const mockAssistantMessage: Message = {
  id: 'message-2',
  chat_session_id: 'test-session-id',
  role: 'assistant',
  content: 'Hello! I am here to help you with your code.',
  created_at: '2024-01-01T00:00:10Z',
  message_metadata: {},
};

export const mockMessages: Message[] = [
  mockUserMessage,
  mockAssistantMessage,
  {
    id: 'message-3',
    chat_session_id: 'test-session-id',
    role: 'user',
    content: 'Can you help me write a function?',
    created_at: '2024-01-01T00:00:20Z',
    message_metadata: {},
  },
  {
    id: 'message-4',
    chat_session_id: 'test-session-id',
    role: 'assistant',
    content: 'Of course! What kind of function would you like to create?',
    created_at: '2024-01-01T00:00:30Z',
    message_metadata: {
      agent_actions: [
        {
          id: 'action-1',
          action_type: 'code_interpreter',
          action_input: { code: 'print("hello")' },
          action_output: 'hello',
          status: 'success',
          created_at: '2024-01-01T00:00:30Z',
        },
      ],
    },
  },
];

export const mockAgentConfig: AgentConfiguration = {
  id: 'config-1',
  project_id: 'test-project-id',
  agent_type: 'react',
  system_instructions: 'You are a helpful coding assistant.',
  enabled_tools: ['code_interpreter', 'file_write', 'bash'],
  llm_provider: 'openai',
  llm_model: 'gpt-4',
  llm_config: {
    temperature: 0.7,
    max_tokens: 4000,
  },
};

export const mockStreamEvent = {
  chunk: {
    type: 'chunk' as const,
    content: 'This is a streaming chunk',
  },
  action: {
    type: 'action' as const,
    content: 'Using tool: file_write',
    tool: 'file_write',
    args: { file_path: '/test.txt', content: 'test content' },
    step: 1,
  },
  observation: {
    type: 'observation' as const,
    content: 'File written successfully',
    success: true,
    step: 1,
  },
  error: {
    type: 'error' as const,
    content: 'An error occurred',
  },
};
