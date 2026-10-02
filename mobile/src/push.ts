import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Ask permission, fetch the Expo push token and register this device with the backend. Silent on any failure. */
export async function registerForPush() {
  try {
    if (!Device.isDevice || Platform.OS === 'web') return;
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.DEFAULT });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return; // push tokens need an EAS project id
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/me/devices', { json: { deviceKey: Device.modelId ?? Device.deviceName ?? 'device', platform: Platform.OS === 'ios' ? 'ios' : 'android', pushToken: data } });
  } catch { /* push is optional */ }
}
