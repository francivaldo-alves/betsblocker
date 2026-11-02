import { getDatabase } from '../database';
import { ProtectionSettings } from '@/types';

const DEFAULT_SETTINGS: ProtectionSettings = {
  id: 1,
  protection_enabled: 0,
  notification_enabled: 1,
  automatic_sync: 1,
  block_ads: 0,
  block_licensed: 1,
  block_mode: 'STRICT',
  commitment_delay_hours: 0,
  unlock_requested_at: null,
};

export class SettingsRepository {
  async getSettings(): Promise<ProtectionSettings> {
    const db = await getDatabase();
    const settings = await db.getFirstAsync<ProtectionSettings>(
      'SELECT * FROM protection_settings WHERE id = 1 LIMIT 1;'
    );
    return settings ?? DEFAULT_SETTINGS;
  }

  async updateSettings(
    patch: Partial<Omit<ProtectionSettings, 'id'>>
  ): Promise<ProtectionSettings> {
    const db = await getDatabase();
    const updated: ProtectionSettings = { ...(await this.getSettings()), ...patch };

    await db.runAsync(
      `UPDATE protection_settings
       SET protection_enabled = ?,
           notification_enabled = ?,
           automatic_sync = ?,
           block_ads = ?,
           block_licensed = ?,
           block_mode = ?,
           commitment_delay_hours = ?,
           unlock_requested_at = ?
       WHERE id = 1;`,
      [
        updated.protection_enabled,
        updated.notification_enabled,
        updated.automatic_sync,
        updated.block_ads,
        updated.block_licensed,
        updated.block_mode,
        updated.commitment_delay_hours,
        updated.unlock_requested_at,
      ]
    );

    return updated;
  }
}

export const settingsRepository = new SettingsRepository();
