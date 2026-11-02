import { useEffect } from 'react';
import { AppState } from 'react-native';
import { refreshAppState } from '@/services/app-lifecycle.service';
import { useDomainsStore } from '@/features/domains/domains.store';
import { useHistoryStore } from '@/features/history/history.store';
import { useProtectionStore } from '@/features/protection/protection.store';
import { useSyncStore } from '@/features/synchronization/sync.store';

let refreshInProgress = false;

async function refreshAll() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    await refreshAppState();
    await Promise.all([
      useProtectionStore.getState().loadSettings(),
      useDomainsStore.getState().loadBlockedDomains(),
      useDomainsStore.getState().loadPendingDomains(),
      useSyncStore.getState().loadLastSync(),
      useHistoryStore.getState().loadBlockEvents(),
    ]);
  } finally {
    refreshInProgress = false;
  }
}

/**
 * Mantém a tela fiel ao estado real: a VPN pode cair e bloquear com o app em segundo plano
 */
export function useAppLifecycle() {
  useEffect(() => {
    refreshAll();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAll();
    });
    return () => subscription.remove();
  }, []);
}
