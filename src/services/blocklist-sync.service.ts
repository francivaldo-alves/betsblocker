import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { getDatabase, syncRepository, sourceRepository, exceptionRepository } from '@/database';
import { validateAndNormalizeDomain } from '@/utils/domain-validator';
import { BlocklistManifest, BlocklistEntry, SyncHistory } from '@/types';

// Esquema Zod de validação do manifesto
export const blocklistManifestSchema = z.object({
  version: z.number().int().positive('A versão do manifesto deve ser um número inteiro positivo.'),
  generatedAt: z.string().min(1, 'A data de geração é obrigatória.'),
  source: z.string().min(1, 'A origem da lista é obrigatória.'),
  recordCount: z.number().int().nonnegative('A contagem de registros não pode ser negativa.'),
  checksum: z.string().min(16, 'O checksum SHA-256 é obrigatório.'),
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
  error?: string;
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

      let added = 0;
      let updated = 0;
      const nowIso = new Date().toISOString();

      // Executa toda a atualização dentro de uma transação SQLite ACID
      await db.withTransactionAsync(async () => {
        for (const item of entries) {
          // Verifica se o domínio possui exceção ativa pelo usuário
          const isExcepted = await exceptionRepository.isDomainExcepted(item.domain);

          // Decisão de bloqueio respeita exceções ativas do usuário
          const finalBlockStatus = isExcepted ? 'ALLOW' : item.blockStatus;

          const existing = await db.getFirstAsync<{
            id: number;
            classification_status: string;
            block_status: string;
          }>('SELECT id, classification_status, block_status FROM blocked_domains WHERE domain = ? LIMIT 1;', [
            item.domain,
          ]);

          // Mapeia source_id padrão (1 para fontes oficiais, 2 para comunidade)
          const sourceId = item.source === 'official_source' ? 1 : 2;

          if (existing) {
            // Se o usuário adicionou manualmente (USER_ADDED), preserva a classificação do usuário
            const classification =
              existing.classification_status === 'USER_ADDED'
                ? 'USER_ADDED'
                : item.classificationStatus;

            await db.runAsync(
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
                classification,
                finalBlockStatus,
                sourceId,
                item.evidence,
                item.verifiedAt,
                nowIso,
                existing.id,
              ]
            );
            updated++;
          } else {
            await db.runAsync(
              `INSERT INTO blocked_domains (
                domain, category, classification_status, block_status, source_id, evidence, verified_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                item.domain,
                item.category,
                item.classificationStatus,
                finalBlockStatus,
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

        // Atualiza carimbo de consulta nas fontes oficiais
        await sourceRepository.updateLastChecked(1, nowIso);

        // Registra histórico de sincronização com sucesso
        await syncRepository.recordSync({
          version: manifest.version,
          total_records: entries.length,
          added_records: added,
          updated_records: updated,
          removed_records: 0,
          status: 'SUCCESS',
          error_message: null,
        });
      });

      return {
        success: true,
        version: manifest.version,
        totalRecords: entries.length,
        addedRecords: added,
        updatedRecords: updated,
        removedRecords: 0,
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

      return {
        success: false,
        version: manifestVersion,
        totalRecords: 0,
        addedRecords: 0,
        updatedRecords: 0,
        removedRecords: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Sincroniza a lista embutida no pacote (initial-blocklist.json)
   */
  async syncInitialBlocklist(): Promise<SyncResult> {
    // Carrega os arquivos embutidos
    const manifest = require('../../assets/data/blocklist-manifest.json');
    const rawListJson = JSON.stringify(
      require('../../assets/data/initial-blocklist.json'),
      null,
      2
    );

    return this.sync(manifest, rawListJson);
  }

  /**
   * Obtém os metadados da última sincronização bem-sucedida
   */
  async getLastSyncInfo(): Promise<SyncHistory | null> {
    return syncRepository.getLastSuccessfulSync();
  }
}

export const blocklistSyncService = new BlocklistSyncService();
