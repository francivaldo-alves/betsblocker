import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Android 13+ só exibe as notificações da proteção com esta permissão
 */
export async function requestNotificationPermission(): Promise<void> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
}
