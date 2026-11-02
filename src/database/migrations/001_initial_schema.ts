import { SQLiteDatabase } from 'expo-sqlite';

export interface Migration {
  version: number;
  name: string;
  up: (db: SQLiteDatabase) => Promise<void>;
}

export const migration001: Migration = {
  version: 1,
  name: '001_initial_schema',
  up: async (db: SQLiteDatabase) => {
    // 1. domain_sources
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS domain_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('OFFICIAL', 'COMMUNITY', 'USER_MANUAL')),
        source_url TEXT,
        description TEXT NOT NULL,
        last_checked_at TEXT,
        reliability_level TEXT NOT NULL CHECK (reliability_level IN ('HIGH', 'MEDIUM', 'LOW'))
      );

      -- Fontes fundamentais pré-configuradas
      INSERT OR IGNORE INTO domain_sources (id, name, source_type, source_url, description, last_checked_at, reliability_level)
      VALUES 
      (1, 'Ministério da Fazenda / SPA', 'OFFICIAL', 'https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas', 'Relações oficiais de operadoras e domínios da Secretaria de Prêmios e Apostas', NULL, 'HIGH'),
      (2, 'Segurança Digital / Fontes Verificáveis', 'COMMUNITY', NULL, 'Bases públicas com evidências consolidadas de risco cibernético', NULL, 'MEDIUM'),
      (3, 'Inclusão Manual do Usuário', 'USER_MANUAL', NULL, 'Domínios cadastrados ou modificados diretamente pelo usuário do dispositivo', NULL, 'HIGH');
    `);

    // 2. blocked_domains
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS blocked_domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL DEFAULT 'restricted_gambling',
        classification_status TEXT NOT NULL CHECK (
          classification_status IN (
            'AUTHORIZED', 
            'UNAUTHORIZED_CONFIRMED', 
            'PENDING_REVIEW', 
            'USER_ADDED', 
            'EXCEPTION'
          )
        ),
        block_status TEXT NOT NULL CHECK (block_status IN ('BLOCK', 'ALLOW')),
        source_id INTEGER NOT NULL,
        evidence TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES domain_sources(id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_blocked_domains_domain ON blocked_domains(domain);
      CREATE INDEX IF NOT EXISTS idx_blocked_domains_block_status ON blocked_domains(block_status);
      CREATE INDEX IF NOT EXISTS idx_blocked_domains_classification ON blocked_domains(classification_status);
      CREATE INDEX IF NOT EXISTS idx_blocked_domains_category ON blocked_domains(category);
    `);

    // 3. domain_reviews
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS domain_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain_id INTEGER NOT NULL,
        review_status TEXT NOT NULL CHECK (review_status IN ('APPROVED', 'REJECTED', 'SUSPENDED')),
        reviewer_note TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        FOREIGN KEY (domain_id) REFERENCES blocked_domains(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_domain_reviews_domain_id ON domain_reviews(domain_id);
    `);

    // 4. domain_exceptions
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS domain_exceptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL UNIQUE,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_domain_exceptions_domain ON domain_exceptions(domain);
    `);

    // 5. block_events
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS block_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        blocked_at TEXT NOT NULL,
        block_reason TEXT NOT NULL,
        source_id INTEGER,
        FOREIGN KEY (source_id) REFERENCES domain_sources(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_block_events_blocked_at ON block_events(blocked_at DESC);
      CREATE INDEX IF NOT EXISTS idx_block_events_domain ON block_events(domain);
    `);

    // 6. sync_history
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL,
        synced_at TEXT NOT NULL,
        total_records INTEGER NOT NULL,
        added_records INTEGER NOT NULL,
        updated_records INTEGER NOT NULL,
        removed_records INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'PARTIAL')),
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sync_history_synced_at ON sync_history(synced_at DESC);
    `);

    // 7. protection_settings
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS protection_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        protection_enabled INTEGER NOT NULL DEFAULT 0,
        notification_enabled INTEGER NOT NULL DEFAULT 1,
        automatic_sync INTEGER NOT NULL DEFAULT 1,
        block_mode TEXT NOT NULL DEFAULT 'STRICT' CHECK (block_mode IN ('STRICT', 'PERMISSIVE', 'AUDIT')),
        theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system'))
      );

      INSERT OR IGNORE INTO protection_settings (id, protection_enabled, notification_enabled, automatic_sync, block_mode, theme)
      VALUES (1, 0, 1, 1, 'STRICT', 'system');
    `);
  },
};

export const migration002: Migration = {
  version: 2,
  name: '002_add_block_ads_setting',
  up: async (db) => {
    await db.execAsync(
      'ALTER TABLE protection_settings ADD COLUMN block_ads INTEGER NOT NULL DEFAULT 0;'
    );
  },
};

export const migrations: Migration[] = [migration001, migration002];
