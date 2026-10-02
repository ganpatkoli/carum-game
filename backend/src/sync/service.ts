import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const offlineMatchSchema = z.object({
  clientId: z.string().min(8).max(64),
  difficulty: z.enum(['easy', 'medium', 'hard', 'expert']),
  result: z.enum(['win', 'loss', 'draw']),
  /** [player, ai] */
  scores: z.tuple([z.number().int().min(0).max(30), z.number().int().min(0).max(30)]),
  durationSec: z.number().int().min(0).max(7200),
  startedAt: z.number().int(),
});
export type OfflineMatch = z.infer<typeof offlineMatchSchema>;

const MIN_DURATION_SEC = 20;
const MAX_PER_DAY = 30;
const MAX_AGE_MS = 30 * 86_400_000;

/** Offline results are only a stats courtesy: sanity-checked, idempotent, and never touch coins, rating, XP or missions. */
export function validateOffline(m: OfflineMatch, now = Date.now()): string | null {
  if (m.startedAt > now + 60_000) return 'future_timestamp';
  if (now - m.startedAt > MAX_AGE_MS) return 'too_old';
  if (m.durationSec < MIN_DURATION_SEC) return 'too_short';
  const expected = m.scores[0] > m.scores[1] ? 'win' : m.scores[0] < m.scores[1] ? 'loss' : 'draw';
  if (m.result !== expected) return 'result_mismatch';
  return null;
}

export async function syncOffline(db: PrismaClient, userId: string, matches: OfflineMatch[]) {
  const results: { clientId: string; accepted: boolean; reason?: string }[] = [];
  const dayAgo = new Date(Date.now() - 86_400_000);
  let accepted24h = await db.offlineSync.count({ where: { userId, accepted: true, createdAt: { gte: dayAgo } } });
  for (const m of matches) {
    const dup = await db.offlineSync.findUnique({ where: { clientId: m.clientId } });
    if (dup) { results.push({ clientId: m.clientId, accepted: dup.userId === userId && dup.accepted, reason: 'duplicate' }); continue; }
    let reason = validateOffline(m);
    if (!reason && accepted24h >= MAX_PER_DAY) reason = 'daily_limit';
    const ok = !reason;
    try {
      await db.offlineSync.create({ data: { clientId: m.clientId, userId, payload: m as object, accepted: ok, reason } });
    } catch { results.push({ clientId: m.clientId, accepted: false, reason: 'duplicate' }); continue; }
    if (ok) {
      accepted24h++;
      await db.profile.update({
        where: { userId },
        data: {
          matchesPlayed: { increment: 1 }, matchesWon: { increment: m.result === 'win' ? 1 : 0 },
          matchesLost: { increment: m.result === 'loss' ? 1 : 0 }, draws: { increment: m.result === 'draw' ? 1 : 0 },
        },
      });
    }
    results.push({ clientId: m.clientId, accepted: ok, reason: reason ?? undefined });
  }
  return { results };
}
