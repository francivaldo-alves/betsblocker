import {
  ProtectionService,
  ProtectionOperationalStatus,
  BlockMode,
} from '@/types';
import { domainService } from './domain.service';
import { settingsRepository, eventRepository, exceptionRepository } from '@/database';
import { matchesBlockedDomain } from '@/utils/domain-validator';

/**
 * Interface para adaptadores de motor de proteção
 */
export interface VpnEngineDriver {
  isAvailable(): boolean;
  requestVpnPermission(): Promise<boolean>;
  startVpn(blockedDomains: string[], mode: BlockMode): Promise<void>;
  stopVpn(): Promise<void>;
  getVpnStatus(): Promise<ProtectionOperationalStatus>;
  updateRules(blockedDomains: string[]): Promise<void>;
  checkDomain(domain: string): { blocked: boolean; matchedRule?: string };
}

/**
 * Driver nativo de proteção local com filtragem de domínios em memória e persistência SQLite.
 */
export class AndroidNativeVpnDriver implements VpnEngineDriver {
  private activeRules: Set<string> = new Set();
  private wildcardRules: string[] = [];
  private isRunning = false;
  private currentMode: BlockMode = 'STRICT';

  isAvailable(): boolean {
    return true;
  }

  async requestVpnPermission(): Promise<boolean> {
    return true;
  }

  async startVpn(blockedDomains: string[], mode: BlockMode): Promise<void> {
    this.currentMode = mode;
    this.activeRules.clear();
    this.wildcardRules = [];

    for (const rule of blockedDomains) {
      const clean = rule.toLowerCase().trim();
      if (clean.startsWith('*.')) {
        this.wildcardRules.push(clean);
      } else {
        this.activeRules.add(clean);
      }
    }

    this.isRunning = true;
  }

  async stopVpn(): Promise<void> {
    this.isRunning = false;
    this.activeRules.clear();
    this.wildcardRules = [];
  }

  async getVpnStatus(): Promise<ProtectionOperationalStatus> {
    return this.isRunning ? 'RUNNING' : 'STOPPED';
  }

  async updateRules(blockedDomains: string[]): Promise<void> {
    this.activeRules.clear();
    this.wildcardRules = [];

    for (const rule of blockedDomains) {
      const clean = rule.toLowerCase().trim();
      if (clean.startsWith('*.')) {
        this.wildcardRules.push(clean);
      } else {
        this.activeRules.add(clean);
      }
    }
  }

  checkDomain(domain: string): { blocked: boolean; matchedRule?: string } {
    if (!this.isRunning && this.currentMode !== 'AUDIT') {
      return { blocked: false };
    }

    const cleanTarget = domain.toLowerCase().trim();

    // 1. Verifica correspondência direta ou subdomínio em regras exatas
    for (const rule of this.activeRules) {
      if (matchesBlockedDomain(cleanTarget, rule)) {
        return { blocked: true, matchedRule: rule };
      }
    }

    // 2. Verifica correspondência em regras curinga (*.bet, *.casino, etc.)
    for (const wildcard of this.wildcardRules) {
      if (matchesBlockedDomain(cleanTarget, wildcard)) {
        return { blocked: true, matchedRule: wildcard };
      }
    }

    return { blocked: false };
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

  setDriver(driver: VpnEngineDriver) {
    this.driver = driver;
  }

  async requestPermission(): Promise<boolean> {
    return this.driver.requestVpnPermission();
  }

  async startProtection(): Promise<void> {
    const settings = await settingsRepository.getSettings();
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
      await this.driver.stopVpn();
    } finally {
      this.currentStatus = 'STOPPED';
      await settingsRepository.updateSettings({ protection_enabled: 0 });
    }
  }

  async getStatus(): Promise<ProtectionOperationalStatus> {
    const settings = await settingsRepository.getSettings();
    if (settings.protection_enabled === 0) {
      return 'STOPPED';
    }
    return this.driver.getVpnStatus();
  }

  async updateBlocklist(): Promise<void> {
    const activeDomains = await domainService.getActiveBlocklist();
    await this.driver.updateRules(activeDomains);
  }

  /**
   * Avalia um domínio em tempo real contra as regras ativas e exceções locais
   */
  async evaluateAndIntercept(domain: string): Promise<{
    allowed: boolean;
    reason: string;
    matchedRule?: string;
  }> {
    const cleanDomain = domain.toLowerCase().trim();

    // 1. Verifica se possui exceção ativa no banco SQLite
    const isExcepted = await exceptionRepository.isDomainExcepted(cleanDomain);
    if (isExcepted) {
      return {
        allowed: true,
        reason: 'Domínio liberado manualmente por regra de exceção do usuário.',
      };
    }

    // 2. Consulta o motor de filtragem de regras
    const check = this.driver.checkDomain(cleanDomain);

    if (check.blocked && check.matchedRule) {
      const reason = `Intervenção do BetsBlocker: Domínio restrito identificado pela regra "${check.matchedRule}".`;

      // Registra evento de bloqueio no SQLite
      await eventRepository.recordEvent(cleanDomain, reason);

      return {
        allowed: false,
        reason,
        matchedRule: check.matchedRule,
      };
    }

    return {
      allowed: true,
      reason: 'Domínio sem correspondência em listas de apostas não autorizadas.',
    };
  }
}

export const protectionService = new ProtectionServiceImpl();
