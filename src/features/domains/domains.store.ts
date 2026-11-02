import { create } from 'zustand';
import { domainService } from '@/services/domain.service';
import { classifierService } from '@/services/classifier.service';
import { protectionService } from '@/services/protection.service';
import { BlockedDomain, ReviewStatus } from '@/types';

interface DomainsState {
  blockedDomains: BlockedDomain[];
  pendingDomains: BlockedDomain[];
  totalBlocked: number;
  totalPending: number;
  isLoading: boolean;
  searchQuery: string;
  categoryFilter: string;
  error: string | null;

  loadBlockedDomains: () => Promise<void>;
  loadPendingDomains: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  setCategoryFilter: (category: string) => void;
  addUserDomain: (domain: string, evidence: string, category?: string) => Promise<boolean>;
  addException: (domain: string, reason: string, expiresAt?: string | null) => Promise<boolean>;
  removeException: (domain: string) => Promise<boolean>;
  reviewDomain: (id: number, status: ReviewStatus, note: string) => Promise<boolean>;
}

const SEARCH_DEBOUNCE_MS = 250;

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let latestBlockedRequest = 0;

export const useDomainsStore = create<DomainsState>((set, get) => ({
  blockedDomains: [],
  pendingDomains: [],
  totalBlocked: 0,
  totalPending: 0,
  isLoading: false,
  searchQuery: '',
  categoryFilter: '',
  error: null,

  loadBlockedDomains: async () => {
    const requestId = ++latestBlockedRequest;
    set({ isLoading: true, error: null });
    try {
      const { searchQuery, categoryFilter } = get();
      const [list, count] = await Promise.all([
        domainService.listBlockedDomains({
          search: searchQuery,
          category: categoryFilter || undefined,
          limit: 100,
        }),
        domainService.countBlockedDomains(searchQuery, categoryFilter || undefined),
      ]);
      // Uma busca mais antiga não pode sobrescrever o resultado da mais recente
      if (requestId !== latestBlockedRequest) return;
      set({ blockedDomains: list, totalBlocked: count, isLoading: false });
    } catch (err: any) {
      set({ error: err?.message || 'Erro ao carregar lista de bloqueios.', isLoading: false });
    }
  },

  loadPendingDomains: async () => {
    set({ isLoading: true, error: null });
    try {
      const [list, count] = await Promise.all([
        domainService.listPendingDomains(100),
        domainService.countPendingDomains(),
      ]);
      set({ pendingDomains: list, totalPending: count, isLoading: false });
    } catch (err: any) {
      set({ error: err?.message || 'Erro ao carregar pendências.', isLoading: false });
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => get().loadBlockedDomains(), SEARCH_DEBOUNCE_MS);
  },

  setCategoryFilter: (category: string) => {
    set({ categoryFilter: category });
    get().loadBlockedDomains();
  },

  addUserDomain: async (domain: string, evidence: string, category = 'restricted_gambling') => {
    try {
      await domainService.addUserDomain(domain, evidence, category);
      await Promise.all([get().loadBlockedDomains(), get().loadPendingDomains()]);
      // Atualiza imediatamente o serviço de VPN nativo
      await protectionService.updateBlocklist();
      return true;
    } catch (err: any) {
      set({ error: err?.message || 'Erro ao adicionar domínio manual.' });
      return false;
    }
  },

  addException: async (domain: string, reason: string, expiresAt?: string | null) => {
    try {
      await domainService.addException(domain, reason, expiresAt);
      await get().loadBlockedDomains();
      // Atualiza imediatamente o serviço de VPN nativo
      await protectionService.updateBlocklist();
      return true;
    } catch (err: any) {
      set({ error: err?.message || 'Erro ao registrar exceção.' });
      return false;
    }
  },

  removeException: async (domain: string) => {
    try {
      await domainService.removeException(domain);
      await get().loadBlockedDomains();
      // Atualiza imediatamente o serviço de VPN nativo
      await protectionService.updateBlocklist();
      return true;
    } catch (err: any) {
      set({ error: err?.message || 'Erro ao remover exceção.' });
      return false;
    }
  },

  reviewDomain: async (id: number, status: ReviewStatus, note: string) => {
    try {
      await classifierService.reviewDomain(id, status, note);
      await Promise.all([get().loadBlockedDomains(), get().loadPendingDomains()]);
      // Atualiza imediatamente o serviço de VPN nativo
      await protectionService.updateBlocklist();
      return true;
    } catch (err: any) {
      set({ error: err?.message || 'Erro ao revisar domínio.' });
      return false;
    }
  },
}));
