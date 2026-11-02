import { ProtectionSettings } from '@/types';
import {
  CommitmentLockedError,
  assertUnlocked,
  getCommitmentState,
  weakensProtection,
} from '../commitment.service';

const HOUR = 60 * 60 * 1000;
const requestedAt = Date.UTC(2026, 10, 2, 12);
const locked = { commitment_delay_hours: 24, unlock_requested_at: null };
const requested = {
  commitment_delay_hours: 24,
  unlock_requested_at: new Date(requestedAt).toISOString(),
};

describe('getCommitmentState', () => {
  it('não trava com o atraso desligado', () => {
    const state = getCommitmentState({ commitment_delay_hours: 0, unlock_requested_at: null });
    expect(state.locked).toBe(false);
  });

  it('trava enquanto não houver solicitação', () => {
    expect(getCommitmentState(locked)).toMatchObject({ locked: true, pending: false });
  });

  it('segue travado durante o prazo, mesmo com o relógio voltando', () => {
    expect(getCommitmentState(requested, requestedAt + 23 * HOUR)).toMatchObject({
      locked: true,
      pending: true,
    });
    expect(getCommitmentState(requested, requestedAt - 48 * HOUR).locked).toBe(true);
  });

  it('libera só durante a janela depois do prazo', () => {
    expect(getCommitmentState(requested, requestedAt + 24 * HOUR).locked).toBe(false);
    expect(getCommitmentState(requested, requestedAt + 25 * HOUR)).toMatchObject({
      locked: true,
      pending: false,
    });
  });

  it('assertUnlocked recusa alterações travadas', () => {
    expect(() => assertUnlocked(locked)).toThrow(CommitmentLockedError);
  });
});

describe('weakensProtection', () => {
  const settings = {
    block_mode: 'STRICT',
    block_licensed: 1,
    commitment_delay_hours: 24,
  } as ProtectionSettings;

  it('detecta só o que reduz a proteção', () => {
    expect(weakensProtection(settings, { block_mode: 'AUDIT' })).toBe(true);
    expect(weakensProtection(settings, { block_licensed: 0 })).toBe(true);
    expect(weakensProtection(settings, { commitment_delay_hours: 1 })).toBe(true);
    expect(weakensProtection(settings, { commitment_delay_hours: 72 })).toBe(false);
    expect(weakensProtection(settings, { block_ads: 1 })).toBe(false);
  });
});
