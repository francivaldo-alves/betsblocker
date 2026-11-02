import { requireNativeModule } from 'expo-modules-core';

export interface VpnBlockerNativeModule {
  isAvailable(): boolean;
  requestVpnPermission(): Promise<boolean>;
  startVpn(blockedDomains: string[]): Promise<boolean>;
  stopVpn(): Promise<boolean>;
  isVpnRunning(): Promise<boolean>;
  updateRules(blockedDomains: string[]): Promise<boolean>;
}

let nativeModule: VpnBlockerNativeModule | null = null;

try {
  nativeModule = requireNativeModule<VpnBlockerNativeModule>('ExpoVpnBlocker');
} catch {
  nativeModule = null;
}

export default nativeModule;
