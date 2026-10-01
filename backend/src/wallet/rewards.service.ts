import type { PrismaClient } from '@prisma/client';
import { applyWalletTx } from './wallet.service';
import { HttpError } from '../auth/auth.service';

export const DEFAULT_DAILY_REWARDS = [100, 150, 200, 250, 300, 400, 1000];

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

export async function getDailyRewards(db: PrismaClient): Promise<number[]> {
  const s = await db.appSetting.findUnique({ where: { key: 'daily_rewards' } });
  return Array.isArray(s?.value) && (s!.value as number[]).length === 7 ? (s!.value as number[]) : DEFAULT_DAILY_REWARDS;
}

/** Streak day (1..7) from the last claim; resets after a missed day. */
export function nextStreakDay(lastClaimDay: string | null, lastStreak: number, today: string) {
  if (!lastClaimDay) return 1;
  const diff = dayDiff(today, lastClaimDay);
  if (diff === 0) return null; // already claimed today
  if (diff === 1) return (lastStreak % 7) + 1;
  return 1;
}

export async function claimDaily(db: PrismaClient, userId: string, now = new Date()) {
  const today = dayKey(now);
  const last = await db.walletTransaction.findFirst({ where: { userId, type: 'DAILY_REWARD' }, orderBy: { createdAt: 'desc' } });
  const lastDay = last ? dayKey(last.createdAt) : null;
  const lastStreak = last?.refId ? Number(last.refId) : 0;
  const day = nextStreakDay(lastDay, lastStreak, today);
  if (day === null) throw new HttpError(409, 'already claimed today');
  const amount = (await getDailyRewards(db))[day - 1];
  const tx = await applyWalletTx(db, { userId, type: 'DAILY_REWARD', amount, idempotencyKey: `daily:${userId}:${today}`, refType: 'streak_day', refId: String(day) });
  return { day, amount, balance: Number(tx.balanceAfter) };
}
