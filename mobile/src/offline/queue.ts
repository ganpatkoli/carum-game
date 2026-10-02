import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { api } from '../api/client';

const KEY = 'offline_matches';

export interface OfflineMatch {
  clientId: string; difficulty: 'easy' | 'medium' | 'hard' | 'expert'; result: 'win' | 'loss' | 'draw';
  scores: [number, number]; durationSec: number; startedAt: number;
}

async function read(): Promise<OfflineMatch[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'); } catch { return []; }
}

/** Store a finished practice match locally; it is uploaded the next time we are online and signed in. */
export async function recordOfflineMatch(m: Omit<OfflineMatch, 'clientId'>) {
  const list = await read();
  list.push({ ...m, clientId: Crypto.randomUUID() });
  await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(-100)));
}

/** Uploads pending results (max 20 per request). The server validates and de-duplicates; rejected ones are dropped. */
export async function syncOfflineMatches(): Promise<number> {
  const list = await read();
  if (!list.length) return 0;
  let remaining = list;
  let accepted = 0;
  try {
    while (remaining.length) {
      const batch = remaining.slice(0, 20);
      const res = await api<{ results: { clientId: string; accepted: boolean }[] }>('/sync/offline', { json: { matches: batch } });
      accepted += res.results.filter((r) => r.accepted).length;
      remaining = remaining.slice(batch.length);
      await AsyncStorage.setItem(KEY, JSON.stringify(remaining));
    }
  } catch { /* still offline or signed out: keep what is left for next time */ }
  return accepted;
}
