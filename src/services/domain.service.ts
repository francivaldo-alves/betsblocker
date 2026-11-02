import { validateAndNormalizeDomain } from '@/utils/domain-validator';
import {
  domainRepository,
  exceptionRepository,
  settingsRepository,
  DomainListFilter,
} from '@/database';
import { BlockedDomain, DomainException } from '@/types';
import { assertUnlocked } from './commitment.service';

const USER_MANUAL_SOURCE_ID = 3;

export class DomainService {
  /**
   * Adiciona um domínio manualmente pelo usuário
   */
  async addUserDomain(
    rawDomain: string,
    evidence: string,
    category = 'restricted_gambling'
  ): Promise<BlockedDomain> {
    const validation = validateAndNormalizeDomain(rawDomain);
    if (!validation.isValid || !validation.normalized) {
      throw new Error(validation.error || 'Domínio inválido.');
    }

    const domain = validation.normalized;
    const existing = await domainRepository.findByDomain(domain);

    const nowIso = new Date().toISOString();

    // Pedir o bloqueio cancela uma liberação anterior do mesmo domínio
    await exceptionRepository.removeException(domain);

    if (existing) {
      // Se já existe e estava com status ALLOW ou PENDING, atualiza para USER_ADDED
      await domainRepository.updateClassification(
        existing.id,
        'USER_ADDED',
        'BLOCK',
        `Adicionado pelo usuário em ${nowIso}. Evidência: ${evidence}`
      );
      const updated = await domainRepository.findById(existing.id);
      return updated!;
    }

    const newId = await domainRepository.upsert({
      domain,
      category,
      classification_status: 'USER_ADDED',
      block_status: 'BLOCK',
      source_id: USER_MANUAL_SOURCE_ID,
      evidence: `Inclusão manual: ${evidence}`,
      verified_at: nowIso,
    });

    const created = await domainRepository.findById(newId);
    return created!;
  }

  /**
   * Cadastra uma liberação manual (exceção / allowlist)
   */
  async addException(
    rawDomain: string,
    reason: string,
    expiresAt?: string | null
  ): Promise<DomainException> {
    assertUnlocked(await settingsRepository.getSettings());

    const validation = validateAndNormalizeDomain(rawDomain);
    if (!validation.isValid || !validation.normalized) {
      throw new Error(validation.error || 'Domínio inválido.');
    }

    const domain = validation.normalized;
    await exceptionRepository.addException(domain, reason, expiresAt);

    const exception = await exceptionRepository.findByDomain(domain);
    return exception!;
  }

  /**
   * Remove uma exceção manual: o domínio volta a seguir a própria classificação
   */
  async removeException(rawDomain: string): Promise<boolean> {
    const validation = validateAndNormalizeDomain(rawDomain);
    const domain = validation.normalized || rawDomain.toLowerCase().trim();
    return exceptionRepository.removeException(domain);
  }

  /**
   * Lista domínios bloqueados com filtros
   */
  async listBlockedDomains(filter: DomainListFilter = {}) {
    return domainRepository.listBlocked(filter);
  }

  /**
   * Conta a quantidade de domínios bloqueados
   */
  async countBlockedDomains(search?: string, category?: string) {
    return domainRepository.countBlocked(search, category);
  }

  /**
   * Lista domínios pendentes de análise
   */
  async listPendingDomains(limit = 50, offset = 0) {
    return domainRepository.listPending(limit, offset);
  }

  async countPendingDomains() {
    return domainRepository.countPending();
  }

  /**
   * Retorna os domínios que devem ser efetivamente bloqueados no motor de rede
   */
  async getActiveBlocklist(): Promise<string[]> {
    const settings = await settingsRepository.getSettings();
    return domainRepository.getActiveBlockedDomains(settings.block_licensed === 1);
  }
}

export const domainService = new DomainService();
