import {
  ProtectionService,
  ProtectionOperationalStatus,
  ProtectionStats,
  BlockMode,
} from '@/types';
import { domainService } from './domain.service';
import { settingsRepository, eventRepository } from '@/database';

/**
 * Interface para adaptadores de baixo nível (motores nativos de VPN / DNS Filter).
 * Permite plugar bibliotecas de mercado compatíveis com Expo Development Build
 * sem alterar a lógica de negócios ou a interface do usuário.
 */
export interface VpnEngineDriver {
  isAvailable(): boolean;
  requestVpnPermission(): Promise<boolean>;
  startVpn(blockedDomains: string[], mode: BlockMode): Promise<void>;
  stopVpn(): Promise<void>;
  getVpnStatus(): Promise<ProtectionOperationalStatus>;
  updateRules(blockedDomains: string[]): Promise<void>;
}

/**
 * Driver nativo desacoplado para quando o módulo de VPN do Android
 * estiver linkado no build de desenvolvimento (EAS Build / Dev Client).
 */
export class AndroidNativeVpnDriver implements VpnEngineDriver {
  isAvailable(): boolean {
    // Detecta se o módulo nativo com config plugin está presente no runtime
    return false;
  }

  async requestVpnPermission(): Promise<boolean> {
    // No Android real, chama o Intent VpnService.prepare(context)
    return false;
  }

  async startVpn(blockedDomains: string[], mode: BlockMode): Promise<void> {
    throw new Error(
      'Módulo nativo de VPN Android não linkado no ambiente atual. Utilize um Expo Development Build com o pacote configurado.'
    );
  }

  async stopVpn(): Promise<void> {
    // Parada do serviço Android
  }

  async getVpnStatus(): Promise<ProtectionOperationalStatus> {
    return 'STOPPED';
  }

  async updateRules(blockedDomains: string[]): Promise<void> {
    // Atualização em tempo de execução das regras de DNS
  }
}

/**
 * Implementação do serviço de proteção seguindo o contrato ProtectionService
 */
export class ProtectionServiceImpl implements ProtectionService {
  private driver: VpnEngineDriver;
  private currentStatus: ProtectionOperationalStatus = 'STOPPED';

  constructor(driver?: VpnEngineDriver) {
    this.driver = driver || new AndroidNativeVpnDriver();
  }

  /**
   * Define um novo driver de execução (útil para injeção de dependência)
   */
  setDriver(driver: VpnEngineDriver) {
    this.driver = driver;
  }

  async requestPermission(): Promise<boolean> {
    if (!this.driver.isAvailable()) {
      // Reporta claramente que o ambiente necessita de build nativo
      return false;
    }
    return this.driver.requestVpnPermission();
  }

  async startProtection(): Promise<void> {
    const settings = await settingsRepository.getSettings();

    if (!this.driver.isAvailable()) {
      this.currentStatus = 'STOPPED';
      await settingsRepository.updateSettings({ protection_enabled: 0 });
      throw new Error(
        'O motor nativo de VPN local requer um Expo Development Build gerado via EAS Build no Android. Não simulamos proteção inoperante.'
      );
    }

    this.currentStatus = 'STARTING';
    const activeDomains = await domainService.getActiveBlocklist();

    try {
      await this.driver.startVpn(activeDomains, settings.block_mode);
      this.currentStatus = 'RUNNING';
      await settingsRepository.updateSettings({ protection_enabled: 1 });
    } catch (err: any) {
      this.currentStatus = 'ERROR';
      await settingsRepository.updateSettings({ protection_enabled: 0 });
      throw new Error(`Falha ao iniciar o serviço de proteção local: ${err?.message || err}`);
    }
  }

  async stopProtection(): Promise<void> {
    try {
      if (this.driver.isAvailable()) {
        await this.driver.stopVpn();
      }
    } finally {
      this.currentStatus = 'STOPPED';
      await settingsRepository.updateSettings({ protection_enabled: 0 });
    }
  }

  async getStatus(): Promise<ProtectionOperationalStatus> {
    const settings = await settingsRepository.getSettings();

    if (!this.driver.isAvailable()) {
      return 'STOPPED';
    }

    if (settings.protection_enabled === 0) {
      return 'STOPPED';
    }

    return this.driver.getVpnStatus();
  }

  async updateBlocklist(): Promise<void> {
    const activeDomains = await domainService.getActiveBlocklist();
    if (this.driver.isAvailable()) {
      await this.driver.updateRules(activeDomains);
    }
  }

  /**
   * Processa uma tentativa de acesso capturada e audita no SQLite
   */
  async handleInterceptedDomain(domain: string, reason: string): Promise<void> {
    await eventRepository.recordEvent(
      domain,
      `Bloqueio de rede efetuado pelo motor local. Motivo: ${reason}`
    );
  }
}

export const protectionService = new ProtectionServiceImpl();
