import { create } from 'zustand';
import type { ChatSession, Message } from '@/types';

interface ChatState {
  activeSessionId: string | null;
  streamingMessage: string;
  isStreaming: boolean;
  setActiveSession: (sessionId: string | null) => void;
  appendStreamingMessage: (chunk: string) => void;
  setStreaming: (isStreaming: boolean) => void;
  clearStreamingMessage: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeSessionId: null,
  streamingMessage: '',
  isStreaming: false,

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  appendStreamingMessage: (chunk) =>
    set((state) => ({ streamingMessage: state.streamingMessage + chunk })),

  setStreaming: (isStreaming) => set({ isStreaming }),

  clearStreamingMessage: () => set({ streamingMessage: '' }),
}));
