import { validateAndNormalizeDomain } from '@/utils/domain-validator';
import {
  domainRepository,
  exceptionRepository,
  sourceRepository,
  reviewRepository,
  DomainListFilter,
} from '@/database';
import { BlockedDomain, DomainException, DomainReview, DomainSource } from '@/types';

export interface DomainDetailView {
  domain: BlockedDomain;
  source: DomainSource | null;
  reviews: DomainReview[];
  exception: DomainException | null;
}

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
      source_id: 3, // Inclusão Manual do Usuário
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
    const validation = validateAndNormalizeDomain(rawDomain);
    if (!validation.isValid || !validation.normalized) {
      throw new Error(validation.error || 'Domínio inválido.');
    }

    const domain = validation.normalized;

    // Registra na tabela de exceções
    await exceptionRepository.addException(domain, reason, expiresAt);

    // Se estiver cadastrado na tabela de domínios, altera a decisão de bloqueio para ALLOW
    const existing = await domainRepository.findByDomain(domain);
    if (existing) {
      await domainRepository.updateClassification(
        existing.id,
        existing.classification_status,
        'ALLOW',
        `Exceção aplicada: ${reason}`
      );
    }

    const exception = await exceptionRepository.findByDomain(domain);
    return exception!;
  }

  /**
   * Remove uma exceção manual e restaura o bloqueio se o domínio estiver classificado para bloqueio
   */
  async removeException(rawDomain: string): Promise<boolean> {
    const validation = validateAndNormalizeDomain(rawDomain);
    const domain = validation.normalized || rawDomain.toLowerCase().trim();

    const removed = await exceptionRepository.removeException(domain);

    // Restaura o block_status conforme o status regulatório
    const existing = await domainRepository.findByDomain(domain);
    if (existing) {
      const shouldBlock =
        existing.classification_status === 'UNAUTHORIZED_CONFIRMED' ||
        existing.classification_status === 'USER_ADDED';

      await domainRepository.updateClassification(
        existing.id,
        existing.classification_status,
        shouldBlock ? 'BLOCK' : 'ALLOW'
      );
    }

    return removed;
  }

  /**
   * Obtém os detalhes completos de um domínio com fonte e revisões
   */
  async getDomainDetails(domainId: number): Promise<DomainDetailView | null> {
    const domain = await domainRepository.findById(domainId);
    if (!domain) {
      return null;
    }

    const [source, reviews, exception] = await Promise.all([
      sourceRepository.findById(domain.source_id),
      reviewRepository.listByDomainId(domain.id),
      exceptionRepository.findByDomain(domain.domain),
    ]);

    return {
      domain,
      source,
      reviews,
      exception,
    };
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

  /**
   * Retorna os domínios que devem ser efetivamente bloqueados no motor de rede
   */
  async getActiveBlocklist(): Promise<string[]> {
    return domainRepository.getActiveBlockedDomains();
  }
}

export const domainService = new DomainService();
