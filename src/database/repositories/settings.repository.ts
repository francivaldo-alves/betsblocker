import { getDatabase } from '../database';
import { ProtectionSettings, BlockMode, AppTheme } from '@/types';

export class SettingsRepository {
  async getSettings(): Promise<ProtectionSettings> {
    const db = await getDatabase();
    let settings = await db.getFirstAsync<ProtectionSettings>(
      'SELECT * FROM protection_settings WHERE id = 1 LIMIT 1;'
    );

    if (!settings) {
      await db.runAsync(
        `INSERT OR IGNORE INTO protection_settings (id, protection_enabled, notification_enabled, automatic_sync, block_mode, theme)
         VALUES (1, 0, 1, 1, 'STRICT', 'system');`
      );
      settings = await db.getFirstAsync<ProtectionSettings>(
        'SELECT * FROM protection_settings WHERE id = 1 LIMIT 1;'
      );
    }

    return (
      settings ?? {
        id: 1,
        protection_enabled: 0,
        notification_enabled: 1,
        automatic_sync: 1,
        block_ads: 0,
        block_mode: 'STRICT',
        theme: 'system',
      }
    );
  }

  async updateSettings(
    patch: Partial<Omit<ProtectionSettings, 'id'>>
  ): Promise<ProtectionSettings> {
    const db = await getDatabase();
    const current = await this.getSettings();

    const updated: ProtectionSettings = {
      id: 1,
      protection_enabled: patch.protection_enabled !== undefined ? patch.protection_enabled : current.protection_enabled,
      notification_enabled: patch.notification_enabled !== undefined ? patch.notification_enabled : current.notification_enabled,
      automatic_sync: patch.automatic_sync !== undefined ? patch.automatic_sync : current.automatic_sync,
      block_ads: patch.block_ads !== undefined ? patch.block_ads : current.block_ads,
      block_mode: patch.block_mode !== undefined ? patch.block_mode : current.block_mode,
      theme: patch.theme !== undefined ? patch.theme : current.theme,
    };

    await db.runAsync(
      `UPDATE protection_settings 
       SET protection_enabled = ?,
           notification_enabled = ?,
           automatic_sync = ?,
           block_ads = ?,
           block_mode = ?,
           theme = ?
       WHERE id = 1;`,
      [
        updated.protection_enabled,
        updated.notification_enabled,
        updated.automatic_sync,
        updated.block_ads,
        updated.block_mode,
        updated.theme,
      ]
    );

    return updated;
  }
}

export const settingsRepository = new SettingsRepository();
