import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../common/http';
import { notify } from '../notifications/notify';
import { applyWalletTx } from '../wallet/wallet.service';

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** Counters a finished match can advance; missions/achievements reference these names as `metric`. */
export type Metric = 'matches_played' | 'matches_won' | 'coins_pocketed' | 'friend_matches' | 'queen_covers' | 'fouls';

export interface MatchFacts {
  userId: string;
  won: boolean;
  draw: boolean;
  friendMatch: boolean;
  pocketed: number;
  queenCovers: number;
  fouls: number;
  /** won without the opponent scoring a coin and without committing a foul */
  perfect: boolean;
}

/** Advance today's missions for a user. Progress is capped at the mission target. */
export async function trackMissions(db: PrismaClient, f: MatchFacts) {
  const day = dayKey();
  const missions = await db.mission.findMany({ where: { active: true } });
  const delta: Record<string, number> = {
    matches_played: 1, matches_won: f.won ? 1 : 0, coins_pocketed: f.pocketed, friend_matches: f.friendMatch ? 1 : 0, queen_covers: f.queenCovers, fouls: f.fouls,
  };
  for (const m of missions) {
    const inc = delta[m.metric] ?? 0;
    if (inc <= 0) continue;
    await db.$executeRaw`
      INSERT INTO "UserMission" ("userId","missionId","day",progress,claimed)
      VALUES (${f.userId}::uuid, ${m.id}, ${day}, ${Math.min(inc, m.target)}, false)
      ON CONFLICT ("userId","missionId","day")
      DO UPDATE SET progress = LEAST(${m.target}, "UserMission".progress + ${inc})`;
  }
}

export async function listMissions(db: PrismaClient, userId: string) {
  const day = dayKey();
  const [missions, mine] = await Promise.all([db.mission.findMany({ where: { active: true }, orderBy: { id: 'asc' } }), db.userMission.findMany({ where: { userId, day } })]);
  return missions.map((m) => {
    const u = mine.find((x) => x.missionId === m.id);
    const progress = u?.progress ?? 0;
    return { id: m.id, title: m.title, metric: m.metric, target: m.target, rewardCoins: m.rewardCoins, progress, claimed: u?.claimed ?? false, claimable: !u?.claimed && progress >= m.target };
  });
}

export async function claimMission(db: PrismaClient, userId: string, missionId: string) {
  const day = dayKey();
  const m = await db.mission.findUnique({ where: { id: missionId } });
  if (!m || !m.active) throw new HttpError(404, 'mission not found');
  // atomically flip claimed so a double-tap can never pay twice
  const flipped = await db.userMission.updateMany({ where: { userId, missionId, day, claimed: false, progress: { gte: m.target } }, data: { claimed: true } });
  if (flipped.count === 0) throw new HttpError(409, 'mission is not claimable');
  const tx = await applyWalletTx(db, { userId, type: 'MISSION_REWARD', amount: m.rewardCoins, idempotencyKey: `mission:${userId}:${missionId}:${day}`, refType: 'mission', refId: missionId });
  return { rewardCoins: m.rewardCoins, balance: Number(tx.balanceAfter) };
}

export async function evaluateAchievements(db: PrismaClient, f: MatchFacts) {
  const [profile, achievements, have] = await Promise.all([
    db.profile.findUniqueOrThrow({ where: { userId: f.userId } }),
    db.achievement.findMany({ where: { active: true } }),
    db.userAchievement.findMany({ where: { userId: f.userId } }),
  ]);
  const owned = new Set(have.map((h) => h.achievementId));
  const metrics: Record<string, number> = {
    wins_total: profile.matchesWon, matches_total: profile.matchesPlayed, win_streak: profile.currentStreak,
    perfect_game: f.perfect ? 1 : 0, queen_covers_total: await queenCoversTotal(db, f.userId, f.queenCovers),
  };
  const unlocked: string[] = [];
  for (const a of achievements) {
    if (owned.has(a.id)) continue;
    if ((metrics[a.metric] ?? 0) < a.target) continue;
    try {
      await db.userAchievement.create({ data: { userId: f.userId, achievementId: a.id } });
    } catch { continue; } // lost a race: someone else already unlocked it
    unlocked.push(a.id);
    if (a.rewardCoins > 0) await applyWalletTx(db, { userId: f.userId, type: 'BONUS', amount: a.rewardCoins, idempotencyKey: `ach:${f.userId}:${a.id}`, refType: 'achievement', refId: a.id });
    await notify(db, f.userId, { kind: 'achievement', title: 'Achievement unlocked', body: a.title, data: { achievementId: a.id }, push: false });
  }
  return unlocked;
}

/** Lifetime covered queens, summed from the per-match `match_stats` event rows written when a match is settled. */
async function queenCoversTotal(db: PrismaClient, userId: string, thisMatch: number) {
  const row = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COALESCE(SUM((payload->>'queenCovers')::int),0) AS n FROM "GameEvent" WHERE "userId" = ${userId}::uuid AND type = 'match_stats'`;
  return Number(row[0]?.n ?? 0) + thisMatch;
}

export async function listAchievements(db: PrismaClient, userId: string) {
  const [all, mine] = await Promise.all([db.achievement.findMany({ where: { active: true }, orderBy: { id: 'asc' } }), db.userAchievement.findMany({ where: { userId } })]);
  return all.map((a) => ({ id: a.id, title: a.title, target: a.target, rewardCoins: a.rewardCoins, unlocked: mine.some((m) => m.achievementId === a.id), unlockedAt: mine.find((m) => m.achievementId === a.id)?.unlockedAt ?? null }));
}
