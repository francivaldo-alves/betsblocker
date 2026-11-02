import { create } from 'zustand';
import { syncRepository, eventRepository } from '@/database';
import { protectionService } from '@/services/protection.service';
import { SyncHistory, BlockEvent } from '@/types';

interface HistoryState {
  syncHistory: SyncHistory[];
  blockEvents: BlockEvent[];
  todayBlockedCount: number;
  isLoading: boolean;
  loadSyncHistory: () => Promise<void>;
  loadBlockEvents: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  syncHistory: [],
  blockEvents: [],
  todayBlockedCount: 0,
  isLoading: false,

  loadSyncHistory: async () => {
    set({ isLoading: true });
    try {
      const history = await syncRepository.listHistory(50);
      set({ syncHistory: history, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadBlockEvents: async () => {
    set({ isLoading: true });
    try {
      await protectionService.importBlockEvents();
      const [events, countToday] = await Promise.all([
        eventRepository.listRecent(50),
        eventRepository.countToday(),
      ]);
      set({ blockEvents: events, todayBlockedCount: countToday, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
