import * as SQLite from 'expo-sqlite';
import { migrations } from './migrations/001_initial_schema';

const DATABASE_NAME = 'betsblocker.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    // Habilita integridade referencial e modo WAL para concorrência
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync('PRAGMA journal_mode = WAL;');
    // A sincronização grava em conexão própria: outras escritas esperam em vez de falhar
    await db.execAsync('PRAGMA busy_timeout = 5000;');

    // Tabela de migrações
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    // Busca versões já aplicadas
    const appliedRows = await db.getAllAsync<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version ASC;'
    );
    const appliedVersions = new Set(appliedRows.map((r) => r.version));

    // Executa migrações pendentes em transações
    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version)) {
        await db.withTransactionAsync(async () => {
          await migration.up(db);
          await db.runAsync(
            'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);',
            [migration.version, migration.name, new Date().toISOString()]
          );
        });
      }
    }

    dbInstance = db;
    return db;
  })().catch((error) => {
    // Permite nova tentativa em vez de repetir a mesma falha até reiniciar o app
    initPromise = null;
    throw error;
  });

  return initPromise;
}

/**
 * Utilitário para reiniciar o singleton (útil para testes unitários ou redefinição)
 */
export function resetDatabaseInstance() {
  dbInstance = null;
  initPromise = null;
}
