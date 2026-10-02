import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitAck, once, pushes, startTestServer } from './helpers';

let t: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => { t = await startTestServer(); });
afterAll(async () => { await t.stop(); });

const befriend = async (a: any, b: any) => {
  const r = await t.http('POST', '/friends/requests', { toUserId: b.userId }, a.accessToken);
  const inc = await t.http('GET', '/friends/requests', undefined, b.accessToken);
  await t.http('POST', `/friends/requests/${inc.body.incoming[0].id}/accept`, {}, b.accessToken);
  return r;
};

describe('friends', () => {
  it('search, request, accept, list with online status, remove', async () => {
    const a = await t.registerUser('Fa'); const b = await t.registerUser('Fb');
    const found = await t.http('GET', `/users/search?q=${b.username.slice(0, 6)}`, undefined, a.accessToken);
    expect(found.body.some((x: any) => x.id === b.userId)).toBe(true);
    expect(found.body.some((x: any) => x.id === a.userId)).toBe(false); // never returns yourself

    await befriend(a, b);
    const bSock = await t.connect(b.accessToken);
    const list = await t.http('GET', '/friends', undefined, a.accessToken);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: b.userId, online: true });
    bSock.close(); await new Promise((r) => setTimeout(r, 150));
    expect((await t.http('GET', '/friends', undefined, a.accessToken)).body[0].online).toBe(false);

    await t.http('DELETE', `/friends/${b.userId}`, undefined, a.accessToken);
    expect((await t.http('GET', '/friends', undefined, b.accessToken)).body).toHaveLength(0);
  });

  it('request edge cases: self, duplicate, reject, crossing requests auto-accept', async () => {
    const a = await t.registerUser('Ea'); const b = await t.registerUser('Eb'); const c = await t.registerUser('Ec');
    expect((await t.http('POST', '/friends/requests', { toUserId: a.userId }, a.accessToken)).status).toBe(400);
    await t.http('POST', '/friends/requests', { toUserId: b.userId }, a.accessToken);
    expect((await t.http('POST', '/friends/requests', { toUserId: b.userId }, a.accessToken)).status).toBe(409);
    const inc = await t.http('GET', '/friends/requests', undefined, b.accessToken);
    await t.http('POST', `/friends/requests/${inc.body.incoming[0].id}/reject`, {}, b.accessToken);
    expect((await t.http('GET', '/friends', undefined, a.accessToken)).body).toHaveLength(0);
    // c asks a, then a asks c → instantly friends
    await t.http('POST', '/friends/requests', { toUserId: a.userId }, c.accessToken);
    const cross = await t.http('POST', '/friends/requests', { toUserId: c.userId }, a.accessToken);
    expect(cross.body.status).toBe('ACCEPTED');
    expect((await t.http('GET', '/friends', undefined, a.accessToken)).body).toHaveLength(1);
  });

  it('only the addressee can accept', async () => {
    const a = await t.registerUser('Oa'); const b = await t.registerUser('Ob');
    await t.http('POST', '/friends/requests', { toUserId: b.userId }, a.accessToken);
    const id = (await t.http('GET', '/friends/requests', undefined, a.accessToken)).body.outgoing[0].id;
    expect((await t.http('POST', `/friends/requests/${id}/accept`, {}, a.accessToken)).status).toBe(404);
  });

  it('blocking removes the friendship, hides users from search and prevents requests', async () => {
    const a = await t.registerUser('Ba'); const b = await t.registerUser('Bb');
    await befriend(a, b);
    expect((await t.http('POST', '/blocks', { userId: b.userId }, a.accessToken)).status).toBe(200);
    expect((await t.http('GET', '/friends', undefined, a.accessToken)).body).toHaveLength(0);
    expect((await t.http('GET', `/users/search?q=${b.username.slice(0, 6)}`, undefined, a.accessToken)).body.some((x: any) => x.id === b.userId)).toBe(false);
    expect((await t.http('GET', `/users/search?q=${a.username.slice(0, 6)}`, undefined, b.accessToken)).body.some((x: any) => x.id === a.userId)).toBe(false);
    expect((await t.http('POST', '/friends/requests', { toUserId: a.userId }, b.accessToken)).status).toBe(403);
    expect((await t.http('GET', `/users/${a.userId}/public`, undefined, b.accessToken)).status).toBe(404);
    expect((await t.http('GET', '/blocks', undefined, a.accessToken)).body).toHaveLength(1);
    await t.http('DELETE', `/blocks/${b.userId}`, undefined, a.accessToken);
    expect((await t.http('GET', '/blocks', undefined, a.accessToken)).body).toHaveLength(0);
  });

  it('privacy: friend requests can be turned off', async () => {
    const a = await t.registerUser('Pa'); const b = await t.registerUser('Pb');
    await t.http('PATCH', '/me', { privacy: { friendRequests: 'nobody' } }, b.accessToken);
    expect((await t.http('POST', '/friends/requests', { toUserId: b.userId }, a.accessToken)).status).toBe(403);
  });
});

