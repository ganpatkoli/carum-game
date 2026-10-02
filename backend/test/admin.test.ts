import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, tag } from './helpers';
import { createAdmin } from '../src/admin/service';
import { getSetting, setSetting, clearSettingsCache } from '../src/common/settings';
import { DEFAULT_RULES } from '@carrom/game-core';

let t: Awaited<ReturnType<typeof startTestServer>>;
const tok: Record<string, string> = {};
const ids: Record<string, string> = {};
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'GAME_MANAGER', 'SUPPORT_MANAGER', 'FINANCE_MANAGER'] as const;

beforeAll(async () => {
  t = await startTestServer();
  for (const r of ROLES) {
    const email = `${r.toLowerCase()}_${tag()}@admin.dev`;
    const a = await createAdmin(t.db, email, 'a-strong-password', r);
    ids[r] = a.id;
    const l = await t.http('POST', '/admin/auth/login', { email, password: 'a-strong-password' });
    expect(l.status).toBe(200);
    tok[r] = l.body.token;
  }
});
afterAll(async () => { await t.stop(); });
const as = (role: (typeof ROLES)[number], method: string, path: string, body?: unknown) => t.http(method, path, body, tok[role]);

describe('admin auth', () => {
  it('rejects bad credentials, missing tokens, and keeps user/admin tokens separate', async () => {
    expect((await t.http('POST', '/admin/auth/login', { email: 'nobody@x.dev', password: 'whatever12' })).status).toBe(401);
    expect((await t.http('GET', '/admin/analytics')).status).toBe(401);
    const u = await t.registerUser('Notadmin');
    expect((await t.http('GET', '/admin/analytics', undefined, u.accessToken)).status).toBe(401); // user token is not an admin token
    expect((await t.http('GET', '/me', undefined, tok.SUPER_ADMIN)).status).toBe(401); // admin token is not a user token
    expect((await as('GAME_MANAGER', 'GET', '/admin/me')).body.modules).toContain('rules');
  });

  it('a removed admin loses access immediately', async () => {
    const a = await createAdmin(t.db, `tmp_${tag()}@admin.dev`, 'a-strong-password', 'ADMIN');
    const l = await t.http('POST', '/admin/auth/login', { email: a.email, password: 'a-strong-password' });
    expect((await t.http('GET', '/admin/analytics', undefined, l.body.token)).status).toBe(200);
    await t.db.adminUser.delete({ where: { id: a.id } });
    expect((await t.http('GET', '/admin/analytics', undefined, l.body.token)).status).toBe(401);
  });
});

