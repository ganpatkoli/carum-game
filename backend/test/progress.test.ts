import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, tag } from './helpers';
import { nextStreakDay } from '../src/wallet/rewards.service';
import { levelForXp, xpForLevel } from '../src/common/progress';
import { setSetting, getSetting, clearSettingsCache } from '../src/common/settings';
import { trackMissions, evaluateAchievements } from '../src/missions/progress';
import { validateOffline } from '../src/sync/service';
import { periodStart } from '../src/leaderboards/service';
import { purchaseVerifiers } from '../src/monetization/service';
import jwt from 'jsonwebtoken';
import { config } from '../src/common/config';

let t: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => { t = await startTestServer(); });
afterAll(async () => { await t.stop(); });
const bal = async (userId: string) => Number((await t.db.wallet.findUniqueOrThrow({ where: { userId } })).balance);

describe('levels', () => {
  it('level curve is monotonic and invertible', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    for (let l = 1; l < 30; l++) expect(levelForXp(xpForLevel(l))).toBe(l);
  });
});

describe('daily rewards', () => {
  it('streak logic: first claim, consecutive, missed day resets, wraps after day 7', () => {
    expect(nextStreakDay(null, 0, '2026-01-10')).toBe(1);
    expect(nextStreakDay('2026-01-10', 1, '2026-01-10')).toBeNull();
    expect(nextStreakDay('2026-01-10', 1, '2026-01-11')).toBe(2);
    expect(nextStreakDay('2026-01-10', 3, '2026-01-12')).toBe(1);
    expect(nextStreakDay('2026-01-10', 7, '2026-01-11')).toBe(1);
  });

  it('claim over HTTP, status endpoint, and admin-configured amounts take effect', async () => {
    const u = await t.registerUser('Dr');
    const s0 = await t.http('GET', '/rewards/daily', undefined, u.accessToken);
    expect(s0.body).toMatchObject({ canClaim: true, nextDay: 1 });
    const orig = await getSetting(t.db, 'daily_rewards');
    try {
      await setSetting(t.db, 'daily_rewards', [7, 8, 9, 10, 11, 12, 13]);
      const before = await bal(u.userId);
      const c = await t.http('POST', '/rewards/daily/claim', {}, u.accessToken);
      expect(c.body).toMatchObject({ day: 1, amount: 7 });
      expect(await bal(u.userId)).toBe(before + 7);
      expect((await t.http('POST', '/rewards/daily/claim', {}, u.accessToken)).status).toBe(409);
      expect((await t.http('GET', '/rewards/daily', undefined, u.accessToken)).body).toMatchObject({ canClaim: false, claimedToday: true });
    } finally { await setSetting(t.db, 'daily_rewards', [...orig]); }
  });
});

