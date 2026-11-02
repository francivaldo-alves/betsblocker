import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { z } from 'zod';
import { getDatabase, syncRepository, sourceRepository } from '@/database';
import { validateAndNormalizeDomain } from '@/utils/domain-validator';
import { BlocklistManifest, BlocklistEntry, SyncHistory } from '@/types';
import nativeVpnBlocker from '../../modules/expo-vpn-blocker/src';

const OFFICIAL_SOURCE_ID = 1;
const CURATED_SOURCE_ID = 2;
const REMOTE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_REMOTE_LIST_LENGTH = 5 * 1024 * 1024;

// Esquema Zod de validação do manifesto
export const blocklistManifestSchema = z.object({
  version: z.number().int().positive('A versão do manifesto deve ser um número inteiro positivo.'),
  generatedAt: z.string().min(1, 'A data de geração é obrigatória.'),
  source: z.string().min(1, 'A origem da lista é obrigatória.'),
  recordCount: z.number().int().nonnegative('A contagem de registros não pode ser negativa.'),
  checksum: z.string().regex(/^[0-9a-fA-F]{64}$/, 'O checksum SHA-256 é obrigatório.'),
  signature: z.string().min(1).optional(),
});

// Esquema Zod de validação de cada registro da lista
export const blocklistEntrySchema = z.object({
  domain: z.string().min(1, 'O domínio é obrigatório.'),
  category: z.string().default('restricted_gambling'),
  classificationStatus: z.enum([
    'AUTHORIZED',
    'UNAUTHORIZED_CONFIRMED',
    'PENDING_REVIEW',
    'USER_ADDED',
    'EXCEPTION',
  ]),
  blockStatus: z.enum(['BLOCK', 'ALLOW']),
  source: z.string().min(1, 'A fonte do registro é obrigatória.'),
  evidence: z.string().min(1, 'A evidência do registro é obrigatória.'),
  verifiedAt: z.string().min(1, 'A data de verificação é obrigatória.'),
});

export interface SyncResult {
  success: boolean;
  version: number;
  totalRecords: number;
  addedRecords: number;
  updatedRecords: number;
  removedRecords: number;
  upToDate?: boolean;
  error?: string;
}

export interface RemoteBlocklistConfig {
  manifestUrl: string;
  listUrl: string;
  publicKey: string;
}

export function failedSync(error: string, version = 0): SyncResult {
  return {
    success: false,
    version,
    totalRecords: 0,
    addedRecords: 0,
    updatedRecords: 0,
    removedRecords: 0,
    error,
  };
}

function upToDateSync(version: number): SyncResult {
  return {
    success: true,
    upToDate: true,
    version,
    totalRecords: 0,
    addedRecords: 0,
    updatedRecords: 0,
    removedRecords: 0,
  };
}

// Mesma mensagem assinada por scripts/build-blocklist.mjs
export function signedManifestMessage(manifest: BlocklistManifest): string {
  return `${manifest.version}:${manifest.checksum.toLowerCase()}`;
}

