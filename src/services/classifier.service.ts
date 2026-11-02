import { ClassificationStatus, BlockStatus, ReviewStatus, BlockedDomain } from '@/types';
import { domainRepository, reviewRepository, exceptionRepository } from '@/database';

export interface ClassificationDecision {
  classificationStatus: ClassificationStatus;
  blockStatus: BlockStatus;
  rationale: string;
}

export class ClassifierService {
  /**
   * Determina a ação de bloqueio com base na classificação e nas exceções locais.
   * Regra: Decisão regulatória e decisão de bloqueio são armazenadas separadamente.
   */
  resolveBlockStatus(
    classificationStatus: ClassificationStatus,
    isExcepted: boolean
  ): BlockStatus {
    if (isExcepted || classificationStatus === 'EXCEPTION' || classificationStatus === 'AUTHORIZED') {
      return 'ALLOW';
    }

    if (
      classificationStatus === 'UNAUTHORIZED_CONFIRMED' ||
      classificationStatus === 'USER_ADDED'
    ) {
      return 'BLOCK';
    }

    // Domínios em PENDING_REVIEW: por padrão não são bloqueados sem evidência, a menos que o usuário determine
    return 'ALLOW';
  }

  /**
   * Avalia a classificação de um domínio com base em dados de fontes e evidências
   */
  evaluateDomain(
    declaredStatus: ClassificationStatus,
    hasOfficialEvidence: boolean
  ): ClassificationDecision {
    // Proibição estrita: não usar substrings ("bet", "aposta", etc.) para classificar
    if (declaredStatus === 'AUTHORIZED') {
      return {
        classificationStatus: 'AUTHORIZED',
        blockStatus: 'ALLOW',
        rationale: 'Domínio identificado como autorizado conforme fonte oficial válida.',
      };
    }

    if (declaredStatus === 'UNAUTHORIZED_CONFIRMED') {
      return {
        classificationStatus: 'UNAUTHORIZED_CONFIRMED',
        blockStatus: 'BLOCK',
        rationale: hasOfficialEvidence
          ? 'Domínio classificado como não autorizado com evidência oficial verificável.'
          : 'Domínio classificado como não autorizado por fonte pública com evidência registrada.',
      };
    }

    if (declaredStatus === 'USER_ADDED') {
      return {
        classificationStatus: 'USER_ADDED',
        blockStatus: 'BLOCK',
        rationale: 'Domínio adicionado manualmente pelo usuário para bloqueio local.',
      };
    }

    if (declaredStatus === 'EXCEPTION') {
      return {
        classificationStatus: 'EXCEPTION',
        blockStatus: 'ALLOW',
        rationale: 'Domínio liberado manualmente pelo usuário.',
      };
    }

    return {
      classificationStatus: 'PENDING_REVIEW',
      blockStatus: 'ALLOW',
      rationale: 'Domínio aguardando análise e verificação regulatória.',
    };
  }

  /**
   * Registra a revisão formal de um domínio e atualiza seu status no banco
   */
  async reviewDomain(
    domainId: number,
    reviewStatus: ReviewStatus,
    reviewerNote: string
  ): Promise<BlockedDomain | null> {
    const existing = await domainRepository.findById(domainId);
    if (!existing) {
      throw new Error(`Domínio com ID ${domainId} não encontrado.`);
    }

    let newClassification: ClassificationStatus = existing.classification_status;
    let newBlockStatus: BlockStatus = existing.block_status;

    if (reviewStatus === 'APPROVED') {
      // Aprovado como não autorizado -> bloqueio confirmado
      newClassification = 'UNAUTHORIZED_CONFIRMED';
      newBlockStatus = 'BLOCK';
    } else if (reviewStatus === 'REJECTED') {
      // Rejeitado da lista de risco -> autorizado / liberado
      newClassification = 'AUTHORIZED';
      newBlockStatus = 'ALLOW';
    } else if (reviewStatus === 'SUSPENDED') {
      // Em suspensão / pendência
      newClassification = 'PENDING_REVIEW';
      newBlockStatus = 'ALLOW';
    }

    // Registra a revisão no histórico de auditoria
    await reviewRepository.addReview(domainId, reviewStatus, reviewerNote);

    // Atualiza a entidade do domínio
    await domainRepository.updateClassification(
      domainId,
      newClassification,
      newBlockStatus,
      `Revisão [${reviewStatus}]: ${reviewerNote}`
    );

    return domainRepository.findById(domainId);
  }
}

export const classifierService = new ClassifierService();
