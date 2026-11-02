import { getDatabase } from '../database';
import { BlockedDomain, ClassificationStatus, BlockStatus } from '@/types';
import { validateAndNormalizeDomain } from '@/utils/domain-validator';

export const LICENSED_CATEGORY = 'licensed_operators';

export interface DomainListFilter {
  search?: string;
  category?: string;
  classificationStatus?: ClassificationStatus;
  limit?: number;
  offset?: number;
}

// Domínios com exceção ativa ficam fora das listas de bloqueio, mas mantêm a classificação
const WITHOUT_ACTIVE_EXCEPTION = `domain NOT IN (
  SELECT e.domain FROM domain_exceptions e WHERE e.expires_at IS NULL OR e.expires_at > ?
)`;

function blockedConditions(search?: string, category?: string) {
  let conditions = `block_status = 'BLOCK' AND ${WITHOUT_ACTIVE_EXCEPTION}`;
  const params: (string | number)[] = [new Date().toISOString()];

  if (search && search.trim() !== '') {
    conditions += ' AND domain LIKE ?';
    params.push(`%${search.trim().toLowerCase()}%`);
  }

  if (category && category.trim() !== '') {
    conditions += ' AND category = ?';
    params.push(category.trim());
  }

  return { conditions, params };
}

export class DomainRepository {
  async findByDomain(domain: string): Promise<BlockedDomain | null> {
    const db = await getDatabase();
    const normalized = domain.toLowerCase().trim();
    const result = await db.getFirstAsync<BlockedDomain>(
      'SELECT * FROM blocked_domains WHERE domain = ? LIMIT 1;',
      [normalized]
    );
    return result ?? null;
  }

  async findById(id: number): Promise<BlockedDomain | null> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<BlockedDomain>(
      'SELECT * FROM blocked_domains WHERE id = ? LIMIT 1;',
      [id]
    );
    return result ?? null;
  }

  async listBlocked(filter: DomainListFilter = {}): Promise<BlockedDomain[]> {
    const db = await getDatabase();
    const { search, category, limit = 50, offset = 0 } = filter;
    const { conditions, params } = blockedConditions(search, category);

    return db.getAllAsync<BlockedDomain>(
      `SELECT * FROM blocked_domains WHERE ${conditions}
       ORDER BY verified_at DESC, id DESC LIMIT ? OFFSET ?;`,
      [...params, limit, offset]
    );
  }

  async countBlocked(search?: string, category?: string): Promise<number> {
    const db = await getDatabase();
    const { conditions, params } = blockedConditions(search, category);
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM blocked_domains WHERE ${conditions};`,
      params
    );
    return result?.count ?? 0;
  }

  async listPending(limit = 50, offset = 0): Promise<BlockedDomain[]> {
    const db = await getDatabase();
    return db.getAllAsync<BlockedDomain>(
      `SELECT * FROM blocked_domains
       WHERE classification_status = 'PENDING_REVIEW'
       ORDER BY verified_at DESC, id DESC
       LIMIT ? OFFSET ?;`,
      [limit, offset]
    );
  }

  async countPending(): Promise<number> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM blocked_domains WHERE classification_status = 'PENDING_REVIEW';`
    );
    return result?.count ?? 0;
  }

  /**
   * Regras enviadas ao motor de rede. Exceções seguem à parte, com a validade delas,
   * para que uma exceção vencida volte a bloquear mesmo com o app fechado.
   */
  async getActiveBlockedDomains(includeLicensed: boolean): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ domain: string }>(
      `SELECT domain FROM blocked_domains
       WHERE block_status = 'BLOCK' AND (? = 1 OR category <> ?);`,
      [includeLicensed ? 1 : 0, LICENSED_CATEGORY]
    );
    // Regras antigas gravadas antes das validações atuais não chegam ao motor de rede
    return rows
      .map((r) => r.domain)
      .filter((domain) => validateAndNormalizeDomain(domain).isValid);
  }

  async upsert(domainData: Omit<BlockedDomain, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    const normalizedDomain = domainData.domain.toLowerCase().trim();

    const existing = await this.findByDomain(normalizedDomain);

    if (existing) {
      await db.runAsync(
        `UPDATE blocked_domains
         SET category = ?,
             classification_status = ?,
             block_status = ?,
             source_id = ?,
             evidence = ?,
             verified_at = ?,
             updated_at = ?
         WHERE id = ?;`,
        [
          domainData.category,
          domainData.classification_status,
          domainData.block_status,
          domainData.source_id,
          domainData.evidence,
          domainData.verified_at,
          nowIso,
          existing.id,
        ]
      );
      return existing.id;
    } else {
      const res = await db.runAsync(
        `INSERT INTO blocked_domains (
          domain, category, classification_status, block_status, source_id, evidence, verified_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          normalizedDomain,
          domainData.category,
          domainData.classification_status,
          domainData.block_status,
          domainData.source_id,
          domainData.evidence,
          domainData.verified_at,
          nowIso,
          nowIso,
        ]
      );
      return res.lastInsertRowId;
    }
  }

  async updateClassification(
    id: number,
    classificationStatus: ClassificationStatus,
    blockStatus: BlockStatus,
    evidence?: string
  ): Promise<boolean> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();

    if (evidence !== undefined) {
      const res = await db.runAsync(
        `UPDATE blocked_domains
         SET classification_status = ?, block_status = ?, evidence = ?, updated_at = ?
         WHERE id = ?;`,
        [classificationStatus, blockStatus, evidence, nowIso, id]
      );
      return res.changes > 0;
    } else {
      const res = await db.runAsync(
        `UPDATE blocked_domains
         SET classification_status = ?, block_status = ?, updated_at = ?
         WHERE id = ?;`,
        [classificationStatus, blockStatus, nowIso, id]
      );
      return res.changes > 0;
    }
  }
}

export const domainRepository = new DomainRepository();
