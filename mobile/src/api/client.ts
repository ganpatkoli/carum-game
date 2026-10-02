import * as SecureStore from 'expo-secure-store';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export interface Tokens { accessToken: string; refreshToken: string }
let tokens: Tokens | null = null;
let onSignedOut: (() => void) | null = null;
export const setSignedOutHandler = (fn: () => void) => { onSignedOut = fn; };

export async function loadTokens() {
  try { const raw = await SecureStore.getItemAsync('tokens'); tokens = raw ? JSON.parse(raw) : null; } catch { tokens = null; }
  return tokens;
}
export async function saveTokens(t: Tokens | null) {
  tokens = t;
  try { if (t) await SecureStore.setItemAsync('tokens', JSON.stringify(t)); else await SecureStore.deleteItemAsync('tokens'); } catch { /* secure store unavailable */ }
}
export const getAccessToken = () => tokens?.accessToken;
export const getRefreshToken = () => tokens?.refreshToken;

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) { super(message); }
}

/** Network failures (no connection, timeout) are distinct from server answers. */
export class NetworkError extends Error {
  constructor() { super('network'); }
}

async function raw(path: string, init: RequestInit & { json?: unknown }) {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    return await fetch(API_URL + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, signal: ctl.signal });
  } catch { throw new NetworkError(); } finally { clearTimeout(timer); }
}

// concurrent 401s must share a single refresh: refresh tokens rotate, so parallel refreshes would trigger theft detection
let refreshing: Promise<boolean> | null = null;
async function refreshTokens(): Promise<boolean> {
  if (!tokens?.refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(API_URL + '/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: tokens!.refreshToken }) });
      if (!res.ok) { if (res.status === 401) { await saveTokens(null); onSignedOut?.(); } return false; }
      const j = await res.json();
      await saveTokens({ accessToken: j.accessToken, refreshToken: j.refreshToken });
      return true;
    } catch { return false; } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; json?: unknown } = {}): Promise<T> {
  const init = { method: opts.method ?? (opts.json !== undefined ? 'POST' : 'GET'), json: opts.json };
  let res = await raw(path, init);
  if (res.status === 401 && tokens && !path.startsWith('/auth/') && (await refreshTokens())) res = await raw(path, init);
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText, body);
  return body as T;
}

export const errorMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
