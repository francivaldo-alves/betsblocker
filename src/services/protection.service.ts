import { ProtectionService, ProtectionOperationalStatus } from '@/types';
import { blocklistSyncService } from './blocklist-sync.service';
import { assertUnlocked } from './commitment.service';
import { domainService } from './domain.service';
import { settingsRepository, eventRepository, exceptionRepository } from '@/database';
import nativeVpnBlocker, {
  NativeBlockEvent,
  NativeDomainDecision,
  VpnBlockerNativeModule,
} from '../../modules/expo-vpn-blocker/src';

const START_TIMEOUT_MS = 3000;
const START_POLL_MS = 100;
const NEVER_EXPIRES = 0;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const UNAVAILABLE_MESSAGE =
  'A proteção de rede não está disponível aqui: ela exige o aplicativo instalado no Android, fora do Expo Go.';

/**
 * Motor de proteção. Sem o módulo nativo não existe proteção, então nada aqui finge sucesso:
 * operações essenciais falham e as demais não têm o que atualizar.
 */
export class ProtectionServiceImpl implements ProtectionService {
  constructor(private native: VpnBlockerNativeModule | null = nativeVpnBlocker) {}

  private requireNative(): VpnBlockerNativeModule {
    if (!this.native) {
      throw new Error(UNAVAILABLE_MESSAGE);
    }
    return this.native;
  }

  async requestPermission(): Promise<boolean> {
    return this.requireNative().requestVpnPermission();
  }

  async startProtection(): Promise<void> {
    const native = this.requireNative();

    if (!(await native.requestVpnPermission())) {
      await settingsRepository.updateSettings({ protection_enabled: 0 });
      throw new Error('Permissão de conexão VPN não foi concedida pelo usuário no Android.');
    }

    await blocklistSyncService.ensureBundledList();
    const activeDomains = await domainService.getActiveBlocklist();
    if (activeDomains.length === 0) {
      throw new Error('A lista de bloqueio está vazia: a proteção não teria efeito.');
    }

    await this.applyFilterOptions();
    await native.startVpn(activeDomains);
    await this.waitUntilRunning(native);
    await settingsRepository.updateSettings({ protection_enabled: 1 });
  }

  // startVpn só pede o início do serviço: a confirmação vem do estado real da VPN
  private async waitUntilRunning(native: VpnBlockerNativeModule): Promise<void> {
    for (let elapsed = 0; elapsed < START_TIMEOUT_MS; elapsed += START_POLL_MS) {
      if (await native.isVpnRunning()) return;
      await wait(START_POLL_MS);
    }
    const reason = await native.getLastStartError();
    throw new Error(reason || 'O serviço de VPN não iniciou a tempo.');
  }

  async stopProtection(): Promise<void> {
    assertUnlocked(await settingsRepository.getSettings());
    await this.requireNative().stopVpn();
    await settingsRepository.updateSettings({ protection_enabled: 0 });
  }

  async getStatus(): Promise<ProtectionOperationalStatus> {
    const running = (await this.native?.isVpnRunning()) ?? false;
    if (running) return 'RUNNING';

    const settings = await settingsRepository.getSettings();
    // O usuário quer a proteção ligada e ela não está: interrupção, não desligamento
    return settings.protection_enabled === 1 ? 'ERROR' : 'STOPPED';
  }

  /**
   * Religa a VPN que caiu, desde que isso não exija abrir a tela de permissão do sistema
   */
  async restoreIfInterrupted(): Promise<void> {
    if (!this.native || (await this.getStatus()) !== 'ERROR') return;
    if (!(await this.native.hasVpnPermission())) return;
    await this.startProtection();
  }

  async updateBlocklist(): Promise<void> {
    if (!this.native) return;
    await this.native.updateRules(await domainService.getActiveBlocklist());
    await this.applyFilterOptions();
  }

  async getRecentDomains(): Promise<string[]> {
    return this.native?.getRecentDomains() ?? [];
  }

  private async applyFilterOptions(): Promise<void> {
    if (!this.native) return;
    const settings = await settingsRepository.getSettings();
    const exceptions: Record<string, number> = {};
    for (const exception of await exceptionRepository.listAll()) {
      exceptions[exception.domain] = exception.expires_at
        ? new Date(exception.expires_at).getTime()
        : NEVER_EXPIRES;
    }

    await this.native.setFilterOptions(
      settings.block_ads === 1,
      exceptions,
      settings.block_mode === 'AUDIT',
      settings.notification_enabled === 1
    );
  }

  /**
   * Traz para o SQLite os bloqueios feitos pelo motor nativo enquanto o app estava fechado
   */
  async importBlockEvents(): Promise<void> {
    if (!this.native) return;
    const events: NativeBlockEvent[] = await this.native.drainBlockEvents();
    await eventRepository.recordEvents(
      events.map((event) => ({
        domain: event.domain,
        blockedAt: new Date(event.blockedAt).toISOString(),
        reason: event.audited
          ? 'Modo auditoria: acesso registrado, sem bloqueio.'
          : 'Acesso bloqueado pela lista de sites de apostas.',
      }))
    );
  }

  /**
   * Pergunta ao motor nativo o que aconteceria com o domínio, sem registrar evento
   */
  async checkDomain(domain: string): Promise<NativeDomainDecision> {
    return this.requireNative().checkDomain(domain.toLowerCase().trim());
  }
}

export const protectionService = new ProtectionServiceImpl();
