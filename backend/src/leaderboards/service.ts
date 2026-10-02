import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../common/http';
import { getSetting } from '../common/settings';
import { listFriends } from '../friends/service';
import { levelForXp } from '../common/progress';

export type Board = 'global' | 'weekly' | 'monthly' | 'friends' | 'country' | 'local';

export function periodStart(kind: 'weekly' | 'monthly', now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (kind === 'weekly') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
  else d.setUTCDate(1);
  return d;
}

interface Row { rank: number; userId: string; username: string; avatarId: string; imageUrl: string | null; rating: number; wins: number; xp: number; level: number; periodWins?: number; ratingGain?: number }

async function decorate(db: PrismaClient, userIds: string[]) {
  const profiles = await db.profile.findMany({ where: { userId: { in: userIds }, user: { isBot: false } }, include: { user: { include: { rating: true } } } });
  return new Map(profiles.map((p) => [p.userId, p]));
}

export async function leaderboard(db: PrismaClient, userId: string, board: Board, limit = 50) {
  const cfg = await getSetting(db, 'leaderboard_periods');
  if (!cfg[board]) throw new HttpError(404, 'this leaderboard is disabled');
  let order: string[];
  let extra = new Map<string, { wins: number; gain: number }>();

  if (board === 'weekly' || board === 'monthly') {
    const start = periodStart(board);
    const rows = await db.$queryRaw<{ userId: string; wins: bigint; gain: bigint }[]>`
      SELECT mp."userId" AS "userId",
             COUNT(*) FILTER (WHERE gr."winnerSide" IS NOT NULL AND gr."winnerSide" = mp.side) AS wins,
             COALESCE(SUM(mp."ratingAfter" - mp."ratingBefore"), 0) AS gain
      FROM "MatchPlayer" mp
      JOIN "Match" m ON m.id = mp."matchId"
      JOIN "GameResult" gr ON gr."matchId" = m.id
      WHERE m.status = 'FINISHED' AND m."endedAt" >= ${start}
      GROUP BY mp."userId" ORDER BY wins DESC, gain DESC LIMIT ${limit}`;
    order = rows.map((r) => r.userId);
    extra = new Map(rows.map((r) => [r.userId, { wins: Number(r.wins), gain: Number(r.gain) }]));
  } else {
    let where: object = { user: { isBot: false } };
    if (board === 'friends') where = { userId: { in: [userId, ...(await listFriends(db, userId)).map((f) => f.id)] } };
    if (board === 'country' || board === 'local') {
      const me = await db.profile.findUnique({ where: { userId } });
      if (!me?.country) return { board, rows: [] as Row[], me: null };
      where = { country: me.country, user: { isBot: false } };
    }
    const rows = await db.rating.findMany({ where: { user: { profile: where } } as any, orderBy: [{ rating: 'desc' }, { updatedAt: 'asc' }], take: limit });
    order = rows.map((r) => r.userId);
  }

  const info = await decorate(db, order);
  const rows: Row[] = order.filter((id) => info.has(id)).map((id, i) => {
    const p = info.get(id)!;
    const x = extra.get(id);
    return { rank: i + 1, userId: id, username: p.username, avatarId: p.avatarId, imageUrl: p.imageUrl, rating: p.user.rating?.rating ?? 1200, wins: p.matchesWon, xp: p.xp, level: levelForXp(p.xp), ...(x ? { periodWins: x.wins, ratingGain: x.gain } : {}) };
  });
  return { board, rows, me: rows.find((r) => r.userId === userId) ?? null };
}
