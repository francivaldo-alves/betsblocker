import { settingsRepository } from '@/database';
import { blocklistSyncService, SyncResult } from './blocklist-sync.service';
import { protectionService } from './protection.service';

const changedRules = (result: SyncResult) => result.success && !result.upToDate;

/**
 * Coloca o app em dia ao abrir ou voltar ao primeiro plano. Cada etapa é independente:
 * a falha de uma, como a falta de internet, não impede as demais.
 */
export async function refreshAppState(): Promise<void> {
  const steps = [
    async () => {
      if (changedRules(await blocklistSyncService.ensureBundledList())) {
        await protectionService.updateBlocklist();
      }
    },
    () => protectionService.importBlockEvents(),
    () => protectionService.restoreIfInterrupted(),
    async () => {
      const settings = await settingsRepository.getSettings();
      if (settings.automatic_sync === 0 || !(await blocklistSyncService.isRemoteCheckDue())) return;
      if (changedRules(await blocklistSyncService.syncRemote())) {
        await protectionService.updateBlocklist();
      }
    },
  ];

  for (const step of steps) {
    try {
      await step();
    } catch (error: any) {
      console.warn('Falha ao atualizar o estado do app:', error?.message || error);
    }
  }
}
