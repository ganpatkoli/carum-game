import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

let cached: string | null = null;

/** Random per-install id (not a hardware identifier). Sent with the realtime connection for cheat review and push registration. */
export async function getInstallId(): Promise<string> {
  if (cached) return cached;
  try {
    let id = await AsyncStorage.getItem('install_id');
    if (!id) { id = Crypto.randomUUID(); await AsyncStorage.setItem('install_id', id); }
    cached = id;
  } catch { cached = Crypto.randomUUID(); }
  return cached;
}
export const getInstallIdSync = () => cached;
