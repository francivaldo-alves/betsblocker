import { requireNativeModule } from 'expo-modules-core';

export type NativeDomainDecision = 'ALLOW' | 'GAMBLING' | 'ADS';

export interface NativeBlockEvent {
  domain: string;
  blockedAt: number;
  audited: boolean;
}

export interface VpnBlockerNativeModule {
  isAvailable(): boolean;
  requestVpnPermission(): Promise<boolean>;
  hasVpnPermission(): Promise<boolean>;
  startVpn(blockedDomains: string[]): Promise<boolean>;
  stopVpn(): Promise<boolean>;
  isVpnRunning(): Promise<boolean>;
  getLastStartError(): Promise<string | null>;
  updateRules(blockedDomains: string[]): Promise<boolean>;
  setFilterOptions(
    blockAds: boolean,
    exceptions: Record<string, number>,
    auditOnly: boolean,
    notifyBlocks: boolean
  ): Promise<boolean>;
  getRecentDomains(): Promise<string[]>;
  checkDomain(domain: string): Promise<NativeDomainDecision>;
  drainBlockEvents(): Promise<NativeBlockEvent[]>;
  verifySignature(message: string, signature: string, publicKey: string): Promise<boolean>;
}

let nativeModule: VpnBlockerNativeModule | null = null;

try {
  nativeModule = requireNativeModule<VpnBlockerNativeModule>('ExpoVpnBlocker');
} catch {
  nativeModule = null;
}

export default nativeModule;