describe('missions & achievements', () => {
  const facts = (userId: string, over: Partial<Parameters<typeof trackMissions>[1]> = {}) => ({ userId, won: true, draw: false, friendMatch: false, pocketed: 6, queenCovers: 0, fouls: 0, perfect: false, ...over });

  it('progress accumulates, caps at target, and can be claimed exactly once', async () => {
    const u = await t.registerUser('Ms');
    await trackMissions(t.db, facts(u.userId));
    await trackMissions(t.db, facts(u.userId, { pocketed: 2 }));
    const list = (await t.http('GET', '/missions', undefined, u.accessToken)).body;
    const m = (id: string) => list.find((x: any) => x.id === id);
    expect(m('play_1')).toMatchObject({ progress: 1, claimable: true });
    expect(m('pocket_5')).toMatchObject({ progress: 5, claimable: true }); // 6+2 capped at 5
    expect(m('win_3')).toMatchObject({ progress: 2, claimable: false });
    expect(m('friend_1').progress).toBe(0);

    expect((await t.http('POST', '/missions/win_3/claim', {}, u.accessToken)).status).toBe(409);
    const before = await bal(u.userId);
    const [a, b] = await Promise.all([t.http('POST', '/missions/play_1/claim', {}, u.accessToken), t.http('POST', '/missions/play_1/claim', {}, u.accessToken)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]); // double-tap pays once
    expect(await bal(u.userId)).toBe(before + 50);
    expect((await t.http('GET', '/missions', undefined, u.accessToken)).body.find((x: any) => x.id === 'play_1')).toMatchObject({ claimed: true, claimable: false });
  });

  it('unlocks achievements once, pays the reward and notifies', async () => {
    const u = await t.registerUser('Ac');
    await t.db.profile.update({ where: { userId: u.userId }, data: { matchesWon: 1, matchesPlayed: 1, currentStreak: 1 } });
    const before = await bal(u.userId);
    expect(await evaluateAchievements(t.db, facts(u.userId))).toContain('FIRST_WIN');
    expect(await bal(u.userId)).toBe(before + 100);
    expect(await evaluateAchievements(t.db, facts(u.userId))).not.toContain('FIRST_WIN'); // not twice
    expect(await bal(u.userId)).toBe(before + 100);
    const list = (await t.http('GET', '/achievements', undefined, u.accessToken)).body;
    expect(list.find((a: any) => a.id === 'FIRST_WIN').unlocked).toBe(true);
    expect(list.find((a: any) => a.id === '10_WINS').unlocked).toBe(false);
    expect((await t.http('GET', '/notifications', undefined, u.accessToken)).body.items.some((n: any) => n.kind === 'achievement')).toBe(true);
  });

  it('streak and perfect-game achievements', async () => {
    const u = await t.registerUser('St');
    await t.db.profile.update({ where: { userId: u.userId }, data: { matchesWon: 5, matchesPlayed: 5, currentStreak: 5 } });
    const got = await evaluateAchievements(t.db, facts(u.userId, { perfect: true }));
    expect(got).toEqual(expect.arrayContaining(['FIRST_WIN', 'WIN_STREAK_5', 'PERFECT_GAME']));
    expect(got).not.toContain('WIN_STREAK_10');
  });
});

describe('shop & inventory', () => {
  it('buying debits once, grants the item, then equipping swaps within a category', async () => {
    const u = await t.registerUser('Sh');
    await t.db.$executeRaw`UPDATE "Wallet" SET balance = 5000, "totalEarned" = 5000 + "totalSpent" WHERE "userId" = ${u.userId}::uuid`;
    const shop = (await t.http('GET', '/shop', undefined, u.accessToken)).body;
    expect(shop.find((i: any) => i.id === 'striker_classic')).toMatchObject({ owned: true, status: 'OWNED' });
    expect(shop.find((i: any) => i.id === 'striker_gold')).toMatchObject({ owned: false, status: 'LOCKED', price: 800 });

    expect((await t.http('POST', '/inventory/equip', { itemId: 'striker_gold' }, u.accessToken)).status).toBe(403);
    const b = await t.http('POST', '/shop/buy', { itemId: 'striker_gold' }, u.accessToken);
    expect(b.body.balance).toBe(4200);
    expect((await t.http('POST', '/shop/buy', { itemId: 'striker_gold' }, u.accessToken)).status).toBe(409);
    expect(await bal(u.userId)).toBe(4200);

    await t.http('POST', '/inventory/equip', { itemId: 'striker_classic' }, u.accessToken);
    await t.http('POST', '/inventory/equip', { itemId: 'striker_gold' }, u.accessToken);
    const inv = (await t.http('GET', '/inventory', undefined, u.accessToken)).body;
    expect(inv.filter((i: any) => i.category === 'STRIKER' && i.equipped).map((i: any) => i.id)).toEqual(['striker_gold']);
    expect((await t.http('GET', '/me', undefined, u.accessToken)).body.equipped).toContain('striker_gold');
  });

  it('cannot buy what you cannot afford, and nothing is granted', async () => {
    const u = await t.registerUser('Bk');
    const r = await t.http('POST', '/shop/buy', { itemId: 'striker_premium' }, u.accessToken);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect((await t.http('GET', '/inventory', undefined, u.accessToken)).body.some((i: any) => i.id === 'striker_premium')).toBe(false);
    expect((await t.http('POST', '/shop/buy', { itemId: 'nope' }, u.accessToken)).status).toBe(404);
  });

  it('allows several emotes but caps them at six', async () => {
    const u = await t.registerUser('Em');
    for (const e of ['thumbs_up', 'laugh', 'fire', 'gg', 'nice', 'oops']) expect((await t.http('POST', '/inventory/equip', { itemId: `emote_${e}` }, u.accessToken)).status).toBe(200);
    await t.db.inventoryItem.upsert({ where: { id: 'emote_extra' }, update: {}, create: { id: 'emote_extra', category: 'EMOTE', name: 'extra', price: 0 } });
    expect((await t.http('POST', '/inventory/equip', { itemId: 'emote_extra' }, u.accessToken)).status).toBe(409);
    await t.db.inventoryItem.delete({ where: { id: 'emote_extra' } });
  });
});

