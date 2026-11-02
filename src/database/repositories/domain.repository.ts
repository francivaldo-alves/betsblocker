import { getDatabase } from '../database';
import { BlockedDomain, ClassificationStatus, BlockStatus } from '@/types';
import { validateAndNormalizeDomain } from '@/utils/domain-validator';

export interface DomainListFilter {
  search?: string;
  category?: string;
  classificationStatus?: ClassificationStatus;
  limit?: number;
  offset?: number;
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

    let query = 'SELECT * FROM blocked_domains WHERE block_status = ?';
    const params: (string | number)[] = ['BLOCK'];

    if (search && search.trim() !== '') {
      query += ' AND domain LIKE ?';
      params.push(`%${search.trim().toLowerCase()}%`);
    }

    if (category && category.trim() !== '') {
      query += ' AND category = ?';
      params.push(category.trim());
    }

    query += ' ORDER BY verified_at DESC, id DESC LIMIT ? OFFSET ?;';
    params.push(limit, offset);

    return db.getAllAsync<BlockedDomain>(query, params);
  }

  async countBlocked(search?: string, category?: string): Promise<number> {
    const db = await getDatabase();
    let query = 'SELECT COUNT(*) as count FROM blocked_domains WHERE block_status = ?';
    const params: string[] = ['BLOCK'];

    if (search && search.trim() !== '') {
      query += ' AND domain LIKE ?';
      params.push(`%${search.trim().toLowerCase()}%`);
    }

    if (category && category.trim() !== '') {
      query += ' AND category = ?';
      params.push(category.trim());
    }

    const result = await db.getFirstAsync<{ count: number }>(query, params);
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

  async getActiveBlockedDomains(): Promise<string[]> {
    const db = await getDatabase();
    // Retorna todos os domínios marcados como BLOCK que NÃO possuem exceção ativa em domain_exceptions
    const nowIso = new Date().toISOString();
    const rows = await db.getAllAsync<{ domain: string }>(
      `SELECT b.domain 
       FROM blocked_domains b
       WHERE b.block_status = 'BLOCK'
         AND b.domain NOT IN (
           SELECT e.domain 
           FROM domain_exceptions e 
           WHERE e.expires_at IS NULL OR e.expires_at > ?
         );`,
      [nowIso]
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

  async upsertBatch(
    domains: Array<Omit<BlockedDomain, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<{ added: number; updated: number }> {
    const db = await getDatabase();
    let added = 0;
    let updated = 0;
    const nowIso = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      for (const item of domains) {
        const normalizedDomain = item.domain.toLowerCase().trim();
        const existing = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM blocked_domains WHERE domain = ? LIMIT 1;',
          [normalizedDomain]
        );

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
              item.category,
              item.classification_status,
              item.block_status,
              item.source_id,
              item.evidence,
              item.verified_at,
              nowIso,
              existing.id,
            ]
          );
          updated++;
        } else {
          await db.runAsync(
            `INSERT INTO blocked_domains (
              domain, category, classification_status, block_status, source_id, evidence, verified_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              normalizedDomain,
              item.category,
              item.classification_status,
              item.block_status,
              item.source_id,
              item.evidence,
              item.verified_at,
              nowIso,
              nowIso,
            ]
          );
          added++;
        }
      }
    });

    return { added, updated };
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

  async deleteById(id: number): Promise<boolean> {
    const db = await getDatabase();
    const res = await db.runAsync('DELETE FROM blocked_domains WHERE id = ?;', [id]);
    return res.changes > 0;
  }
}

export const domainRepository = new DomainRepository();
