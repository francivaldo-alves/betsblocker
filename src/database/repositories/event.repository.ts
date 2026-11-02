import { getDatabase } from '../database';
import { BlockEvent } from '@/types';

export class EventRepository {
  async recordEvent(
    domain: string,
    blockReason: string,
    sourceId?: number | null
  ): Promise<number> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    const res = await db.runAsync(
      `INSERT INTO block_events (domain, blocked_at, block_reason, source_id)
       VALUES (?, ?, ?, ?);`,
      [domain.toLowerCase().trim(), nowIso, blockReason, sourceId ?? null]
    );
    return res.lastInsertRowId;
  }

  async listRecent(limit = 50, offset = 0): Promise<BlockEvent[]> {
    const db = await getDatabase();
    return db.getAllAsync<BlockEvent>(
      'SELECT * FROM block_events ORDER BY blocked_at DESC, id DESC LIMIT ? OFFSET ?;',
      [limit, offset]
    );
  }

  async countToday(): Promise<number> {
    const db = await getDatabase();
    const todayPrefix = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM block_events WHERE blocked_at LIKE ?;',
      [`${todayPrefix}%`]
    );
    return result?.count ?? 0;
  }

  async countTotal(): Promise<number> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM block_events;'
    );
    return result?.count ?? 0;
  }

  async getLastEvent(): Promise<BlockEvent | null> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<BlockEvent>(
      'SELECT * FROM block_events ORDER BY blocked_at DESC, id DESC LIMIT 1;'
    );
    return result ?? null;
  }
}

export const eventRepository = new EventRepository();
