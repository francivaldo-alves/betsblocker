import { settingsRepository, exceptionRepository, eventRepository } from '@/database';
import { ProtectionServiceImpl } from '../protection.service';
import { blocklistSyncService } from '../blocklist-sync.service';
import { domainService } from '../domain.service';
import { VpnBlockerNativeModule } from '../../../modules/expo-vpn-blocker/src';

jest.mock('@/database', () => ({
  settingsRepository: { getSettings: jest.fn(), updateSettings: jest.fn() },
  exceptionRepository: { listAll: jest.fn() },
  eventRepository: { recordEvents: jest.fn() },
}));
jest.mock('../blocklist-sync.service', () => ({
  blocklistSyncService: { ensureBundledList: jest.fn() },
}));
jest.mock('../domain.service', () => ({ domainService: { getActiveBlocklist: jest.fn() } }));
jest.mock('../../../modules/expo-vpn-blocker/src', () => ({ __esModule: true, default: null }));

const settings = (patch = {}) => ({
  protection_enabled: 0,
  notification_enabled: 1,
  block_ads: 0,
  block_mode: 'STRICT',
  commitment_delay_hours: 0,
  unlock_requested_at: null,
  ...patch,
});

function nativeModule(patch: Partial<VpnBlockerNativeModule> = {}) {
  return {
    requestVpnPermission: jest.fn().mockResolvedValue(true),
    hasVpnPermission: jest.fn().mockResolvedValue(true),
    startVpn: jest.fn().mockResolvedValue(true),
    stopVpn: jest.fn().mockResolvedValue(true),
    isVpnRunning: jest.fn().mockResolvedValue(true),
    getLastStartError: jest.fn().mockResolvedValue(null),
    updateRules: jest.fn().mockResolvedValue(true),
    setFilterOptions: jest.fn().mockResolvedValue(true),
    drainBlockEvents: jest.fn().mockResolvedValue([]),
    ...patch,
  } as unknown as VpnBlockerNativeModule;
}

beforeEach(() => {
  jest.clearAllMocks();
  (settingsRepository.getSettings as jest.Mock).mockResolvedValue(settings());
  (exceptionRepository.listAll as jest.Mock).mockResolvedValue([]);
  (domainService.getActiveBlocklist as jest.Mock).mockResolvedValue(['bet365.com']);
  (blocklistSyncService.ensureBundledList as jest.Mock).mockResolvedValue({ success: true });
});

describe('ProtectionServiceImpl', () => {
  it('não simula proteção sem o módulo nativo', async () => {
    await expect(new ProtectionServiceImpl(null).startProtection()).rejects.toThrow(
      'não está disponível'
    );
    expect(settingsRepository.updateSettings).not.toHaveBeenCalled();
  });

  it('só confirma a proteção depois que a VPN sobe de fato', async () => {
    const native = nativeModule({
      isVpnRunning: jest.fn().mockResolvedValue(false),
      getLastStartError: jest.fn().mockResolvedValue('recusada'),
    });
    await expect(new ProtectionServiceImpl(native).startProtection()).rejects.toThrow('recusada');
    expect(settingsRepository.updateSettings).not.toHaveBeenCalledWith({ protection_enabled: 1 });
  }, 10000);

  it('recusa ligar com a lista vazia', async () => {
    (domainService.getActiveBlocklist as jest.Mock).mockResolvedValue([]);
    const native = nativeModule();
    await expect(new ProtectionServiceImpl(native).startProtection()).rejects.toThrow('vazia');
    expect(native.startVpn).not.toHaveBeenCalled();
  });

  it('marca como ativa quando a VPN confirma', async () => {
    await new ProtectionServiceImpl(nativeModule()).startProtection();
    expect(settingsRepository.updateSettings).toHaveBeenCalledWith({ protection_enabled: 1 });
  });

  it('diferencia queda de desligamento', async () => {
    const native = nativeModule({ isVpnRunning: jest.fn().mockResolvedValue(false) });
    const service = new ProtectionServiceImpl(native);
    expect(await service.getStatus()).toBe('STOPPED');

    (settingsRepository.getSettings as jest.Mock).mockResolvedValue(
      settings({ protection_enabled: 1 })
    );
    expect(await service.getStatus()).toBe('ERROR');
  });

  it('não religa sozinho sem permissão da VPN', async () => {
    (settingsRepository.getSettings as jest.Mock).mockResolvedValue(
      settings({ protection_enabled: 1 })
    );
    const native = nativeModule({
      isVpnRunning: jest.fn().mockResolvedValue(false),
      hasVpnPermission: jest.fn().mockResolvedValue(false),
    });
    await new ProtectionServiceImpl(native).restoreIfInterrupted();
    expect(native.startVpn).not.toHaveBeenCalled();
  });

  it('respeita a trava de compromisso ao desligar', async () => {
    (settingsRepository.getSettings as jest.Mock).mockResolvedValue(
      settings({ commitment_delay_hours: 24 })
    );
    const native = nativeModule();
    await expect(new ProtectionServiceImpl(native).stopProtection()).rejects.toThrow('compromisso');
    expect(native.stopVpn).not.toHaveBeenCalled();
  });

  it('envia exceções com a validade e o modo auditoria ao motor', async () => {
    (settingsRepository.getSettings as jest.Mock).mockResolvedValue(
      settings({ block_mode: 'AUDIT' })
    );
    (exceptionRepository.listAll as jest.Mock).mockResolvedValue([
      { domain: 'a.com', expires_at: null },
      { domain: 'b.com', expires_at: '2026-11-03T00:00:00.000Z' },
    ]);
    const native = nativeModule();
    await new ProtectionServiceImpl(native).updateBlocklist();
    expect(native.setFilterOptions).toHaveBeenCalledWith(
      false,
      { 'a.com': 0, 'b.com': Date.UTC(2026, 10, 3) },
      true,
      true
    );
  });

  it('importa os bloqueios feitos com o app fechado', async () => {
    const native = nativeModule({
      drainBlockEvents: jest.fn().mockResolvedValue([
        { domain: 'x.bet', blockedAt: Date.UTC(2026, 10, 2), audited: false },
      ]),
    });
    await new ProtectionServiceImpl(native).importBlockEvents();
    expect(eventRepository.recordEvents).toHaveBeenCalledWith([
      expect.objectContaining({ domain: 'x.bet', blockedAt: '2026-11-02T00:00:00.000Z' }),
    ]);
  });
});