describe('RBAC enforced by the API', () => {
  const matrix: [string, string, (typeof ROLES)[number][]][] = [
    ['GET', '/admin/analytics', ['SUPER_ADMIN', 'ADMIN', 'GAME_MANAGER', 'FINANCE_MANAGER']],
    ['GET', '/admin/users', ['SUPER_ADMIN', 'ADMIN', 'GAME_MANAGER', 'SUPPORT_MANAGER', 'FINANCE_MANAGER']],
    ['GET', '/admin/transactions', ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER']],
    ['GET', '/admin/reports', ['SUPER_ADMIN', 'ADMIN', 'SUPPORT_MANAGER']],
    ['GET', '/admin/support', ['SUPER_ADMIN', 'ADMIN', 'SUPPORT_MANAGER']],
    ['GET', '/admin/missions', ['SUPER_ADMIN', 'ADMIN', 'GAME_MANAGER']],
    ['GET', '/admin/items', ['SUPER_ADMIN', 'ADMIN', 'GAME_MANAGER']],
    ['GET', '/admin/admins', ['SUPER_ADMIN']],
    ['GET', '/admin/audit', ['SUPER_ADMIN', 'ADMIN']],
    ['GET', '/admin/matches', ['SUPER_ADMIN', 'ADMIN', 'GAME_MANAGER', 'SUPPORT_MANAGER']],
  ];
  for (const [method, path, allowed] of matrix) {
    it(`${method} ${path} → only ${allowed.join(', ')}`, async () => {
      for (const r of ROLES) {
        const res = await as(r, method, path);
        expect(res.status, `${r} on ${path}`).toBe(allowed.includes(r) ? 200 : 403);
      }
    });
  }

  it('writes need write permission, not just read', async () => {
    const u = await t.registerUser('Rb');
    // finance cannot ban, support cannot adjust coins, game manager cannot change wallets
    expect((await as('FINANCE_MANAGER', 'POST', `/admin/users/${u.userId}/ban`, { banned: true })).status).toBe(403);
    expect((await as('SUPPORT_MANAGER', 'POST', `/admin/users/${u.userId}/wallet-adjust`, { amount: 10, note: 'nope nope', idempotencyKey: tag() + tag() })).status).toBe(403);
    expect((await as('GAME_MANAGER', 'POST', `/admin/users/${u.userId}/wallet-adjust`, { amount: 10, note: 'nope nope', idempotencyKey: tag() + tag() })).status).toBe(403);
    expect((await as('GAME_MANAGER', 'POST', `/admin/users/${u.userId}/ban`, { banned: true })).status).toBe(403);
    // wallet data is hidden from roles that cannot read it
    expect((await as('SUPPORT_MANAGER', 'GET', `/admin/users/${u.userId}`)).body.wallet).toBeNull();
    expect((await as('FINANCE_MANAGER', 'GET', `/admin/users/${u.userId}`)).body.wallet.balance).toBe(500);
  });

  it('settings: each role may only write the settings of its modules', async () => {
    const rules = { ...DEFAULT_RULES };
    expect((await as('GAME_MANAGER', 'PUT', '/admin/settings/rules', rules)).status).toBe(200);
    expect((await as('FINANCE_MANAGER', 'PUT', '/admin/settings/rules', rules)).status).toBe(403);
    expect((await as('SUPPORT_MANAGER', 'PUT', '/admin/settings/ads', await getSetting(t.db, 'ads'))).status).toBe(403);
    expect((await as('FINANCE_MANAGER', 'PUT', '/admin/settings/iap_products', await getSetting(t.db, 'iap_products'))).status).toBe(200);
    // visibility follows the same rule
    const seen = Object.keys((await as('FINANCE_MANAGER', 'GET', '/admin/settings')).body);
    expect(seen).toContain('iap_products'); expect(seen).not.toContain('rules');
  });
});

describe('users, wallet and bans', () => {
  it('lists/searches users, bans (revoking sessions), unbans, and audits', async () => {
    const u = await t.registerUser('Adm');
    const found = await as('ADMIN', 'GET', `/admin/users?q=${u.username.slice(0, 7)}`);
    expect(found.body.items.some((x: any) => x.id === u.userId)).toBe(true);
    expect((await as('ADMIN', 'POST', `/admin/users/${u.userId}/ban`, { banned: true, reason: 'cheating' })).status).toBe(200);
    expect((await t.http('GET', '/me', undefined, u.accessToken)).status).toBe(403);
    expect((await t.http('POST', '/auth/refresh', { refreshToken: u.refreshToken })).status).toBe(401);
    expect((await as('ADMIN', 'GET', '/admin/users?banned=true')).body.items.some((x: any) => x.id === u.userId)).toBe(true);
    await as('ADMIN', 'POST', `/admin/users/${u.userId}/ban`, { banned: false });
    expect((await t.http('POST', '/auth/login', { identifier: u.email, password: 'password123' })).status).toBe(200);
    const audit = (await as('SUPER_ADMIN', 'GET', '/admin/audit?pageSize=100')).body.items;
    expect(audit.some((a: any) => a.action === 'user.ban' && a.target === u.userId && a.meta.reason === 'cheating')).toBe(true);
  });

  it('wallet adjustments are validated, idempotent, ledgered as ADMIN_ADJUSTMENT, and cannot overdraw', async () => {
    const u = await t.registerUser('Adj');
    const key = tag() + tag();
    const body = { amount: 250, note: 'compensation for bug', idempotencyKey: key };
    expect((await as('FINANCE_MANAGER', 'POST', `/admin/users/${u.userId}/wallet-adjust`, body)).body.balance).toBe(750);
    expect((await as('FINANCE_MANAGER', 'POST', `/admin/users/${u.userId}/wallet-adjust`, body)).body.balance).toBe(750); // retry = same result
    expect(Number((await t.db.wallet.findUniqueOrThrow({ where: { userId: u.userId } })).balance)).toBe(750);
    expect((await as('FINANCE_MANAGER', 'POST', `/admin/users/${u.userId}/wallet-adjust`, { amount: 0, note: 'zero zero', idempotencyKey: tag() + tag() })).status).toBe(400);
    expect((await as('FINANCE_MANAGER', 'POST', `/admin/users/${u.userId}/wallet-adjust`, { amount: -5_000_000, note: 'too much', idempotencyKey: tag() + tag() })).status).toBe(400);
    expect((await as('FINANCE_MANAGER', 'POST', `/admin/users/${u.userId}/wallet-adjust`, { amount: -100_000, note: 'overdraw', idempotencyKey: tag() + tag() })).status).toBeGreaterThanOrEqual(400);
    expect((await as('FINANCE_MANAGER', 'POST', `/admin/users/${u.userId}/wallet-adjust`, { amount: -50, note: 'chargeback', idempotencyKey: tag() + tag() })).body.balance).toBe(700);
    const tx = (await as('FINANCE_MANAGER', 'GET', `/admin/transactions?userId=${u.userId}&type=ADMIN_ADJUSTMENT`)).body;
    expect(tx.total).toBe(2);
    expect(tx.items.map((x: any) => x.amount).sort()).toEqual([-50, 250]);
  });
});

describe('moderation workflow', () => {
  it('suspicious match review, report handling with ban only for those allowed', async () => {
    const a = await t.registerUser('Mo'); const b = await t.registerUser('Mp');
    const match = await t.db.match.create({ data: { mode: 'quick', status: 'FINISHED', seed: 1, suspicious: true, players: { create: [{ userId: a.userId, side: 0 }, { userId: b.userId, side: 1 }] } } });
    await t.db.gameEvent.create({ data: { matchId: match.id, userId: a.userId, type: 'rejected_shot', payload: { reason: 'shot_too_fast' } } });
    const list = (await as('GAME_MANAGER', 'GET', '/admin/matches?suspicious=true&reviewed=false')).body;
    expect(list.items.some((m: any) => m.id === match.id)).toBe(true);
    const detail = (await as('SUPPORT_MANAGER', 'GET', `/admin/matches/${match.id}`)).body;
    expect(detail.events[0].payload.reason).toBe('shot_too_fast');
    expect(detail.players.map((p: any) => p.username)).toContain(a.username);
    expect((await as('SUPPORT_MANAGER', 'POST', `/admin/matches/${match.id}/review`, { suspicious: true })).status).toBe(403);
    expect((await as('GAME_MANAGER', 'POST', `/admin/matches/${match.id}/review`, { suspicious: false, note: 'false positive' })).status).toBe(200);
    expect(await t.db.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ suspicious: false, reviewed: true });

    const rep = await t.http('POST', '/reports', { targetId: b.userId, type: 'ABUSE', details: 'rude' }, a.accessToken);
    expect((await as('SUPPORT_MANAGER', 'PATCH', `/admin/reports/${rep.body.id}`, { status: 'RESOLVED', banTarget: true })).status).toBe(403); // support can't ban
    expect((await as('SUPPORT_MANAGER', 'PATCH', `/admin/reports/${rep.body.id}`, { status: 'UNDER_REVIEW' })).status).toBe(200);
    expect((await as('ADMIN', 'PATCH', `/admin/reports/${rep.body.id}`, { status: 'RESOLVED', resolution: 'warned and banned', banTarget: true })).status).toBe(200);
    expect((await t.db.user.findUniqueOrThrow({ where: { id: b.userId } })).isBanned).toBe(true);
    expect((await t.http('GET', '/notifications', undefined, a.accessToken)).body.items.some((n: any) => n.kind === 'report')).toBe(true);
    expect((await as('SUPPORT_MANAGER', 'GET', '/admin/reports?status=RESOLVED')).body.items.some((r: any) => r.id === rep.body.id)).toBe(true);
  });

  it('support: reply, internal note, status, assignment', async () => {
    const u = await t.registerUser('Sp');
    const tk = (await t.http('POST', '/support/tickets', { category: 'PAYMENT', description: 'I was charged but got no coins' }, u.accessToken)).body.id;
    expect((await as('SUPPORT_MANAGER', 'POST', `/admin/support/${tk}/reply`, { body: 'Looking into it' })).status).toBe(200);
    await as('SUPPORT_MANAGER', 'POST', `/admin/support/${tk}/reply`, { body: 'fraud risk? check receipt', internal: true });
    expect((await as('SUPPORT_MANAGER', 'PATCH', `/admin/support/${tk}`, { assignedTo: ids.SUPPORT_MANAGER })).status).toBe(200);
    expect((await as('SUPPORT_MANAGER', 'PATCH', `/admin/support/${tk}`, { assignedTo: u.userId })).status).toBe(400); // must be an admin
    const admin = (await as('SUPPORT_MANAGER', 'GET', `/admin/support/${tk}`)).body;
    expect(admin).toMatchObject({ status: 'IN_PROGRESS', assignedTo: ids.SUPPORT_MANAGER });
    expect(admin.messages).toHaveLength(2);
    const user = (await t.http('GET', `/support/tickets/${tk}`, undefined, u.accessToken)).body;
    expect(user.messages.map((m: any) => m.body)).toEqual(['Looking into it']); // internal note hidden
    expect((await t.http('GET', '/notifications', undefined, u.accessToken)).body.items.some((n: any) => n.kind === 'support')).toBe(true);
    await as('SUPPORT_MANAGER', 'PATCH', `/admin/support/${tk}`, { status: 'RESOLVED' });
    expect((await as('SUPPORT_MANAGER', 'GET', '/admin/support?status=RESOLVED')).body.items.some((x: any) => x.id === tk)).toBe(true);
  });
});