describe('ads', () => {
  const ageTicket = (ticket: string) => { const p = jwt.decode(ticket) as any; return jwt.sign({ sub: p.sub, k: 'ad', jti: p.jti, iat: Math.floor(Date.now() / 1000) - 60 }, config.accessSecret, { expiresIn: '10m' }); };

  it('rewarded ad: must be watched, pays once, then cooldown applies', async () => {
    const u = await t.registerUser('Ad');
    const s = await t.http('POST', '/ads/rewarded/start', {}, u.accessToken);
    expect(s.body.rewardCoins).toBe(50);
    // claiming instantly = skipped ad
    expect((await t.http('POST', '/ads/rewarded/claim', { ticket: s.body.ticket }, u.accessToken)).status).toBe(400);
    const watched = ageTicket(s.body.ticket);
    const before = await bal(u.userId);
    expect((await t.http('POST', '/ads/rewarded/claim', { ticket: watched }, u.accessToken)).body.coins).toBe(50);
    expect(await bal(u.userId)).toBe(before + 50);
    // replaying the same ticket never double pays
    await t.http('POST', '/ads/rewarded/claim', { ticket: watched }, u.accessToken);
    expect(await bal(u.userId)).toBe(before + 50);
    // cooldown
    expect((await t.http('POST', '/ads/rewarded/start', {}, u.accessToken)).status).toBe(429);
    // someone else's ticket is useless
    const other = await t.registerUser('Ad2');
    expect((await t.http('POST', '/ads/rewarded/claim', { ticket: watched }, other.accessToken)).status).toBe(400);
  });

  it('admin switches: disabled ads refuse, daily cap enforced', async () => {
    const orig = await getSetting(t.db, 'ads');
    try {
      await setSetting(t.db, 'ads', { ...orig, rewardedEnabled: false });
      const u = await t.registerUser('Ad3');
      expect((await t.http('POST', '/ads/rewarded/start', {}, u.accessToken)).status).toBe(403);
      await setSetting(t.db, 'ads', { ...orig, rewardedCooldownSec: 0, rewardedDailyCap: 2 });
      for (let i = 0; i < 2; i++) { const s = await t.http('POST', '/ads/rewarded/start', {}, u.accessToken); expect((await t.http('POST', '/ads/rewarded/claim', { ticket: ageTicket(s.body.ticket) }, u.accessToken)).status).toBe(200); }
      expect((await t.http('POST', '/ads/rewarded/start', {}, u.accessToken)).status).toBe(429);
    } finally { await setSetting(t.db, 'ads', orig); }
  });
});

