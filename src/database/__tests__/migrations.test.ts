import { DatabaseSync } from 'node:sqlite';
import { SQLiteDatabase } from 'expo-sqlite';
import { migration001, migration002, migration003 } from '../migrations/001_initial_schema';

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const db = { execAsync: async (sql: string) => sqlite.exec(sql) } as unknown as SQLiteDatabase;
  return { sqlite, db };
}

const insertDomain = (sqlite: DatabaseSync, domain: string, status: string, block: string) =>
  sqlite.exec(`
    INSERT INTO blocked_domains (domain, classification_status, block_status, source_id, evidence, verified_at, created_at, updated_at)
    VALUES ('${domain}', '${status}', '${block}', 1, 'x', 'x', 'x', 'x');
  `);

describe('migrações', () => {
  it('leva um banco existente ao modelo novo sem perder decisões', async () => {
    const { sqlite, db } = createDatabase();
    await migration001.up(db);
    await migration002.up(db);

    sqlite.exec(`UPDATE protection_settings SET block_mode = 'PERMISSIVE';`);
    insertDomain(sqlite, 'preso-em-allow.com', 'UNAUTHORIZED_CONFIRMED', 'ALLOW');
    insertDomain(sqlite, 'autorizado.com', 'AUTHORIZED', 'ALLOW');

    await migration003.up(db);

    const settings = sqlite.prepare('SELECT * FROM protection_settings').get() as any;
    expect(settings).toMatchObject({
      block_mode: 'STRICT',
      block_licensed: 1,
      commitment_delay_hours: 0,
      unlock_requested_at: null,
    });

    const status = (domain: string) =>
      (
        sqlite
          .prepare('SELECT block_status, source_id FROM blocked_domains WHERE domain = ?')
          .get(domain) as any
      );
    expect(status('preso-em-allow.com')).toMatchObject({ block_status: 'BLOCK', source_id: 2 });
    expect(status('autorizado.com').block_status).toBe('ALLOW');
  });
});
