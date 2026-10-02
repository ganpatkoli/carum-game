import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { cleanupExpired, dailyRewardReminders, reconcileStaleMatches, weeklyLeaderboardNotices } from './jobs';
import { applyWalletTx, createWallet } from '../wallet/wallet.service';
import { setPushSender } from '../notifications/notify';

const db = new PrismaClient();
const mkUser = async (extra: Record<string, unknown> = {}) => {
  const u = await db.user.create({ data: { email: `j${Math.random().toString(36).slice(2)}@t.dev`, profile: { create: { name: 'J', username: `j_${Math.random().toString(36).slice(2, 9)}` } }, rating: { create: {} }, ...extra } });
  await createWallet(db, u.id);
  return u;
};
beforeAll(() => setPushSender(async () => {}));
afterAll(async () => { await db.$disconnect(); });

describe('background jobs', () => {
  it('cleans expired OTPs, old sessions and stale open rooms but leaves fresh data', async () => {
    const u = await mkUser();
    const old = new Date(Date.now() - 3 * 86_400_000);
    await db.otpCode.createMany({ data: [{ target: 'x', purpose: 'register', codeHash: 'h', expiresAt: old }, { target: 'y', purpose: 'register', codeHash: 'h', expiresAt: new Date(Date.now() + 60_000) }] });
    await db.session.create({ data: { userId: u.id, refreshTokenHash: 'old-' + u.id, expiresAt: old } });
    await db.session.create({ data: { userId: u.id, refreshTokenHash: 'new-' + u.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const stale = await db.room.create({ data: { code: 'CARROM-' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0'), hostId: u.id, createdAt: new Date(Date.now() - 5 * 3_600_000) } });
    const r = await cleanupExpired(db);
    expect(r.otp).toBeGreaterThanOrEqual(1); expect(r.sessions).toBeGreaterThanOrEqual(1); expect(r.rooms).toBeGreaterThanOrEqual(1);
    expect(await db.otpCode.count({ where: { target: 'y' } })).toBeGreaterThanOrEqual(1);
    expect(await db.session.findUnique({ where: { refreshTokenHash: 'new-' + u.id } })).toBeTruthy();
    expect((await db.room.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('CLOSED');
  });

  it('abandoned in-progress matches are closed and entry fees refunded exactly once', async () => {
    const a = await mkUser(); const b = await mkUser();
    for (const u of [a, b]) await applyWalletTx(db, { userId: u.id, type: 'BONUS', amount: 300, idempotencyKey: `seed:${u.id}` });
    const m = await db.match.create({ data: { mode: 'quick', status: 'IN_PROGRESS', seed: 1, entryCoins: 100, startedAt: new Date(Date.now() - 5 * 3_600_000), players: { create: [{ userId: a.id, side: 0 }, { userId: b.id, side: 1 }] } } });
    for (const u of [a, b]) await applyWalletTx(db, { userId: u.id, type: 'GAME_ENTRY', amount: -100, idempotencyKey: `entry:${m.id}:${u.id}` });
    // a live session is never touched
    expect((await reconcileStaleMatches(db, new Set([m.id]))).abandoned).toBe(0);
    expect((await db.match.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('IN_PROGRESS');
    const r = await reconcileStaleMatches(db, new Set());
    expect(r.abandoned).toBeGreaterThanOrEqual(1);
    expect((await db.match.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('ABANDONED');
    for (const u of [a, b]) expect(Number((await db.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance)).toBe(300);
    await reconcileStaleMatches(db, new Set()); // second run: nothing changes
    for (const u of [a, b]) expect(Number((await db.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance)).toBe(300);
  });

  it('daily reminders go only to recently-active players who have not claimed, once per day', async () => {
    const active = await mkUser({ lastSeenAt: new Date() });
    const claimed = await mkUser({ lastSeenAt: new Date() });
    const dormant = await mkUser({ lastSeenAt: new Date(Date.now() - 60 * 86_400_000) });
    await applyWalletTx(db, { userId: claimed.id, type: 'DAILY_REWARD', amount: 100, idempotencyKey: `daily:${claimed.id}:${new Date().toISOString().slice(0, 10)}`, refId: '1' });
    await dailyRewardReminders(db);
    expect(await db.notification.count({ where: { userId: active.id, kind: 'daily_reward' } })).toBe(1);
    expect(await db.notification.count({ where: { userId: claimed.id, kind: 'daily_reward' } })).toBe(0);
    expect(await db.notification.count({ where: { userId: dormant.id, kind: 'daily_reward' } })).toBe(0);
    await dailyRewardReminders(db); // idempotent within the day
    expect(await db.notification.count({ where: { userId: active.id, kind: 'daily_reward' } })).toBe(1);
  });

  it('weekly leaderboard notice reaches last week’s top players once', async () => {
    const w = await mkUser(); const l = await mkUser();
    const lastWeek = new Date(Date.now() - 7 * 86_400_000);
    const m = await db.match.create({ data: { mode: 'quick', status: 'FINISHED', seed: 1, ranked: true, endedAt: lastWeek, players: { create: [{ userId: w.id, side: 0 }, { userId: l.id, side: 1 }] } } });
    await db.gameResult.create({ data: { matchId: m.id, winnerId: w.id, winnerSide: 0, reason: 'completed', scores: [5, 1] } });
    const next = new Date(Date.now() + 1000); // "now" is in the following week of the match
    const r1 = await weeklyLeaderboardNotices(db, new Date(lastWeek.getTime() + 7 * 86_400_000 + 3_600_000));
    expect(r1.sent).toBeGreaterThanOrEqual(1);
    expect(await db.notification.count({ where: { userId: w.id, kind: 'leaderboard' } })).toBe(1);
    expect(await db.notification.count({ where: { userId: l.id, kind: 'leaderboard' } })).toBe(0);
    await weeklyLeaderboardNotices(db, new Date(lastWeek.getTime() + 7 * 86_400_000 + 3_600_000));
    expect(await db.notification.count({ where: { userId: w.id, kind: 'leaderboard' } })).toBe(1);
    void next;
  });
});
