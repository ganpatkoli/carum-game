import type { PrismaClient } from '@prisma/client';
import type { GameSession } from './session';
import { ratingDelta } from './elo';
import { getSetting } from '../common/settings';
import { levelForXp } from '../common/progress';
import { evaluateAchievements, trackMissions, type MatchFacts } from '../missions/progress';
import { notify } from '../notifications/notify';
import { applyWalletTx } from '../wallet/wallet.service';

/** a match shorter than this (and not finished normally) does not feed rating / missions / achievements */
export const MIN_SHOTS_FOR_PROGRESS = 4;

export interface PlayerSummary {
  userId: string;
  result: 'win' | 'loss' | 'draw';
  score: number;
  ratingChange: number;
  xpGain: number;
  levelUp: number | null;
  coins: number;
  achievements: string[];
}

/** Persist a finished match: result, ratings, stats, event log, missions, achievements and payouts. Idempotent per match. */
export async function persistFinishedMatch(db: PrismaClient, s: GameSession): Promise<PlayerSummary[]> {
  const w = s.state.winner;
  if (w === null) return [];
  const done = await db.gameResult.findUnique({ where: { matchId: s.matchId } });
  if (done) return [];

  const game = await getSetting(db, 'game');
  const humans = s.players.filter((p) => !p.isBot);
  const hasBot = humans.length !== s.players.length;
  const ids = humans.map((p) => p.userId);
  const outcome = (team: 0 | 1) => (w === 'draw' ? 'draw' : w === team ? 'win' : 'loss') as 'win' | 'loss' | 'draw';

  const [ratings, profiles] = await Promise.all([db.rating.findMany({ where: { userId: { in: ids } } }), db.profile.findMany({ where: { userId: { in: ids } } })]);
  const rating = (id: string) => ratings.find((x) => x.userId === id)!;
  const profile = (id: string) => profiles.find((x) => x.userId === id)!;

  // Anti-boosting: a match abandoned almost immediately (fewer than MIN_SHOTS shots in total, unless played to the end)
  // is recorded but earns no rating, missions or achievements. Bot matches never count for missions/achievements.
  const totalShots = humans.reduce((n, p) => n + s.stats[p.userId].shots, 0);
  const meaningful = s.endReason === 'completed' || totalShots >= MIN_SHOTS_FOR_PROGRESS;
  // ELO only for ranked 1v1 between two humans
  const elo = meaningful && s.ranked && humans.length === 2 && !hasBot && s.players.length === 2;
  const summaries: PlayerSummary[] = [];

  await db.$transaction(async (tx) => {
    for (const p of humans) {
      const res = outcome(p.team);
      const opp = s.players.find((x) => x.team !== p.team && !x.isBot);
      let delta = 0;
      let next = rating(p.userId).rating;
      if (elo && opp) {
        delta = ratingDelta(rating(p.userId).rating, rating(opp.userId).rating, res === 'win' ? 1 : res === 'draw' ? 0.5 : 0, profile(p.userId).matchesPlayed);
        next = Math.max(100, rating(p.userId).rating + delta);
        await tx.rating.update({ where: { userId: p.userId }, data: { previous: rating(p.userId).rating, rating: next, lastChange: next - rating(p.userId).rating, highest: Math.max(rating(p.userId).highest, next), lowest: Math.min(rating(p.userId).lowest, next) } });
      }
      const pr = profile(p.userId);
      const streak = res === 'win' ? pr.currentStreak + 1 : res === 'loss' ? 0 : pr.currentStreak;
      const xpGain = res === 'win' ? game.winXp : res === 'draw' ? game.drawXp : game.lossXp;
      const newXp = pr.xp + xpGain;
      await tx.profile.update({
        where: { userId: p.userId },
        data: {
          matchesPlayed: { increment: 1 }, matchesWon: { increment: res === 'win' ? 1 : 0 }, matchesLost: { increment: res === 'loss' ? 1 : 0 },
          draws: { increment: res === 'draw' ? 1 : 0 }, currentStreak: streak, longestStreak: Math.max(pr.longestStreak, streak),
          bestScore: Math.max(pr.bestScore, s.state.scores[p.team]), xp: newXp, level: levelForXp(newXp),
        },
      });
      await tx.matchPlayer.upsert({
        where: { matchId_userId: { matchId: s.matchId, userId: p.userId } },
        update: { score: s.state.scores[p.team], fouls: s.stats[p.userId].fouls, ratingBefore: rating(p.userId).rating, ratingAfter: next },
        create: { matchId: s.matchId, userId: p.userId, side: p.team, score: s.state.scores[p.team], fouls: s.stats[p.userId].fouls, ratingBefore: rating(p.userId).rating, ratingAfter: next },
      });
      const lv0 = levelForXp(pr.xp), lv1 = levelForXp(newXp);
      summaries.push({ userId: p.userId, result: res, score: s.state.scores[p.team], ratingChange: next - rating(p.userId).rating, xpGain, levelUp: lv1 > lv0 ? lv1 : null, coins: 0, achievements: [] });
    }
    await tx.match.update({ where: { id: s.matchId }, data: { status: 'FINISHED', endedAt: new Date(), suspicious: s.isSuspicious() } });
    const winnerTeam = w === 'draw' ? null : w;
    const winnerId = winnerTeam === null ? null : s.players.find((p) => p.team === winnerTeam && !p.isBot)?.userId ?? null;
    await tx.gameResult.create({ data: { matchId: s.matchId, winnerId, winnerSide: winnerTeam, reason: s.endReason, scores: s.state.scores } });
    await tx.gameEvent.createMany({
      data: [
        ...s.log.map((l) => ({ matchId: s.matchId, userId: l.userId, type: l.type, payload: l.detail as object, ip: s.clientMeta[l.userId]?.ip, deviceKey: s.clientMeta[l.userId]?.deviceKey })),
        ...humans.map((p) => ({ matchId: s.matchId, userId: p.userId, type: 'match_stats', payload: { ...s.stats[p.userId] } as object, ip: s.clientMeta[p.userId]?.ip, deviceKey: s.clientMeta[p.userId]?.deviceKey })),
      ],
    });
  });

  // payouts (outside the DB tx: each is its own atomic, idempotent wallet operation)
  const winners = humans.filter((p) => outcome(p.team) === 'win');
  for (const sm of summaries) {
    const p = humans.find((x) => x.userId === sm.userId)!;
    if (s.entryCoins > 0 && !hasBot) {
      const pot = s.entryCoins * humans.length;
      if (w === 'draw') {
        await applyWalletTx(db, { userId: p.userId, type: 'REFUND', amount: s.entryCoins, idempotencyKey: `refund:${s.matchId}:${p.userId}`, refType: 'match', refId: s.matchId });
        sm.coins = 0;
      } else if (sm.result === 'win') {
        const share = Math.floor(pot / winners.length);
        await applyWalletTx(db, { userId: p.userId, type: 'GAME_WIN', amount: share, idempotencyKey: `win:${s.matchId}:${p.userId}`, refType: 'match', refId: s.matchId });
        sm.coins = share - s.entryCoins;
      } else sm.coins = -s.entryCoins;
    } else if (!hasBot && s.mode !== 'room' && s.mode !== 'friend') {
      // free quick matches pay a small configurable amount; bots and private games never do (anti-farming)
      if (sm.result === 'win' && game.winCoins > 0) { await applyWalletTx(db, { userId: p.userId, type: 'GAME_WIN', amount: game.winCoins, idempotencyKey: `win:${s.matchId}:${p.userId}`, refType: 'match', refId: s.matchId }); sm.coins = game.winCoins; }
      if (sm.result === 'loss' && game.lossCoins > 0) { await applyWalletTx(db, { userId: p.userId, type: 'GAME_LOSS', amount: game.lossCoins, idempotencyKey: `loss:${s.matchId}:${p.userId}`, refType: 'match', refId: s.matchId }); sm.coins = game.lossCoins; }
    }
  }

  for (const sm of summaries) {
    const st = s.stats[sm.userId];
    const opp = s.players.find((x) => x.team !== s.sideOf(sm.userId));
    const facts: MatchFacts = {
      userId: sm.userId, won: sm.result === 'win', draw: sm.result === 'draw', friendMatch: s.mode === 'friend' || s.mode === 'room',
      pocketed: st.pocketed, queenCovers: st.queenCovers, fouls: st.fouls,
      perfect: sm.result === 'win' && s.endReason === 'completed' && st.fouls === 0 && s.state.pocketed[opp?.team ?? 1] === 0 && s.players.length === 2,
    };
    if (!meaningful || hasBot) continue;
    try {
      await trackMissions(db, facts);
      sm.achievements = await evaluateAchievements(db, facts);
      if (sm.levelUp) await notify(db, sm.userId, { kind: 'level_up', title: 'Level up!', body: `You reached level ${sm.levelUp}`, push: false });
    } catch (e) { console.error('post-match progress failed', e); }
  }
  return summaries;
}