export class BlocklistSyncService {
  /**
   * Calcula o hash SHA-256 de uma string usando expo-crypto
   */
  async calculateSha256(content: string): Promise<string> {
    return Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      content
    );
  }

  /**
   * Valida manifesto e integridade dos dados brutos
   */
  async validateDataIntegrity(
    rawManifest: unknown,
    rawListJsonString: string
  ): Promise<{ manifest: BlocklistManifest; entries: BlocklistEntry[] }> {
    // 1. Valida estrutura do manifesto
    const manifestParsed = blocklistManifestSchema.safeParse(rawManifest);
    if (!manifestParsed.success) {
      const issue = manifestParsed.error.issues[0]?.message || 'Manifesto com formato inválido.';
      throw new Error(`Falha de validação do manifesto: ${issue}`);
    }
    const manifest = manifestParsed.data as BlocklistManifest;

    // 2. Valida hash SHA-256 do conteúdo da lista (canônico e trimmed para tolerância entre plataformas)
    const computedHash = await this.calculateSha256(rawListJsonString.trim());
    const rawHash = await this.calculateSha256(rawListJsonString);
    const expected = manifest.checksum.toLowerCase().trim();

    if (computedHash.toLowerCase() !== expected && rawHash.toLowerCase() !== expected) {
      throw new Error(
        `Falha de integridade SHA-256. Esperado: ${expected}, Calculado: ${computedHash.toLowerCase()}`
      );
    }

    // 3. Valida parsing da lista JSON
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawListJsonString);
    } catch {
      throw new Error('O conteúdo da lista não é um JSON válido.');
    }

    if (!Array.isArray(parsedJson)) {
      throw new Error('O conteúdo da lista deve ser um array JSON de domínios.');
    }

    if (parsedJson.length !== manifest.recordCount) {
      throw new Error(
        `Discrepância na contagem de registros: manifesto indica ${manifest.recordCount}, mas a lista contém ${parsedJson.length}.`
      );
    }

    // 4. Valida cada registro individual
    const validatedEntries: BlocklistEntry[] = [];
    for (let i = 0; i < parsedJson.length; i++) {
      const item = parsedJson[i];
      const entryResult = blocklistEntrySchema.safeParse(item);
      if (!entryResult.success) {
        throw new Error(
          `Registro na posição ${i} inválido: ${entryResult.error.issues[0]?.message}`
        );
      }

      const domainValidation = validateAndNormalizeDomain(entryResult.data.domain);
      if (!domainValidation.isValid || !domainValidation.normalized) {
        throw new Error(
          `Domínio inválido na posição ${i} ("${entryResult.data.domain}"): ${domainValidation.error}`
        );
      }

      validatedEntries.push({
        ...entryResult.data,
        domain: domainValidation.normalized,
      });
    }

    return { manifest, entries: validatedEntries };
  }

  /**
   * Executa a sincronização atômica no banco SQLite.
   * Se qualquer etapa falhar, faz rollback automático e preserva a versão anterior intacta.
   * Decisões locais (domínios do usuário e revisões) nunca são sobrescritas pela lista.
   */
  async sync(
    rawManifest: unknown,
    rawListJsonString: string
  ): Promise<SyncResult> {
    const db = await getDatabase();
    let manifestVersion = 0;

    try {
      // Validação estrita antes de abrir transação
      const { manifest, entries } = await this.validateDataIntegrity(
        rawManifest,
        rawListJsonString
      );
      manifestVersion = manifest.version;

      const lastSync = await syncRepository.getLastSuccessfulSync();
      if (lastSync && manifest.version < lastSync.version) {
        throw new Error(
          `A versão ${manifest.version} é anterior à versão aplicada (${lastSync.version}).`
        );
      }

      let added = 0;
      let updated = 0;
      let removed = 0;
      const nowIso = new Date().toISOString();

      // Conexão exclusiva: nenhuma consulta de outra tela entra por engano nesta transação
      await db.withExclusiveTransactionAsync(async (txn) => {
        const rows = await txn.getAllAsync<{
          id: number;
          domain: string;
          classification_status: string;
          source_id: number;
          reviewed: number;
        }>(
          `SELECT b.id, b.domain, b.classification_status, b.source_id,
                  EXISTS (SELECT 1 FROM domain_reviews r WHERE r.domain_id = b.id) AS reviewed
           FROM blocked_domains b;`
        );
        const existingByDomain = new Map(rows.map((row) => [row.domain, row]));
        const isLocalDecision = (row: (typeof rows)[number]) =>
          row.reviewed === 1 || row.classification_status === 'USER_ADDED';

        for (const item of entries) {
          const sourceId = item.source === 'official_source' ? OFFICIAL_SOURCE_ID : CURATED_SOURCE_ID;
          const existing = existingByDomain.get(item.domain);

          if (existing) {
            if (isLocalDecision(existing)) continue;

            await txn.runAsync(
              `UPDATE blocked_domains
               SET category = ?,
                   classification_status = ?,
                   block_status = ?,
                   source_id = ?,
                   evidence = ?,
                   verified_at = ?,
                   updated_at = ?
               WHERE id = ?;`,
              [
                item.category,
                item.classificationStatus,
                item.blockStatus,
                sourceId,
                item.evidence,
                item.verifiedAt,
                nowIso,
                existing.id,
              ]
            );
            updated++;
          } else {
            await txn.runAsync(
              `INSERT INTO blocked_domains (
                domain, category, classification_status, block_status, source_id, evidence, verified_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                item.domain,
                item.category,
                item.classificationStatus,
                item.blockStatus,
                sourceId,
                item.evidence,
                item.verifiedAt,
                nowIso,
                nowIso,
              ]
            );
            added++;
          }
        }

        // Domínios que saíram da lista deixam de valer, salvo decisão local
        const listed = new Set(entries.map((item) => item.domain));
        for (const row of rows) {
          if (!listed.has(row.domain) && !isLocalDecision(row)) {
            await txn.runAsync('DELETE FROM blocked_domains WHERE id = ?;', [row.id]);
            removed++;
          }
        }
      });

      await sourceRepository.updateLastChecked(CURATED_SOURCE_ID, nowIso);
      await syncRepository.recordSync({
        version: manifest.version,
        total_records: entries.length,
        added_records: added,
        updated_records: updated,
        removed_records: removed,
        status: 'SUCCESS',
        error_message: null,
      });

      return {
        success: true,
        version: manifest.version,
        totalRecords: entries.length,
        addedRecords: added,
        updatedRecords: updated,
        removedRecords: removed,
      };
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro desconhecido durante a sincronização.';

      // Registra a falha na tabela sync_history sem corromper a base de domínios
      try {
        await syncRepository.recordSync({
          version: manifestVersion,
          total_records: 0,
          added_records: 0,
          updated_records: 0,
          removed_records: 0,
          status: 'FAILED',
          error_message: errorMessage,
        });
      } catch {
        // Ignora erro secundário de log
      }

      return failedSync(errorMessage, manifestVersion);
    }
  }

  /**
   * Aplica a lista embutida no pacote se ela for mais nova que a versão em uso:
   * cobre a primeira abertura e as atualizações do app.
   */
  async ensureBundledList(): Promise<SyncResult> {
    const manifest = require('../../assets/data/blocklist-manifest.json') as BlocklistManifest;
    const lastSync = await syncRepository.getLastSuccessfulSync();
    if (lastSync && lastSync.version >= manifest.version) {
      return upToDateSync(lastSync.version);
    }

    const rawListJson = JSON.stringify(
      require('../../assets/data/initial-blocklist.json'),
      null,
      2
    );
    return this.sync(manifest, rawListJson);
  }

  /**
   * Endereços e chave vêm de app.json (extra.blocklist); sem eles, não há atualização remota
   */
  getRemoteConfig(): RemoteBlocklistConfig | null {
    const config = Constants.expoConfig?.extra?.blocklist as
      | Partial<RemoteBlocklistConfig>
      | undefined;
    if (!config?.manifestUrl || !config.listUrl || !config.publicKey) {
      return null;
    }
    return {
      manifestUrl: config.manifestUrl,
      listUrl: config.listUrl,
      publicKey: config.publicKey,
    };
  }

  /**
   * Baixa a lista publicada. Só aplica manifesto assinado pela chave embutida no app.
   */
  async syncRemote(): Promise<SyncResult> {
    const config = this.getRemoteConfig();
    if (!config) {
      return failedSync('A atualização remota da lista não está configurada.');
    }

    try {
      const response = await fetch(config.manifestUrl);
      if (!response.ok) {
        throw new Error(`Servidor respondeu ${response.status} ao buscar o manifesto.`);
      }
      const rawManifest: unknown = await response.json();
      const parsed = blocklistManifestSchema.safeParse(rawManifest);
      if (!parsed.success) {
        throw new Error('Manifesto remoto com formato inválido.');
      }
      const manifest = parsed.data as BlocklistManifest;

      if (!manifest.signature || !nativeVpnBlocker) {
        throw new Error('Manifesto remoto sem assinatura verificável.');
      }
      const trusted = await nativeVpnBlocker.verifySignature(
        signedManifestMessage(manifest),
        manifest.signature,
        config.publicKey
      );
      if (!trusted) {
        throw new Error('Assinatura do manifesto remoto inválida.');
      }

      const lastSync = await syncRepository.getLastSuccessfulSync();
      await sourceRepository.updateLastChecked(CURATED_SOURCE_ID, new Date().toISOString());
      if (lastSync && manifest.version <= lastSync.version) {
        return upToDateSync(lastSync.version);
      }

      const listResponse = await fetch(config.listUrl);
      if (!listResponse.ok) {
        throw new Error(`Servidor respondeu ${listResponse.status} ao buscar a lista.`);
      }
      const rawList = await listResponse.text();
      if (rawList.length > MAX_REMOTE_LIST_LENGTH) {
        throw new Error('A lista remota excede o tamanho permitido.');
      }

      return this.sync(manifest, rawList);
    } catch (error: any) {
      return failedSync(error?.message || 'Falha ao atualizar a lista remota.');
    }
  }

  /**
   * Evita consultar o servidor a cada abertura do app
   */
  async isRemoteCheckDue(): Promise<boolean> {
    if (!this.getRemoteConfig()) return false;
    const source = await sourceRepository.findById(CURATED_SOURCE_ID);
    if (!source?.last_checked_at) return true;
    return Date.now() - new Date(source.last_checked_at).getTime() >= REMOTE_CHECK_INTERVAL_MS;
  }

  /**
   * Obtém os metadados da última sincronização bem-sucedida
   */
  async getLastSyncInfo(): Promise<SyncHistory | null> {
    return syncRepository.getLastSuccessfulSync();
  }
}

export const blocklistSyncService = new BlocklistSyncService();