describe('configuration changes affect the live product', () => {
  it('branding, rules, daily rewards and ads update /config; invalid values are rejected', async () => {
    const orig = { branding: await getSetting(t.db, 'branding'), rules: await getSetting(t.db, 'rules'), daily: await getSetting(t.db, 'daily_rewards') };
    try {
      expect((await as('GAME_MANAGER', 'PUT', '/admin/settings/branding', { name: 'MY CARROM', tagline: 'Go!', primaryColor: '#112233' })).status).toBe(200);
      expect((await as('GAME_MANAGER', 'PUT', '/admin/settings/branding', { name: 'X', tagline: '', primaryColor: 'red' })).status).toBe(400);
      expect((await as('GAME_MANAGER', 'PUT', '/admin/settings/rules', { ...DEFAULT_RULES, queenPoints: 9, queenCoverRequired: false, foulReturnCount: 2 })).status).toBe(200);
      expect((await as('GAME_MANAGER', 'PUT', '/admin/settings/daily_rewards', [1, 2, 3])).status).toBe(400);
      expect((await as('ADMIN', 'PUT', '/admin/settings/daily_rewards', [10, 20, 30, 40, 50, 60, 70])).status).toBe(200);
      clearSettingsCache();
      const c = (await t.http('GET', '/config')).body;
      expect(c.branding).toMatchObject({ name: 'MY CARROM', primaryColor: '#112233' });
      expect(c.rules).toMatchObject({ queenPoints: 9, queenCoverRequired: false, foulReturnCount: 2 });
      expect(c.dailyRewards).toEqual([10, 20, 30, 40, 50, 60, 70]);
      expect((await as('ADMIN', 'PUT', '/admin/settings/nonsense', {})).status).toBe(400);
    } finally {
      await setSetting(t.db, 'branding', orig.branding); await setSetting(t.db, 'rules', orig.rules); await setSetting(t.db, 'daily_rewards', [...orig.daily]);
    }
  });

  it('missions / achievements / items CRUD: create, edit, deactivate; ids validated; changes visible to players', async () => {
    const id = `m_${tag()}`;
    expect((await as('GAME_MANAGER', 'POST', '/admin/missions', { id, title: 'Pocket 20', metric: 'coins_pocketed', target: 20, rewardCoins: 300 })).status).toBe(201);
    expect((await as('GAME_MANAGER', 'POST', '/admin/missions', { id, title: 'dup', metric: 'coins_pocketed', target: 1, rewardCoins: 1 })).status).toBe(409);
    expect((await as('GAME_MANAGER', 'POST', '/admin/missions', { id: 'bad id!', title: 'x', metric: 'coins_pocketed', target: 1, rewardCoins: 1 })).status).toBe(400);
    expect((await as('GAME_MANAGER', 'POST', '/admin/missions', { id: 'zz1', title: 'x', metric: 'made_up', target: 1, rewardCoins: 1 })).status).toBe(400);
    const u = await t.registerUser('Cr');
    expect((await t.http('GET', '/missions', undefined, u.accessToken)).body.find((m: any) => m.id === id).rewardCoins).toBe(300);
    await as('GAME_MANAGER', 'PUT', `/admin/missions/${id}`, { rewardCoins: 450 });
    expect((await t.http('GET', '/missions', undefined, u.accessToken)).body.find((m: any) => m.id === id).rewardCoins).toBe(450);
    await as('GAME_MANAGER', 'DELETE', `/admin/missions/${id}`);
    expect((await t.http('GET', '/missions', undefined, u.accessToken)).body.some((m: any) => m.id === id)).toBe(false);
    expect((await as('GAME_MANAGER', 'PUT', '/admin/missions/does_not_exist', { title: 'x' })).status).toBe(404);

    const item = `it_${tag()}`;
    expect((await as('GAME_MANAGER', 'POST', '/admin/items', { id: item, category: 'STRIKER', name: 'Test Striker', price: 123, rarity: 'EPIC' })).status).toBe(201);
    expect((await t.http('GET', '/shop', undefined, u.accessToken)).body.find((i: any) => i.id === item)).toMatchObject({ price: 123, rarity: 'EPIC', status: 'LOCKED' });
    await as('GAME_MANAGER', 'DELETE', `/admin/items/${item}`);
    expect((await t.http('GET', '/shop', undefined, u.accessToken)).body.some((i: any) => i.id === item)).toBe(false);
  });

  it('broadcast reaches every active user but not banned ones', async () => {
    const a = await t.registerUser('Bc1'); const b = await t.registerUser('Bc2');
    await t.db.user.update({ where: { id: b.userId }, data: { isBanned: true } });
    const r = await as('GAME_MANAGER', 'POST', '/admin/notifications/broadcast', { title: 'New event!', body: 'Weekend tournament is live', userIds: [a.userId, b.userId] });
    expect(r.body.recipients).toBe(1);
    expect((await t.http('GET', '/notifications', undefined, a.accessToken)).body.items[0]).toMatchObject({ title: 'New event!', kind: 'event' });
    expect((await as('SUPPORT_MANAGER', 'POST', '/admin/notifications/broadcast', { title: 'x', body: 'y', userIds: [a.userId] })).status).toBe(200); // support may notify
    expect((await as('FINANCE_MANAGER', 'POST', '/admin/notifications/broadcast', { title: 'x', body: 'y' })).status).toBe(403);
  });
});

