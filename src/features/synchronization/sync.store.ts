import { create } from 'zustand';
import { blocklistSyncService, SyncResult } from '@/services/blocklist-sync.service';
import { SyncHistory } from '@/types';

interface SyncState {
  isSyncing: boolean;
  lastSync: SyncHistory | null;
  syncError: string | null;
  lastResult: SyncResult | null;
  loadLastSync: () => Promise<void>;
  syncInitialList: () => Promise<SyncResult>;
  syncCustomData: (manifest: unknown, listJsonString: string) => Promise<SyncResult>;
  clearError: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  lastSync: null,
  syncError: null,
  lastResult: null,

  loadLastSync: async () => {
    try {
      const history = await blocklistSyncService.getLastSyncInfo();
      set({ lastSync: history, syncError: null });
    } catch (err: any) {
      set({ syncError: err?.message || 'Erro ao carregar status de sincronização.' });
    }
  },

  syncInitialList: async () => {
    set({ isSyncing: true, syncError: null });
    try {
      const result = await blocklistSyncService.syncInitialBlocklist();
      const lastHistory = await blocklistSyncService.getLastSyncInfo();
      set({
        isSyncing: false,
        lastResult: result,
        lastSync: lastHistory,
        syncError: result.success ? null : result.error || 'Falha na sincronização.',
      });
      return result;
    } catch (err: any) {
      const message = err?.message || 'Falha inesperada na sincronização.';
      set({
        isSyncing: false,
        syncError: message,
        lastResult: {
          success: false,
          version: 0,
          totalRecords: 0,
          addedRecords: 0,
          updatedRecords: 0,
          removedRecords: 0,
          error: message,
        },
      });
      return {
        success: false,
        version: 0,
        totalRecords: 0,
        addedRecords: 0,
        updatedRecords: 0,
        removedRecords: 0,
        error: message,
      };
    }
  },

  syncCustomData: async (manifest: unknown, listJsonString: string) => {
    set({ isSyncing: true, syncError: null });
    try {
      const result = await blocklistSyncService.sync(manifest, listJsonString);
      const lastHistory = await blocklistSyncService.getLastSyncInfo();
      set({
        isSyncing: false,
        lastResult: result,
        lastSync: lastHistory,
        syncError: result.success ? null : result.error || 'Falha na sincronização.',
      });
      return result;
    } catch (err: any) {
      const message = err?.message || 'Falha ao sincronizar dados fornecidos.';
      set({
        isSyncing: false,
        syncError: message,
        lastResult: {
          success: false,
          version: 0,
          totalRecords: 0,
          addedRecords: 0,
          updatedRecords: 0,
          removedRecords: 0,
          error: message,
        },
      });
      return {
        success: false,
        version: 0,
        totalRecords: 0,
        addedRecords: 0,
        updatedRecords: 0,
        removedRecords: 0,
        error: message,
      };
    }
  },

  clearError: () => set({ syncError: null }),
}));
