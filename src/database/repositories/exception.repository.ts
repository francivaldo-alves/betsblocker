import { getDatabase } from '../database';
import { DomainException } from '@/types';

export class ExceptionRepository {
  async listAll(): Promise<DomainException[]> {
    const db = await getDatabase();
    return db.getAllAsync<DomainException>(
      'SELECT * FROM domain_exceptions ORDER BY created_at DESC;'
    );
  }

  async findByDomain(domain: string): Promise<DomainException | null> {
    const db = await getDatabase();
    const normalized = domain.toLowerCase().trim();
    const result = await db.getFirstAsync<DomainException>(
      'SELECT * FROM domain_exceptions WHERE domain = ? LIMIT 1;',
      [normalized]
    );
    return result ?? null;
  }

  async isDomainExcepted(domain: string): Promise<boolean> {
    const db = await getDatabase();
    const normalized = domain.toLowerCase().trim();
    const nowIso = new Date().toISOString();
    const result = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM domain_exceptions 
       WHERE domain = ? AND (expires_at IS NULL OR expires_at > ?) 
       LIMIT 1;`,
      [normalized, nowIso]
    );
    return result !== null;
  }

  async addException(
    domain: string,
    reason: string,
    expiresAt?: string | null
  ): Promise<number> {
    const db = await getDatabase();
    const normalized = domain.toLowerCase().trim();
    const nowIso = new Date().toISOString();

    const existing = await this.findByDomain(normalized);
    if (existing) {
      await db.runAsync(
        'UPDATE domain_exceptions SET reason = ?, expires_at = ? WHERE id = ?;',
        [reason, expiresAt ?? null, existing.id]
      );
      return existing.id;
    } else {
      const res = await db.runAsync(
        `INSERT INTO domain_exceptions (domain, reason, created_at, expires_at)
         VALUES (?, ?, ?, ?);`,
        [normalized, reason, nowIso, expiresAt ?? null]
      );
      return res.lastInsertRowId;
    }
  }

  async removeException(domain: string): Promise<boolean> {
    const db = await getDatabase();
    const normalized = domain.toLowerCase().trim();
    const res = await db.runAsync(
      'DELETE FROM domain_exceptions WHERE domain = ?;',
      [normalized]
    );
    return res.changes > 0;
  }
}

export const exceptionRepository = new ExceptionRepository();
