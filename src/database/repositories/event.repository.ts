import { getDatabase } from '../database';
import { BlockEvent } from '@/types';

export interface NewBlockEvent {
  domain: string;
  blockedAt: string;
  reason: string;
}

export class EventRepository {
  async recordEvents(events: NewBlockEvent[]): Promise<void> {
    if (events.length === 0) return;
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (const event of events) {
        await db.runAsync(
          `INSERT INTO block_events (domain, blocked_at, block_reason, source_id)
           VALUES (?, ?, ?, NULL);`,
          [event.domain, event.blockedAt, event.reason]
        );
      }
    });
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
    // Meia-noite no fuso do aparelho: blocked_at é UTC, e "hoje" para o usuário é local
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM block_events WHERE blocked_at >= ?;',
      [startOfDay.toISOString()]
    );
    return result?.count ?? 0;
  }
}

export const eventRepository = new EventRepository();
