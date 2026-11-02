import { create } from 'zustand';
import { settingsRepository } from '@/database';
import { protectionService } from '@/services/protection.service';
import {
  assertUnlocked,
  weakensProtection,
} from '@/services/commitment.service';
import { ProtectionSettings, ProtectionOperationalStatus } from '@/types';

interface ProtectionState {
  settings: ProtectionSettings;
  operationalStatus: ProtectionOperationalStatus;
  loadSettings: () => Promise<void>;
  toggleProtection: () => Promise<{ success: boolean; active: boolean; message?: string }>;
  updateSettings: (patch: Partial<Omit<ProtectionSettings, 'id'>>) => Promise<void>;
  requestUnlock: () => Promise<void>;
  cancelUnlock: () => Promise<void>;
}

export const useProtectionStore = create<ProtectionState>((set, get) => ({
  settings: {
    id: 1,
    protection_enabled: 0,
    notification_enabled: 1,
    automatic_sync: 1,
    block_ads: 0,
    block_licensed: 1,
    block_mode: 'STRICT',
    commitment_delay_hours: 0,
    unlock_requested_at: null,
  },
  operationalStatus: 'STOPPED',

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
    // Decide pelo estado real: depois de uma queda, o botão religa em vez de desligar
    const shouldEnable = (await protectionService.getStatus()) !== 'RUNNING';

    try {
      if (shouldEnable) {
        await protectionService.startProtection();
      } else {
        await protectionService.stopProtection();
      }
      return { success: true, active: shouldEnable };
    } catch (err: any) {
      // Honestidade operacional: não simula proteção
      return {
        success: false,
        active: !shouldEnable,
        message: err?.message || 'Não foi possível alterar a proteção.',
      };
    } finally {
      await get().loadSettings();
    }
  },

  updateSettings: async (patch) => {
    const current = await settingsRepository.getSettings();
    if (weakensProtection(current, patch)) {
      assertUnlocked(current);
    }

    const updated = await settingsRepository.updateSettings(patch);
    set({ settings: updated });
    await protectionService.updateBlocklist();
  },

  requestUnlock: async () => {
    const updated = await settingsRepository.updateSettings({
      unlock_requested_at: new Date().toISOString(),
    });
    set({ settings: updated });
  },

  cancelUnlock: async () => {
    const updated = await settingsRepository.updateSettings({ unlock_requested_at: null });
    set({ settings: updated });
  },
}));
