import { create } from 'zustand';
import type { ChatSession, Message } from '@/types';

export type StreamEventType = 'chunk' | 'thought' | 'action' | 'action_streaming' | 'action_args_chunk' | 'observation';

export interface StreamEvent {
  type: StreamEventType;
  content: string;
  tool?: string;
  args?: any;
  partial_args?: string;  // For action_args_chunk events
  success?: boolean;
  status?: string;
  step?: number;
}

// Legacy AgentAction interface for backward compatibility
export interface AgentAction {
  type: 'thought' | 'action' | 'action_streaming' | 'observation';
  content: string;
  tool?: string;
  args?: any;
  success?: boolean;
  status?: string;
  step?: number;
}

interface ChatState {
  activeSessionId: string | null;
  streamingMessage: string;  // Keep for backward compat
  isStreaming: boolean;
  agentActions: AgentAction[];  // Keep for backward compat
  streamEvents: StreamEvent[];  // NEW: Unified event stream
  error: string | null;
  setActiveSession: (sessionId: string | null) => void;
  appendStreamingMessage: (chunk: string) => void;
  setStreaming: (isStreaming: boolean) => void;
  clearStreamingMessage: () => void;
  addAgentAction: (action: AgentAction) => void;
  clearAgentActions: () => void;
  addStreamEvent: (event: StreamEvent) => void;  // NEW
  clearStreamEvents: () => void;  // NEW
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeSessionId: null,
  streamingMessage: '',
  isStreaming: false,
  agentActions: [],
  streamEvents: [],
  error: null,

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  appendStreamingMessage: (chunk) =>
    set((state) => ({ streamingMessage: state.streamingMessage + chunk })),

  setStreaming: (isStreaming) => set({ isStreaming }),

  clearStreamingMessage: () => set({ streamingMessage: '' }),

  addAgentAction: (action) =>
    set((state) => ({ agentActions: [...state.agentActions, action] })),

  clearAgentActions: () => set({ agentActions: [] }),

  addStreamEvent: (event) =>
    set((state) => ({ streamEvents: [...state.streamEvents, event] })),

  clearStreamEvents: () => set({ streamEvents: [] }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),
}));
