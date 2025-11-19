import { create } from 'zustand';

interface UIState {
  isCreateProjectModalOpen: boolean;
  setCreateProjectModalOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isCreateProjectModalOpen: false,
  setCreateProjectModalOpen: (open) => set({ isCreateProjectModalOpen: open }),
}));