describe('admin management safeguards', () => {
  it('only super admins manage admins; the last super admin cannot be removed or demoted', async () => {
    const email = `new_${tag()}@admin.dev`;
    expect((await as('ADMIN', 'POST', '/admin/admins', { email, password: 'long-enough-pw', role: 'ADMIN' })).status).toBe(403);
    expect((await as('SUPER_ADMIN', 'POST', '/admin/admins', { email, password: 'short', role: 'ADMIN' })).status).toBe(400);
    const c = await as('SUPER_ADMIN', 'POST', '/admin/admins', { email, password: 'long-enough-pw', role: 'GAME_MANAGER' });
    expect(c.status).toBe(201);
    expect((await as('SUPER_ADMIN', 'POST', '/admin/admins', { email, password: 'long-enough-pw', role: 'ADMIN' })).status).toBe(409);
    expect((await t.http('POST', '/admin/auth/login', { email, password: 'long-enough-pw' })).status).toBe(200);
    await as('SUPER_ADMIN', 'PATCH', `/admin/admins/${c.body.id}`, { role: 'FINANCE_MANAGER' });
    expect((await t.db.adminUser.findUniqueOrThrow({ where: { id: c.body.id } })).role).toBe('FINANCE_MANAGER');
    expect((await as('SUPER_ADMIN', 'DELETE', `/admin/admins/${ids.SUPER_ADMIN}`)).status).toBe(400); // not yourself
    await as('SUPER_ADMIN', 'DELETE', `/admin/admins/${c.body.id}`);
    // make sure exactly one super admin exists, then try to demote / delete it through another path
    await t.db.adminUser.updateMany({ where: { role: 'SUPER_ADMIN', id: { not: ids.SUPER_ADMIN } }, data: { role: 'ADMIN' } });
    expect((await as('SUPER_ADMIN', 'PATCH', `/admin/admins/${ids.SUPER_ADMIN}`, { role: 'ADMIN' })).status).toBe(409);
  });
});

describe('analytics', () => {
  it('returns totals, economy and daily series', async () => {
    const a = (await as('ADMIN', 'GET', '/admin/analytics')).body;
    expect(a.totals.users).toBeGreaterThan(5);
    expect(a.economy.coinsInCirculation).toBeGreaterThan(0);
    expect(Array.isArray(a.matchesPerDay)).toBe(true);
    expect(a.newUsersPerDay.at(-1).count).toBeGreaterThan(0);
  });
});
