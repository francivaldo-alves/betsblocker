import { create } from 'zustand';
import { blocklistSyncService, failedSync, SyncResult } from '@/services/blocklist-sync.service';
import { protectionService } from '@/services/protection.service';
import { SyncHistory } from '@/types';

interface SyncState {
  isSyncing: boolean;
  lastSync: SyncHistory | null;
  syncError: string | null;
  loadLastSync: () => Promise<void>;
  syncNow: () => Promise<SyncResult>;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  lastSync: null,
  syncError: null,

  loadLastSync: async () => {
    try {
      const history = await blocklistSyncService.getLastSyncInfo();
      set({ lastSync: history, syncError: null });
    } catch (err: any) {
      set({ syncError: err?.message || 'Erro ao carregar status de sincronização.' });
    }
  },

  syncNow: async () => {
    set({ isSyncing: true, syncError: null });
    try {
      const bundled = await blocklistSyncService.ensureBundledList();
      const result =
        bundled.success && blocklistSyncService.getRemoteConfig()
          ? await blocklistSyncService.syncRemote()
          : bundled;

      if (result.success) {
        // Sem isso, a VPN ativa continuaria filtrando com as regras anteriores
        await protectionService.updateBlocklist();
      }
      const lastHistory = await blocklistSyncService.getLastSyncInfo();
      set({
        isSyncing: false,
        lastSync: lastHistory,
        syncError: result.success ? null : result.error || 'Falha na sincronização.',
      });
      return result;
    } catch (err: any) {
      const message = err?.message || 'Falha inesperada na sincronização.';
      set({ isSyncing: false, syncError: message });
      return failedSync(message);
    }
  },
}));