describe('in-app purchases', () => {
  it('redeems a verified receipt exactly once; unverified providers refuse; remove-ads turns banners off', async () => {
    const u = await t.registerUser('Iap');
    const before = await bal(u.userId);
    const r = `r-${tag()}`;
    const a = await t.http('POST', '/store/redeem', { provider: 'dev', productId: 'coins_small', receipt: r }, u.accessToken);
    expect(a.body).toMatchObject({ alreadyProcessed: false, coins: 500 });
    expect((await t.http('POST', '/store/redeem', { provider: 'dev', productId: 'coins_small', receipt: r }, u.accessToken)).body.alreadyProcessed).toBe(true);
    expect(await bal(u.userId)).toBe(before + 500);
    // same receipt from another account is refused
    const v = await t.registerUser('Iap2');
    expect((await t.http('POST', '/store/redeem', { provider: 'dev', productId: 'coins_small', receipt: r }, v.accessToken)).status).toBe(409);
    expect((await t.http('POST', '/store/redeem', { provider: 'google', productId: 'coins_small', receipt: 'x' }, u.accessToken)).status).toBe(501);
    expect((await t.http('POST', '/store/redeem', { provider: 'dev', productId: 'nope', receipt: 'x' }, u.accessToken)).status).toBe(404);

    expect((await t.http('GET', '/ads/config', undefined, u.accessToken)).body.bannerEnabled).toBe(true);
    await t.http('POST', '/store/redeem', { provider: 'dev', productId: 'remove_ads', receipt: `r-${tag()}` }, u.accessToken);
    expect((await t.http('GET', '/ads/config', undefined, u.accessToken)).body).toMatchObject({ adsRemoved: true, bannerEnabled: false, interstitialEnabled: false });
  });

  it('dev billing is disabled in production', async () => {
    const prev = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
    try { await expect(purchaseVerifiers.dev.verify({ productId: 'x', receipt: 'y', userId: 'z' })).rejects.toThrow(); } finally { process.env.NODE_ENV = prev; }
  });
});

describe('reports & support', () => {
  it('report validation, duplicate throttle, and auto-flagging after three cheating reports', async () => {
    const target = await t.registerUser('Rt');
    const match = await t.db.match.create({ data: { mode: 'quick', status: 'FINISHED', seed: 1 } });
    expect((await t.http('POST', '/reports', { targetId: target.userId, type: 'CHEATING' }, target.accessToken)).status).toBe(400);
    for (let i = 0; i < 3; i++) {
      const r = await t.registerUser('Rr');
      expect((await t.http('POST', '/reports', { targetId: target.userId, type: 'CHEATING', matchId: match.id, details: 'speed hack' }, r.accessToken)).status).toBe(201);
      if (i === 0) expect((await t.http('POST', '/reports', { targetId: target.userId, type: 'CHEATING' }, r.accessToken)).status).toBe(429);
    }
    expect((await t.db.match.findUniqueOrThrow({ where: { id: match.id } })).suspicious).toBe(true);
  });

  it('support tickets: create with screenshot, converse, hide internal notes, ownership enforced', async () => {
    const u = await t.registerUser('Su'); const v = await t.registerUser('Sv');
    const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]).toString('base64');
    expect((await t.http('POST', '/support/tickets', { category: 'BUG', description: 'short' }, u.accessToken)).status).toBe(400);
    const c = await t.http('POST', '/support/tickets', { category: 'BUG', description: 'The striker disappears after my shot', screenshot: png }, u.accessToken);
    expect(c.status).toBe(201);
    const id = c.body.id;
    await t.db.supportMessage.create({ data: { ticketId: id, authorId: u.userId, body: 'internal secret', internal: true } });
    await t.http('POST', `/support/tickets/${id}/messages`, { body: 'Any update?' }, u.accessToken);
    const d = (await t.http('GET', `/support/tickets/${id}`, undefined, u.accessToken)).body;
    expect(d.screenshotUrl).toMatch(/^\/uploads\/support\//);
    expect(d.messages.map((m: any) => m.body)).toEqual(['Any update?']);
    expect((await t.http('GET', `/support/tickets/${id}`, undefined, v.accessToken)).status).toBe(404);
    expect((await t.http('POST', `/support/tickets/${id}/messages`, { body: 'hi' }, v.accessToken)).status).toBe(404);
    expect((await t.http('GET', '/support/tickets', undefined, u.accessToken)).body).toHaveLength(1);
  });
});

