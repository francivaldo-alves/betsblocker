import { ProtectionSettings } from '@/types';

// Depois de cumprido o atraso, o usuário tem este tempo para fazer a alteração
export const UNLOCK_WINDOW_HOURS = 1;

export const COMMITMENT_DELAY_OPTIONS = [0, 1, 24, 72];

const HOUR_MS = 60 * 60 * 1000;

export interface CommitmentState {
  locked: boolean;
  pending: boolean;
  unlockAt: Date | null;
}

export class CommitmentLockedError extends Error {
  constructor(state: CommitmentState) {
    super(
      state.pending && state.unlockAt
        ? `Alteração travada pelo seu compromisso até ${state.unlockAt.toLocaleString('pt-BR')}.`
        : 'Alteração travada pelo seu compromisso. Solicite a liberação em Ajustes e aguarde o prazo.'
    );
    this.name = 'CommitmentLockedError';
  }
}

type CommitmentSettings = Pick<
  ProtectionSettings,
  'commitment_delay_hours' | 'unlock_requested_at'
>;

export function getCommitmentState(
  settings: CommitmentSettings,
  nowMs = Date.now()
): CommitmentState {
  const delayHours = settings.commitment_delay_hours;
  if (delayHours === 0) {
    return { locked: false, pending: false, unlockAt: null };
  }

  const requestedAt = settings.unlock_requested_at
    ? new Date(settings.unlock_requested_at).getTime()
    : NaN;
  if (Number.isNaN(requestedAt)) {
    return { locked: true, pending: false, unlockAt: null };
  }

  const unlockAtMs = requestedAt + delayHours * HOUR_MS;
  const unlockAt = new Date(unlockAtMs);
  if (nowMs < unlockAtMs) {
    return { locked: true, pending: true, unlockAt };
  }
  if (nowMs < unlockAtMs + UNLOCK_WINDOW_HOURS * HOUR_MS) {
    return { locked: false, pending: false, unlockAt };
  }
  return { locked: true, pending: false, unlockAt: null };
}

export function assertUnlocked(settings: CommitmentSettings): void {
  const state = getCommitmentState(settings);
  if (state.locked) {
    throw new CommitmentLockedError(state);
  }
}

/**
 * Identifica mudanças que enfraquecem a proteção. Reforçar nunca precisa de espera.
 */
export function weakensProtection(
  current: ProtectionSettings,
  patch: Partial<ProtectionSettings>
): boolean {
  return (
    (patch.block_mode === 'AUDIT' && current.block_mode !== 'AUDIT') ||
    (patch.block_licensed === 0 && current.block_licensed === 1) ||
    (patch.commitment_delay_hours !== undefined &&
      patch.commitment_delay_hours < current.commitment_delay_hours)
  );
}
