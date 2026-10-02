import type { PrismaClient } from '@prisma/client';

/** Presence + realtime fan-out hooks, filled in by the websocket layer. */
export const realtime = {
  isOnline: (_userId: string) => false,
  emitToUser: (_userId: string, _event: string, _payload: unknown) => {},
};

export type PushSender = (tokens: string[], msg: { title: string; body: string; data?: Record<string, unknown> }) => Promise<void>;

/** Expo push service. Replaceable (tests inject a fake; production can swap for FCM/APNs directly). */
export const expoPush: PushSender = async (tokens, msg) => {
  const valid = tokens.filter((t) => /^Expo(nent)?PushToken\[/.test(t));
  if (!valid.length) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(valid.map((to) => ({ to, title: msg.title, body: msg.body, data: msg.data, sound: 'default' }))),
    });
  } catch { /* push is best effort */ }
};

let sender: PushSender = expoPush;
export const setPushSender = (s: PushSender) => { sender = s; };

export interface NotifyInput { kind: string; title: string; body: string; data?: Record<string, unknown>; push?: boolean }

/** In-app notification row + live socket event + (optional) push, honouring the user's preferences. */
export async function notify(db: PrismaClient, userId: string, n: NotifyInput) {
  const row = await db.notification.create({ data: { userId, kind: n.kind, title: n.title, body: n.body, data: (n.data ?? {}) as object } });
  realtime.emitToUser(userId, 'notification', { id: row.id, kind: n.kind, title: n.title, body: n.body, data: n.data ?? {} });
  if (n.push !== false && !realtime.isOnline(userId)) {
    const profile = await db.profile.findUnique({ where: { userId } });
    const prefs = (profile?.notifPrefs ?? {}) as Record<string, boolean>;
    if (prefs.push !== false && prefs[n.kind] !== false) {
      const devices = await db.device.findMany({ where: { userId, pushToken: { not: null } } });
      await sender(devices.map((d) => d.pushToken!), { title: n.title, body: n.body, data: n.data });
    }
  }
  return row;
}
