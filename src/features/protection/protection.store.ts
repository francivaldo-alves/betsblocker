import { create } from 'zustand';
import { settingsRepository } from '@/database';
import { protectionService } from '@/services/protection.service';
import { ProtectionSettings, ProtectionOperationalStatus } from '@/types';

interface ProtectionState {
  settings: ProtectionSettings;
  operationalStatus: ProtectionOperationalStatus;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  toggleProtection: () => Promise<{ success: boolean; active: boolean; message?: string }>;
  updateSettings: (patch: Partial<Omit<ProtectionSettings, 'id'>>) => Promise<void>;
  setOperationalStatus: (status: ProtectionOperationalStatus) => void;
}

export const useProtectionStore = create<ProtectionState>((set, get) => ({
  settings: {
    id: 1,
    protection_enabled: 0,
    notification_enabled: 1,
    automatic_sync: 1,
    block_mode: 'STRICT',
    theme: 'system',
  },
  operationalStatus: 'STOPPED',
  isLoading: false,

  loadSettings: async () => {
    try {
      const data = await settingsRepository.getSettings();
      const status = await protectionService.getStatus();
      set({
        settings: data,
        operationalStatus: status,
      });
    } catch {
      // Defaults seguros
    }
  },

  toggleProtection: async () => {
    const current = get().settings;
    const shouldEnable = current.protection_enabled === 0;

    if (shouldEnable) {
      try {
        await protectionService.startProtection();
        const updated = await settingsRepository.getSettings();
        set({ settings: updated, operationalStatus: 'RUNNING' });
        return { success: true, active: true };
      } catch (err: any) {
        // Honestidade operacional: não simula proteção
        const updated = await settingsRepository.getSettings();
        set({ settings: updated, operationalStatus: 'STOPPED' });
        return {
          success: false,
          active: false,
          message:
            err?.message ||
            'Não foi possível iniciar a proteção nativa. Certifique-se de executar em um Expo Development Build.',
        };
      }
    } else {
      await protectionService.stopProtection();
      const updated = await settingsRepository.getSettings();
      set({ settings: updated, operationalStatus: 'STOPPED' });
      return { success: true, active: false };
    }
  },

  updateSettings: async (patch) => {
    const updated = await settingsRepository.updateSettings(patch);
    set({ settings: updated });
    // Atualiza regras se o modo de bloqueio foi modificado
    if (patch.block_mode) {
      await protectionService.updateBlocklist();
    }
  },

  setOperationalStatus: (status) => set({ operationalStatus: status }),
}));
