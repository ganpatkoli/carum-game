import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

let tokens: { accessToken: string; refreshToken: string } | null = null;
export async function loadTokens() {
  const raw = await SecureStore.getItemAsync('tokens');
  tokens = raw ? JSON.parse(raw) : null;
  return tokens;
}
export async function saveTokens(t: typeof tokens) {
  tokens = t;
  if (t) await SecureStore.setItemAsync('tokens', JSON.stringify(t)); else await SecureStore.deleteItemAsync('tokens');
}
export const accessToken = () => tokens?.accessToken;

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

async function raw(path: string, init: RequestInit) {
  return fetch(API_URL + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(tokens ? { authorization: `Bearer ${tokens.accessToken}` } : {}), ...(init.headers ?? {}) },
  });
}

/** JSON request with one transparent refresh-and-retry on 401. The client never writes balances: only the server does. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && tokens?.refreshToken) {
    const r = await fetch(API_URL + '/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: tokens.refreshToken }) });
    if (r.ok) { await saveTokens(await r.json()); res = await raw(path, init); }
    else await saveTokens(null);
  }
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}
