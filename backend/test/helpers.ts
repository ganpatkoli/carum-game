import { PrismaClient } from '@prisma/client';
import { io as client, type Socket } from 'socket.io-client';
import { buildApp } from '../src/app';
import { setOtpSender } from '../src/auth/otp';
import { attachGameServer, type GameServerOptions } from '../src/websocket/socket';
import { setPushSender } from '../src/notifications/notify';
import { clearSettingsCache } from '../src/common/settings';

export const tag = () => Math.random().toString(36).slice(2, 8);

export const sentOtps: { target: string; code: string }[] = [];
export const pushes: { tokens: string[]; title: string }[] = [];

export async function startTestServer(opts: GameServerOptions & { realtime?: boolean } = {}) {
  const db = new PrismaClient();
  setOtpSender({ async send(target, code) { sentOtps.push({ target, code }); } });
  setPushSender(async (tokens, m) => { pushes.push({ tokens, title: m.title }); });
  const app = buildApp(db);
  await app.ready();
  const rt = attachGameServer(app.server, db, undefined, { pairIntervalMs: 60_000, ...opts });
  await app.listen({ port: 0 });
  const base = `http://127.0.0.1:${(app.server.address() as any).port}`;
  const http = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json };
  };
  const registerUser = async (name: string, extra: Record<string, unknown> = {}) => {
    const t = tag();
    const r = await http('POST', '/auth/register', { name, username: `${name}_${t}`, email: `${name}${t}@t.dev`, password: 'password123', ...extra });
    if (r.status !== 201) throw new Error('register failed ' + JSON.stringify(r.body));
    return { ...r.body, username: `${name}_${t}`, email: `${name}${t}@t.dev` } as { userId: string; accessToken: string; refreshToken: string; username: string; email: string };
  };
  const connect = async (token: string) => {
    const s: Socket = client(base, { auth: { token, deviceKey: 'test-device-' + token.slice(-6) }, transports: ['websocket'] });
    await new Promise<void>((res, rej) => { s.once('connect', () => res()); s.once('connect_error', rej); });
    return s;
  };
  const stop = async () => { rt.stop(); await app.close(); await db.$disconnect(); clearSettingsCache(); };
  return { db, app, rt, base, http, registerUser, connect, stop };
}

export const once = <T = any>(s: Socket, ev: string, ms = 15000) =>
  new Promise<T>((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), ms); s.once(ev, (v: T) => { clearTimeout(t); res(v); }); });

export const emitAck = <T = any>(s: Socket, ev: string, payload?: unknown) => new Promise<T>((res) => s.emit(ev, payload, res));
