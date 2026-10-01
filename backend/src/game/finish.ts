import type { PrismaClient } from '@prisma/client';
import type { GameSession } from './session';
import { ratingDelta } from './elo';
import { applyWalletTx } from '../wallet/wallet.service';

/** Persist a finished match: result, ratings, stats, event log, and wallet payouts. Idempotent per match. */
export async function persistFinishedMatch(db: PrismaClient, s: GameSession, entryCoins = 0) {
  const w = s.state.winner;
  if (w === null) return;
  const [p0, p1] = s.players.map((p) => p.userId);
  const winnerId = w === 'draw' ? null : s.players[w].userId;
  const done = await db.gameResult.findUnique({ where: { matchId: s.matchId } });
  if (done) return;

  const ratings = await db.rating.findMany({ where: { userId: { in: [p0, p1] } } });
  const profiles = await db.profile.findMany({ where: { userId: { in: [p0, p1] } } });
  const r = (id: string) => ratings.find((x) => x.userId === id)!;
  const pr = (id: string) => profiles.find((x) => x.userId === id)!;
  const result = (id: string) => (winnerId === null ? 0.5 : winnerId === id ? 1 : 0) as 0 | 0.5 | 1;

  await db.$transaction(async (tx) => {
    for (const [id, oppId] of [[p0, p1], [p1, p0]]) {
      const delta = ratingDelta(r(id).rating, r(oppId).rating, result(id), pr(id).matchesPlayed);
      const next = Math.max(100, r(id).rating + delta);
      const won = winnerId === id, draw = winnerId === null;
      const side = s.sideOf(id)!;
      await tx.rating.update({ where: { userId: id }, data: { previous: r(id).rating, rating: next, lastChange: next - r(id).rating, highest: Math.max(r(id).highest, next), lowest: Math.min(r(id).lowest, next) } });
      const streak = won ? pr(id).currentStreak + 1 : 0;
      await tx.profile.update({
        where: { userId: id },
        data: {
          matchesPlayed: { increment: 1 }, matchesWon: { increment: won ? 1 : 0 }, matchesLost: { increment: !won && !draw ? 1 : 0 },
          draws: { increment: draw ? 1 : 0 }, currentStreak: streak, longestStreak: Math.max(pr(id).longestStreak, streak),
          bestScore: Math.max(pr(id).bestScore, s.state.scores[side]), xp: { increment: won ? 50 : draw ? 25 : 20 },
        },
      });
      await tx.matchPlayer.upsert({
        where: { matchId_userId: { matchId: s.matchId, userId: id } },
        update: { score: s.state.scores[side], fouls: s.state.fouls[side], ratingBefore: r(id).rating, ratingAfter: next },
        create: { matchId: s.matchId, userId: id, side, score: s.state.scores[side], fouls: s.state.fouls[side], ratingBefore: r(id).rating, ratingAfter: next },
      });
    }
    await tx.match.update({ where: { id: s.matchId }, data: { status: 'FINISHED', endedAt: new Date(), suspicious: s.isSuspicious() } });
    await tx.gameResult.create({ data: { matchId: s.matchId, winnerId, reason: s.forfeitedBy !== null ? 'forfeit' : 'completed', scores: s.state.scores } });
    await tx.gameEvent.createMany({ data: s.log.map((l) => ({ matchId: s.matchId, userId: l.userId, type: l.type, payload: l.detail as object })) });
  });

  if (entryCoins > 0) {
    // pot = both entries; winner takes it, draw refunds
    for (const id of [p0, p1]) {
      if (winnerId === null) await applyWalletTx(db, { userId: id, type: 'REFUND', amount: entryCoins, idempotencyKey: `refund:${s.matchId}:${id}`, refType: 'match', refId: s.matchId });
      else if (winnerId === id) await applyWalletTx(db, { userId: id, type: 'GAME_WIN', amount: entryCoins * 2, idempotencyKey: `win:${s.matchId}:${id}`, refType: 'match', refId: s.matchId });
    }
  }
}