describe('notifications', () => {
  it('stores in-app notifications, pushes to offline users with tokens, and marks read', async () => {
    const a = await t.registerUser('Na'); const b = await t.registerUser('Nb');
    await t.http('POST', '/me/devices', { deviceKey: 'dev1', platform: 'android', pushToken: 'ExponentPushToken[abc]' }, b.accessToken);
    pushes.length = 0;
    await t.http('POST', '/friends/requests', { toUserId: b.userId }, a.accessToken);
    const n = await t.http('GET', '/notifications', undefined, b.accessToken);
    expect(n.body.unread).toBe(1);
    expect(n.body.items[0]).toMatchObject({ kind: 'friend_request', read: false });
    expect(pushes.some((p) => p.tokens.includes('ExponentPushToken[abc]'))).toBe(true);
    await t.http('POST', '/notifications/read', {}, b.accessToken);
    expect((await t.http('GET', '/notifications', undefined, b.accessToken)).body.unread).toBe(0);
  });

  it('respects the user’s push preference and live-delivers when online', async () => {
    const a = await t.registerUser('Qa'); const b = await t.registerUser('Qb');
    await t.http('POST', '/me/devices', { deviceKey: 'd', platform: 'ios', pushToken: 'ExponentPushToken[zzz]' }, b.accessToken);
    await t.http('PATCH', '/me', { notifPrefs: { push: false } }, b.accessToken);
    pushes.length = 0;
    await t.http('POST', '/friends/requests', { toUserId: b.userId }, a.accessToken);
    expect(pushes).toHaveLength(0);
    const s = await t.connect(b.accessToken);
    const live = once(s, 'notification');
    const c = await t.registerUser('Qc');
    await t.http('POST', '/friends/requests', { toUserId: b.userId }, c.accessToken);
    expect((await live).kind).toBe('friend_request');
    s.close();
  });
});

