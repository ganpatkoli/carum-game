export const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const KEY = 'carrom_admin_token';

export const getToken = () => (typeof window === 'undefined' ? null : localStorage.getItem(KEY));
export const setToken = (t: string | null) => { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); };

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) { super(message); }
}

/** JSON helper for the admin API. A 401 clears the session so the guard sends the user to /login. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(API + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (res.status === 401 && path !== '/admin/auth/login') { setToken(null); if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-signed-out')); }
  if (!res.ok) throw new ApiError(res.status, json?.error ?? res.statusText, json);
  return json as T;
}

export const qs = (o: Record<string, string | number | boolean | undefined | null>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
