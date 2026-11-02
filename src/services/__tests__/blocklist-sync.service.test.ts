import { createHash } from 'node:crypto';
import { getDatabase, syncRepository } from '@/database';
import { BlocklistSyncService, signedManifestMessage } from '../blocklist-sync.service';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_: string, content: string) =>
    jest.requireActual('node:crypto').createHash('sha256').update(content).digest('hex'),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
jest.mock('../../../modules/expo-vpn-blocker/src', () => ({ __esModule: true, default: null }));
jest.mock('@/database', () => ({
  getDatabase: jest.fn(),
  syncRepository: { getLastSuccessfulSync: jest.fn(), recordSync: jest.fn() },
  sourceRepository: { updateLastChecked: jest.fn(), findById: jest.fn() },
}));

const entry = (domain: string) => ({
  domain,
  category: 'restricted_gambling',
  classificationStatus: 'UNAUTHORIZED_CONFIRMED',
  blockStatus: 'BLOCK',
  source: 'curated_list',
  evidence: 'teste',
  verifiedAt: '2026-11-02',
});

function payload(entries: unknown[], version = 5) {
  const list = JSON.stringify(entries);
  return {
    list,
    manifest: {
      version,
      generatedAt: '2026-11-02',
      source: 'curated_list',
      recordCount: entries.length,
      checksum: createHash('sha256').update(list).digest('hex'),
    },
  };
}

function mockDatabase(rows: object[]) {
  const txn = { getAllAsync: jest.fn().mockResolvedValue(rows), runAsync: jest.fn() };
  (getDatabase as jest.Mock).mockResolvedValue({
    withExclusiveTransactionAsync: async (task: (t: typeof txn) => Promise<void>) => task(txn),
  });
  return txn;
}

const service = new BlocklistSyncService();

beforeEach(() => {
  jest.clearAllMocks();
  (syncRepository.getLastSuccessfulSync as jest.Mock).mockResolvedValue(null);
});

describe('sync', () => {
  it('rejeita conteúdo que não bate com o checksum', async () => {
    mockDatabase([]);
    const { manifest } = payload([entry('a.com')]);
    const result = await service.sync(manifest, JSON.stringify([entry('b.com')]));
    expect(result.success).toBe(false);
    expect(result.error).toContain('integridade');
  });

  it('recusa voltar para uma versão anterior', async () => {
    mockDatabase([]);
    (syncRepository.getLastSuccessfulSync as jest.Mock).mockResolvedValue({ version: 9 });
    const { manifest, list } = payload([entry('a.com')], 5);
    expect((await service.sync(manifest, list)).success).toBe(false);
  });

  it('preserva decisões locais e remove o que saiu da lista', async () => {
    const row = (id: number, domain: string, status: string, reviewed = 0) => ({
      id,
      domain,
      classification_status: status,
      source_id: 2,
      reviewed,
    });
    const txn = mockDatabase([
      row(1, 'user.com', 'USER_ADDED'),
      row(2, 'reviewed.com', 'AUTHORIZED', 1),
      row(3, 'antigo.com', 'UNAUTHORIZED_CONFIRMED'),
      row(4, 'atual.com', 'UNAUTHORIZED_CONFIRMED'),
    ]);
    const { manifest, list } = payload([
      entry('user.com'),
      entry('reviewed.com'),
      entry('atual.com'),
      entry('novo.com'),
    ]);

    const result = await service.sync(manifest, list);

    expect(result).toMatchObject({
      success: true,
      addedRecords: 1,
      updatedRecords: 1,
      removedRecords: 1,
    });
    expect(txn.runAsync).toHaveBeenCalledWith('DELETE FROM blocked_domains WHERE id = ?;', [3]);
    const touchedIds = txn.runAsync.mock.calls.map(([, params]) => params[params.length - 1]);
    expect(touchedIds).not.toContain(1);
    expect(touchedIds).not.toContain(2);
  });
});

describe('ensureBundledList', () => {
  it('não reaplica a lista embutida já em uso', async () => {
    (syncRepository.getLastSuccessfulSync as jest.Mock).mockResolvedValue({ version: 999 });
    expect(await service.ensureBundledList()).toMatchObject({ success: true, upToDate: true });
  });

  it('aceita a lista embutida na primeira abertura', async () => {
    mockDatabase([]);
    const result = await service.ensureBundledList();
    expect(result.success).toBe(true);
    expect(result.addedRecords).toBeGreaterThan(60);
  });
});

describe('syncRemote', () => {
  it('não baixa nada sem configuração', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    expect((await service.syncRemote()).success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('assina a mesma mensagem que o script de publicação', () => {
    expect(signedManifestMessage({ version: 4, checksum: 'ABC' } as never)).toBe('4:abc');
  });
});