describe('private rooms', () => {
  it('create, join by code, validation, full room, leave and host-close', async () => {
    const h = await t.registerUser('Rh'); const g = await t.registerUser('Rg'); const x = await t.registerUser('Rx');
    const created = await t.http('POST', '/rooms', { maxPlayers: 2, entryCoins: 50, boardTheme: 'royal', durationSec: 300, rules: { queenPoints: 5 } }, h.accessToken);
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^CARROM-\d{6}$/);
    expect(created.body.players).toHaveLength(1);

    expect((await t.http('POST', '/rooms/join', { code: 'nonsense' }, g.accessToken)).status).toBe(400);
    expect((await t.http('POST', '/rooms/join', { code: 'CARROM-000000' }, g.accessToken)).status).toBe(404);
    const joined = await t.http('POST', '/rooms/join', { code: created.body.code.replace('CARROM-', '') }, g.accessToken); // bare digits work too
    expect(joined.status).toBe(200);
    expect(joined.body.status).toBe('FULL');
    expect((await t.http('POST', '/rooms/join', { code: created.body.code }, x.accessToken)).status).toBe(409);
    expect((await t.http('POST', `/rooms/${created.body.code}/leave`, {}, g.accessToken)).status).toBe(200);
    expect((await t.http('GET', `/rooms/${created.body.code}`, undefined, h.accessToken)).body.status).toBe('OPEN');
    await t.http('POST', `/rooms/${created.body.code}/leave`, {}, h.accessToken);
    expect((await t.http('POST', '/rooms/join', { code: created.body.code }, x.accessToken)).status).toBe(404);
  });

  it('cannot create or join a room you cannot afford; blocked users cannot join', async () => {
    const h = await t.registerUser('Ch'); const poor = await t.registerUser('Cp');
    expect((await t.http('POST', '/rooms', { entryCoins: 999999 }, h.accessToken)).status).toBe(400); // over max
    expect((await t.http('POST', '/rooms', { entryCoins: 9000 }, h.accessToken)).status).toBe(402);
    const r = await t.http('POST', '/rooms', { entryCoins: 100 }, h.accessToken);
    await t.db.$executeRaw`UPDATE "Wallet" SET balance = 0, "totalEarned" = "totalSpent" WHERE "userId" = ${poor.userId}::uuid`;
    expect((await t.http('POST', '/rooms/join', { code: r.body.code }, poor.accessToken)).status).toBe(402);
    const blocked = await t.registerUser('Cb');
    await t.http('POST', '/blocks', { userId: blocked.userId }, h.accessToken);
    expect((await t.http('POST', '/rooms/join', { code: r.body.code }, blocked.accessToken)).status).toBe(403);
  });

  it('inviting a friend creates a room and notifies them; non-friends are refused', async () => {
    const a = await t.registerUser('Ia'); const b = await t.registerUser('Ib'); const c = await t.registerUser('Ic');
    expect((await t.http('POST', '/rooms/invite', { friendId: b.userId }, a.accessToken)).status).toBe(403);
    await befriend(a, b);
    const inv = await t.http('POST', '/rooms/invite', { friendId: b.userId }, a.accessToken);
    expect(inv.status).toBe(200);
    const n = (await t.http('GET', '/notifications', undefined, b.accessToken)).body.items.find((i: any) => i.kind === 'game_invite');
    expect(n.data.code).toBe(inv.body.code);
    expect((await t.http('POST', '/rooms/join', { code: n.data.code }, b.accessToken)).status).toBe(200);
    void c;
  });

  it('lobby over sockets: join, ready, host-only start, then a real match begins with fees taken', async () => {
    const h = await t.registerUser('Lh'); const g = await t.registerUser('Lg');
    const room = (await t.http('POST', '/rooms', { entryCoins: 100, durationSec: 600 }, h.accessToken)).body;
    await t.http('POST', '/rooms/join', { code: room.code }, g.accessToken);
    const sh = await t.connect(h.accessToken); const sg = await t.connect(g.accessToken);
    expect((await emitAck(sh, 'room_join', { code: room.code })).ok).toBe(true);
    expect((await emitAck(sg, 'room_join', { code: room.code })).ok).toBe(true);
    // an outsider cannot subscribe to the lobby
    const o = await t.registerUser('Lo'); const so = await t.connect(o.accessToken);
    expect((await emitAck(so, 'room_join', { code: room.code })).ok).toBe(false);

    expect((await emitAck(sh, 'room_start', { code: room.code })).reason).toBe('not_ready');
    const readyEv = once(sh, 'player_ready');
    await emitAck(sg, 'room_ready', { code: room.code, ready: true });
    expect((await readyEv).ready).toBe(true);
    expect((await emitAck(sg, 'room_start', { code: room.code })).reason).toBe('host_only');

    const started = Promise.all([once(sh, 'game_started'), once(sg, 'game_started')]);
    expect((await emitAck(sh, 'room_start', { code: room.code })).ok).toBe(true);
    const [gs] = await started;
    expect(gs.mode).toBe('room');
    expect(gs.entryCoins).toBe(100);
    expect(Object.keys(gs.profiles)).toHaveLength(2);
    expect(gs.snapshot.ranked).toBe(false);
    expect(gs.snapshot.matchEndsInMs).toBeGreaterThan(590_000);
    for (const u of [h, g]) expect(Number((await t.db.wallet.findUniqueOrThrow({ where: { userId: u.userId } })).balance)).toBe(400);
    expect((await t.http('GET', `/rooms/${room.code}`, undefined, h.accessToken)).body.status).toBe('STARTED');
    [sh, sg, so].forEach((s) => s.close());
  });

  it('2v2 room: four players, teams alternate', async () => {
    const us = await Promise.all(['W', 'X', 'Y', 'Z'].map((n) => t.registerUser('Q' + n)));
    const room = (await t.http('POST', '/rooms', { maxPlayers: 4 }, us[0].accessToken)).body;
    for (const u of us.slice(1)) await t.http('POST', '/rooms/join', { code: room.code }, u.accessToken);
    const socks = await Promise.all(us.map((u) => t.connect(u.accessToken)));
    for (const [i, s] of socks.entries()) { await emitAck(s, 'room_join', { code: room.code }); if (i) await emitAck(s, 'room_ready', { code: room.code, ready: true }); }
    const started = once(socks[1], 'game_started');
    expect((await emitAck(socks[0], 'room_start', { code: room.code })).ok).toBe(true);
    const gs = await started;
    expect(gs.snapshot.players.map((p: any) => p.team)).toEqual([0, 1, 0, 1]);
    socks.forEach((s) => s.close());
  });
});
