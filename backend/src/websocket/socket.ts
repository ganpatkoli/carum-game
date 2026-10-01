import { Server as IOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { verifyAccess } from '../auth/auth.service';
import { config } from '../common/config';
import { GameSession } from '../game/session';
import { persistFinishedMatch } from '../game/finish';
import { MatchQueue } from '../matchmaking/queue';
import { applyWalletTx, InsufficientFundsError } from '../wallet/wallet.service';

const shotSchema = z.object({ strikerX: z.number(), angle: z.number(), power: z.number() });
export const EMOTES = ['thumbs_up', 'laugh', 'fire', 'gg', 'nice', 'oops'] as const;
const EMOTE_COOLDOWN_MS = 3000;

export interface RedisLike {
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export function attachGameServer(http: HttpServer, db: PrismaClient, redis?: RedisLike, opts: { entryCoins?: number; pairIntervalMs?: number } = {}) {
  const io = new IOServer(http, { cors: { origin: '*' } });
  const queue = new MatchQueue();
  const sessions = new Map<string, GameSession>();
  const userSession = new Map<string, string>();
  const sockets = new Map<string, Socket>();
  const lastEmote = new Map<string, number>();
  const entry = opts.entryCoins ?? 0;

  const room = (id: string) => `match:${id}`;
  const persistState = (s: GameSession) => redis?.set(`match:${s.matchId}`, JSON.stringify(s.snapshot()), 'EX', 3600).catch(() => {});

  io.use((socket, next) => {
    try { socket.data.userId = verifyAccess(String(socket.handshake.auth?.token ?? '')); next(); }
    catch { next(new Error('unauthorized')); }
  });

  async function startMatch(a: string, b: string) {
    // collect entry fees atomically per player; refund the first if the second cannot pay
    const matchId = crypto.randomUUID();
    if (entry > 0) {
      try {
        await applyWalletTx(db, { userId: a, type: 'GAME_ENTRY', amount: -entry, idempotencyKey: `entry:${matchId}:${a}`, refType: 'match', refId: matchId });
        try {
          await applyWalletTx(db, { userId: b, type: 'GAME_ENTRY', amount: -entry, idempotencyKey: `entry:${matchId}:${b}`, refType: 'match', refId: matchId });
        } catch (e) {
          await applyWalletTx(db, { userId: a, type: 'REFUND', amount: entry, idempotencyKey: `refund:${matchId}:${a}`, refType: 'match', refId: matchId });
          throw e;
        }
      } catch (e) {
        if (e instanceof InsufficientFundsError) { for (const id of [a, b]) sockets.get(id)?.emit('error_message', { code: 'insufficient_funds' }); return; }
        throw e;
      }
    }
    const session = new GameSession({ matchId, players: [a, b], turnTimeMs: config.turnTimeMs, reconnectWindowMs: config.reconnectWindowMs });
    await db.match.create({ data: { id: matchId, mode: 'quick', status: 'IN_PROGRESS', entryCoins: entry, seed: 1, startedAt: new Date() } });
    sessions.set(matchId, session);
    userSession.set(a, matchId); userSession.set(b, matchId);
    for (const id of [a, b]) sockets.get(id)?.join(room(matchId));
    io.to(room(matchId)).emit('game_started', { snapshot: session.snapshot(), sides: { [a]: 0, [b]: 1 } });
    io.to(room(matchId)).emit('turn_started', { side: 0 });
    persistState(session);
  }

  async function finish(s: GameSession) {
    await persistFinishedMatch(db, s, entry);
    io.to(room(s.matchId)).emit('game_finished', { winner: s.state.winner, scores: s.state.scores });
    redis?.del(`match:${s.matchId}`).catch(() => {});
    for (const p of s.players) userSession.delete(p.userId);
    sessions.delete(s.matchId);
  }

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    sockets.set(userId, socket);

    // reconnect: restore the live game
    const active = userSession.get(userId);
    if (active) {
      const s = sessions.get(active)!;
      s.setConnected(userId, true);
      socket.join(room(active));
      socket.emit('game_state', s.snapshot());
      socket.to(room(active)).emit('player_reconnected', { userId });
    }

    socket.on('queue_join', async () => {
      if (userSession.has(userId)) return;
      const [rating, profile] = await Promise.all([db.rating.findUnique({ where: { userId } }), db.profile.findUnique({ where: { userId } })]);
      queue.add({ userId, rating: rating?.rating ?? 1200, level: profile?.level ?? 1, region: 'global', latencyMs: 50, joinedAt: Date.now() });
      socket.emit('queue_joined');
    });
    socket.on('queue_leave', () => queue.remove(userId));

    socket.on('shot', async (raw, ack?: (r: unknown) => void) => {
      const parsed = shotSchema.safeParse(raw);
      const sid = userSession.get(userId);
      const s = sid ? sessions.get(sid) : undefined;
      if (!parsed.success || !s) return ack?.({ ok: false, reason: 'invalid' });
      const r = s.submitShot(userId, parsed.data);
      if (!r.ok) return ack?.({ ok: false, reason: r.reason });
      ack?.({ ok: true });
      io.to(room(s.matchId)).emit('shot_sync', { by: userId, shot: parsed.data, events: r.events, snapshot: s.snapshot() });
      for (const e of r.events) {
        if (e.type === 'coin_pocketed') io.to(room(s.matchId)).emit('coin_pocketed', e);
        if (e.type === 'queen_pocketed') io.to(room(s.matchId)).emit('queen_pocketed', e);
        if (e.type === 'foul') io.to(room(s.matchId)).emit('foul', e);
        if (e.type === 'turn_changed') io.to(room(s.matchId)).emit('turn_changed', e);
        if (e.type === 'score_updated') io.to(room(s.matchId)).emit('score_updated', e);
      }
      persistState(s);
      if (s.state.winner !== null) await finish(s);
      else io.to(room(s.matchId)).emit('turn_started', { side: s.state.current });
    });

    socket.on('emote', (id: string) => {
      const sid = userSession.get(userId);
      if (!sid || !(EMOTES as readonly string[]).includes(id)) return;
      const now = Date.now();
      if (now - (lastEmote.get(userId) ?? 0) < EMOTE_COOLDOWN_MS) return;
      lastEmote.set(userId, now);
      io.to(room(sid)).emit('emote', { from: userId, id });
    });

    socket.on('disconnect', () => {
      sockets.delete(userId);
      queue.remove(userId);
      const sid = userSession.get(userId);
      const s = sid ? sessions.get(sid) : undefined;
      if (s) {
        s.setConnected(userId, false);
        io.to(room(s.matchId)).emit('player_disconnected', { userId, reconnectWindowMs: config.reconnectWindowMs });
      }
    });
  });

  const timer = setInterval(async () => {
    for (const [a, b] of queue.findPairs()) await startMatch(a.userId, b.userId).catch((e) => console.error('startMatch', e));
    for (const s of [...sessions.values()]) if (s.checkTimeouts()) await finish(s).catch((e) => console.error('finish', e));
  }, opts.pairIntervalMs ?? 1000);
  io.on('close' as any, () => clearInterval(timer));

  return { io, sessions, stop: () => { clearInterval(timer); io.close(); } };
}