describe('leaderboards', () => {
  it('global ranks by rating; friends board only shows friends; disabled boards 404', async () => {
    const a = await t.registerUser('La'); const b = await t.registerUser('Lb'); const c = await t.registerUser('Lc');
    await t.db.rating.update({ where: { userId: a.userId }, data: { rating: 9000 } });
    await t.db.rating.update({ where: { userId: b.userId }, data: { rating: 8000 } });
    await t.db.rating.update({ where: { userId: c.userId }, data: { rating: 7000 } });
    const g = (await t.http('GET', '/leaderboard?type=global&limit=100', undefined, c.accessToken)).body;
    const names = g.rows.map((r: any) => r.userId);
    expect(names.indexOf(a.userId)).toBeLessThan(names.indexOf(b.userId));
    expect(names.indexOf(b.userId)).toBeLessThan(names.indexOf(c.userId));
    expect(g.me.userId).toBe(c.userId);

    await t.http('POST', '/friends/requests', { toUserId: a.userId }, c.accessToken);
    const id = (await t.http('GET', '/friends/requests', undefined, a.accessToken)).body.incoming[0].id;
    await t.http('POST', `/friends/requests/${id}/accept`, {}, a.accessToken);
    const f = (await t.http('GET', '/leaderboard?type=friends', undefined, c.accessToken)).body.rows.map((r: any) => r.userId);
    expect(f).toEqual([a.userId, c.userId]);

    const orig = await getSetting(t.db, 'leaderboard_periods');
    try { await setSetting(t.db, 'leaderboard_periods', { ...orig, weekly: false }); expect((await t.http('GET', '/leaderboard?type=weekly', undefined, c.accessToken)).status).toBe(404); }
    finally { await setSetting(t.db, 'leaderboard_periods', orig); }
  });

  it('country board filters by country and weekly board counts this week’s wins', async () => {
    const a = await t.registerUser('Ca', { country: 'NZ' }); const b = await t.registerUser('Cb', { country: 'NZ' }); const c = await t.registerUser('Cc', { country: 'IS' });
    const rows = (await t.http('GET', '/leaderboard?type=country', undefined, a.accessToken)).body.rows.map((r: any) => r.userId);
    expect(rows).toEqual(expect.arrayContaining([a.userId, b.userId])); expect(rows).not.toContain(c.userId);

    const m = await t.db.match.create({ data: { mode: 'quick', status: 'FINISHED', seed: 1, endedAt: new Date(), ranked: true } });
    await t.db.matchPlayer.createMany({ data: [{ matchId: m.id, userId: a.userId, side: 0, ratingBefore: 1200, ratingAfter: 1220 }, { matchId: m.id, userId: b.userId, side: 1, ratingBefore: 1200, ratingAfter: 1180 }] });
    await t.db.gameResult.create({ data: { matchId: m.id, winnerId: a.userId, winnerSide: 0, reason: 'completed', scores: [5, 2] } });
    const w = (await t.http('GET', '/leaderboard?type=weekly', undefined, a.accessToken)).body.rows;
    const ra = w.find((r: any) => r.userId === a.userId), rb = w.find((r: any) => r.userId === b.userId);
    expect(ra).toMatchObject({ periodWins: 1, ratingGain: 20 });
    expect(rb.periodWins).toBe(0);
    expect(w.findIndex((r: any) => r.userId === a.userId)).toBeLessThan(w.findIndex((r: any) => r.userId === b.userId));
  });

  it('period boundaries: weekly starts Monday UTC, monthly on the 1st', () => {
    const wed = new Date('2026-03-18T15:00:00Z');
    expect(periodStart('weekly', wed).toISOString()).toBe('2026-03-16T00:00:00.000Z');
    expect(periodStart('monthly', wed).toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(periodStart('weekly', new Date('2026-03-15T10:00:00Z')).toISOString()).toBe('2026-03-09T00:00:00.000Z'); // Sunday belongs to the previous week
  });
});

describe('offline sync', () => {
  const m = (over: Record<string, unknown> = {}) => ({ clientId: 'c-' + tag() + tag(), difficulty: 'hard', result: 'win', scores: [6, 2], durationSec: 240, startedAt: Date.now() - 3600_000, ...over });

  it('validation rules', () => {
    expect(validateOffline(m() as any)).toBeNull();
    expect(validateOffline(m({ durationSec: 5 }) as any)).toBe('too_short');
    expect(validateOffline(m({ startedAt: Date.now() + 10 * 60_000 }) as any)).toBe('future_timestamp');
    expect(validateOffline(m({ startedAt: Date.now() - 40 * 86_400_000 }) as any)).toBe('too_old');
    expect(validateOffline(m({ result: 'win', scores: [1, 5] }) as any)).toBe('result_mismatch');
    expect(validateOffline(m({ result: 'draw', scores: [3, 2] }) as any)).toBe('result_mismatch');
  });

  it('accepts valid results into stats only, is idempotent, and never touches coins/rating/xp', async () => {
    const u = await t.registerUser('Of');
    const before = await bal(u.userId);
    const good = m(); const bad = m({ result: 'win', scores: [0, 5] }); const tooFast = m({ durationSec: 3 });
    const r = await t.http('POST', '/sync/offline', { matches: [good, bad, tooFast] }, u.accessToken);
    expect(r.body.results.map((x: any) => x.accepted)).toEqual([true, false, false]);
    const again = await t.http('POST', '/sync/offline', { matches: [good] }, u.accessToken);
    expect(again.body.results[0].reason).toBe('duplicate');
    const me = (await t.http('GET', '/me', undefined, u.accessToken)).body;
    expect(me.profile).toMatchObject({ matchesPlayed: 1, matchesWon: 1, xp: 0 });
    expect(me.rating.rating).toBe(1200);
    expect(await bal(u.userId)).toBe(before);
    // another user cannot replay someone else's client id
    const o = await t.registerUser('Of2');
    expect((await t.http('POST', '/sync/offline', { matches: [good] }, o.accessToken)).body.results[0].accepted).toBe(false);
  });

  it('caps accepted offline matches per day', async () => {
    const u = await t.registerUser('Cap');
    const batch = () => Array.from({ length: 20 }, () => m());
    await t.http('POST', '/sync/offline', { matches: batch() }, u.accessToken);
    const r = await t.http('POST', '/sync/offline', { matches: batch() }, u.accessToken);
    expect(r.body.results.filter((x: any) => x.accepted)).toHaveLength(10);
    expect(r.body.results.at(-1).reason).toBe('daily_limit');
    expect((await t.http('POST', '/sync/offline', { matches: Array.from({ length: 21 }, () => m()) }, u.accessToken)).status).toBe(400);
  });
});

describe('settings fall back safely', () => {
  it('invalid stored values fall back to defaults and writes are validated', async () => {
    await t.db.appSetting.upsert({ where: { key: 'rules' }, update: { value: { queenPoints: 'lots' } }, create: { key: 'rules', value: { queenPoints: 'lots' } } });
    clearSettingsCache();
    expect((await getSetting(t.db, 'rules')).queenPoints).toBe(3);
    await expect(setSetting(t.db, 'rules', { queenPoints: -1 })).rejects.toThrow();
    await setSetting(t.db, 'rules', (await import('@carrom/game-core')).DEFAULT_RULES);
  });
});
