import type { PrismaClient } from '@prisma/client';
import { notify } from '../notifications/notify';
import { applyWalletTx } from '../wallet/wallet.service';
import { dayKey } from '../missions/progress';
import { periodStart } from '../leaderboards/service';

const HOUR = 3_600_000;

/** Housekeeping: expired OTPs, old sessions, rooms nobody started. Safe to run repeatedly. */
export async function cleanupExpired(db: PrismaClient, now = new Date()) {
  const dayAgo = new Date(now.getTime() - 24 * HOUR);
  const monthAgo = new Date(now.getTime() - 30 * 24 * HOUR);
  const [otp, sessions, rooms] = await Promise.all([
    db.otpCode.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
    db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: monthAgo } }] } }),
    db.room.updateMany({ where: { status: { in: ['OPEN', 'FULL'] }, createdAt: { lt: new Date(now.getTime() - 2 * HOUR) } }, data: { status: 'CLOSED' } }),
  ]);
  return { otp: otp.count, sessions: sessions.count, rooms: rooms.count };
}

/**
 * A match left IN_PROGRESS for hours with no live session (server crash without Redis, lost state) is abandoned,
 * and any entry fees are refunded exactly once (idempotent per match+player).
 */
export async function reconcileStaleMatches(db: PrismaClient, activeMatchIds: Set<string>, now = new Date(), maxAgeHours = 3) {
  const stale = await db.match.findMany({ where: { status: 'IN_PROGRESS', startedAt: { lt: new Date(now.getTime() - maxAgeHours * HOUR) } }, include: { players: true } });
  let refunded = 0;
  for (const m of stale) {
    if (activeMatchIds.has(m.id)) continue;
    if (m.entryCoins > 0) {
      for (const p of m.players) {
        await applyWalletTx(db, { userId: p.userId, type: 'REFUND', amount: m.entryCoins, idempotencyKey: `abandon:${m.id}:${p.userId}`, refType: 'match', refId: m.id, note: 'match abandoned' });
        refunded++;
      }
    }
    await db.match.update({ where: { id: m.id }, data: { status: 'ABANDONED', endedAt: now } });
  }
  return { abandoned: stale.filter((m) => !activeMatchIds.has(m.id)).length, refunded };
}

/** Nudge players who have a daily reward waiting (recently active, not yet claimed today). One notification per user per day. */
export async function dailyRewardReminders(db: PrismaClient, now = new Date(), limit = 5000) {
  const today = dayKey(now);
  const startOfDay = new Date(`${today}T00:00:00.000Z`);
  const users = await db.user.findMany({
    where: { isBanned: false, isBot: false, lastSeenAt: { gte: new Date(now.getTime() - 14 * 24 * HOUR) } },
    select: { id: true }, take: limit,
  });
  let sent = 0;
  for (const u of users) {
    const claimed = await db.walletTransaction.findFirst({ where: { userId: u.id, type: 'DAILY_REWARD', createdAt: { gte: startOfDay } }, select: { id: true } });
    if (claimed) continue;
    const already = await db.notification.findFirst({ where: { userId: u.id, kind: 'daily_reward', createdAt: { gte: startOfDay } }, select: { id: true } });
    if (already) continue;
    await notify(db, u.id, { kind: 'daily_reward', title: 'Your daily reward is ready', body: 'Open Carrom Arena to claim your coins and keep your streak going.' });
    sent++;
  }
  return { sent };
}

/** After a week ends: tell the top 3 how they finished. */
export async function weeklyLeaderboardNotices(db: PrismaClient, now = new Date()) {
  const thisWeek = periodStart('weekly', now);
  const lastWeek = new Date(thisWeek.getTime() - 7 * 24 * HOUR);
  const rows = await db.$queryRaw<{ userId: string; wins: bigint }[]>`
    SELECT mp."userId" AS "userId", COUNT(*) FILTER (WHERE gr."winnerSide" IS NOT NULL AND gr."winnerSide" = mp.side) AS wins
    FROM "MatchPlayer" mp JOIN "Match" m ON m.id = mp."matchId" JOIN "GameResult" gr ON gr."matchId" = m.id
    WHERE m.status = 'FINISHED' AND m."endedAt" >= ${lastWeek} AND m."endedAt" < ${thisWeek}
    GROUP BY mp."userId" HAVING COUNT(*) FILTER (WHERE gr."winnerSide" IS NOT NULL AND gr."winnerSide" = mp.side) > 0
    ORDER BY wins DESC LIMIT 3`;
  let sent = 0;
  for (const [i, r] of rows.entries()) {
    const key = `weekly-lb:${lastWeek.toISOString().slice(0, 10)}`;
    if (await db.notification.findFirst({ where: { userId: r.userId, kind: 'leaderboard', data: { path: ['key'], equals: key } }, select: { id: true } })) continue;
    await notify(db, r.userId, { kind: 'leaderboard', title: 'Weekly leaderboard updated', body: `You finished #${i + 1} last week with ${Number(r.wins)} wins!`, data: { key } });
    sent++;
  }
  return { sent };
}

export interface Redisish { set(key: string, value: string, ...args: any[]): Promise<unknown> }

/** Run `fn` on one instance only per window (Redis SET NX). Without Redis every instance runs it. */
async function once(redis: Redisish | undefined, key: string, ttlSec: number, fn: () => Promise<unknown>) {
  if (redis) { const ok = await redis.set(`job:${key}`, '1', 'EX', ttlSec, 'NX'); if (!ok) return; }
  try { await fn(); } catch (e) { console.error(`job ${key} failed`, e); }
}

/** Minute-granularity scheduler. Returns a stop function. */
export function startJobs(db: PrismaClient, opts: { redis?: Redisish; activeMatchIds: () => Set<string>; now?: () => Date }) {
  const clock = opts.now ?? (() => new Date());
  const tick = async () => {
    const n = clock();
    const hourKey = n.toISOString().slice(0, 13);
    await once(opts.redis, `cleanup:${hourKey}`, 3500, () => cleanupExpired(db, n));
    await once(opts.redis, `stale:${hourKey}`, 3500, () => reconcileStaleMatches(db, opts.activeMatchIds(), n));
    if (n.getUTCHours() === 12) await once(opts.redis, `daily:${dayKey(n)}`, 23 * 3600, () => dailyRewardReminders(db, n));
    if (n.getUTCDay() === 1 && n.getUTCHours() === 0) await once(opts.redis, `weekly:${dayKey(n)}`, 23 * 3600, () => weeklyLeaderboardNotices(db, n));
  };
  const t = setInterval(() => { void tick(); }, 60_000);
  void tick();
  return () => clearInterval(t);
}
