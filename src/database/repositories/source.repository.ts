import { getDatabase } from '../database';
import { DomainSource } from '@/types';

export class SourceRepository {
  async listAll(): Promise<DomainSource[]> {
    const db = await getDatabase();
    return db.getAllAsync<DomainSource>('SELECT * FROM domain_sources ORDER BY id ASC;');
  }

  async findById(id: number): Promise<DomainSource | null> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<DomainSource>(
      'SELECT * FROM domain_sources WHERE id = ? LIMIT 1;',
      [id]
    );
    return result ?? null;
  }

  async updateLastChecked(id: number, dateIso?: string): Promise<boolean> {
    const db = await getDatabase();
    const checkedAt = dateIso || new Date().toISOString();
    const res = await db.runAsync(
      'UPDATE domain_sources SET last_checked_at = ? WHERE id = ?;',
      [checkedAt, id]
    );
    return res.changes > 0;
  }

  async create(source: Omit<DomainSource, 'id'>): Promise<number> {
    const db = await getDatabase();
    const res = await db.runAsync(
      `INSERT INTO domain_sources (name, source_type, source_url, description, last_checked_at, reliability_level)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [
        source.name,
        source.source_type,
        source.source_url,
        source.description,
        source.last_checked_at,
        source.reliability_level,
      ]
    );
    return res.lastInsertRowId;
  }
}

export const sourceRepository = new SourceRepository();
