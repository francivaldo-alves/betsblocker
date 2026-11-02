import { getDatabase } from '../database';
import { SyncHistory, SyncStatus } from '@/types';

export class SyncRepository {
  async recordSync(
    history: Omit<SyncHistory, 'id' | 'synced_at'>
  ): Promise<number> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    const res = await db.runAsync(
      `INSERT INTO sync_history (
        version, synced_at, total_records, added_records, updated_records, removed_records, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        history.version,
        nowIso,
        history.total_records,
        history.added_records,
        history.updated_records,
        history.removed_records,
        history.status,
        history.error_message ?? null,
      ]
    );
    return res.lastInsertRowId;
  }

  async getLastSuccessfulSync(): Promise<SyncHistory | null> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<SyncHistory>(
      `SELECT * FROM sync_history 
       WHERE status = 'SUCCESS' 
       ORDER BY synced_at DESC, id DESC 
       LIMIT 1;`
    );
    return result ?? null;
  }

  async listHistory(limit = 30, offset = 0): Promise<SyncHistory[]> {
    const db = await getDatabase();
    return db.getAllAsync<SyncHistory>(
      'SELECT * FROM sync_history ORDER BY synced_at DESC, id DESC LIMIT ? OFFSET ?;',
      [limit, offset]
    );
  }
}

export const syncRepository = new SyncRepository();
