import { Server as IOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { DEFAULT_RULES, type Difficulty } from '@carrom/game-core';
import { verifyAccess } from '../auth/auth.service';
import { levelForXp } from '../common/progress';
import { getSetting } from '../common/settings';
import { persistFinishedMatch } from '../game/finish';
import { GameSession } from '../game/session';
import { MatchQueue } from '../matchmaking/queue';
import { realtime } from '../notifications/notify';
import { roomView, setReady, leaveRoom, parseCode } from '../rooms/service';
import { applyWalletTx, InsufficientFundsError } from '../wallet/wallet.service';
import { isBlockedEitherWay } from '../friends/service';

const shotSchema = z.object({ strikerX: z.number(), angle: z.number(), power: z.number() });
export const EMOTES = ['thumbs_up', 'laugh', 'fire', 'gg', 'nice', 'oops'] as const;
export const QUICK_CHAT = ['good_luck', 'nice_shot', 'well_played', 'hurry_up', 'oops', 'thanks'] as const;

const BOT_ID = '00000000-0000-4000-8000-0000000000b0';
const BOT_NAMES = ['Ali', 'Rahul', 'Sara', 'Vikram', 'Meera', 'Arjun', 'Neha'];
const COUNTDOWN_MS = 3000;

export interface RedisLike {
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  sadd(key: string, member: string): Promise<unknown>;
  srem(key: string, member: string): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
}

export interface GameServerOptions {
  pairIntervalMs?: number;
  /** override the AI strength used for bot opponents */
  botDifficulty?: Difficulty;
}

interface StartArgs {
  humans: string[];
  mode: 'quick' | 'friend' | 'room' | 'bot';
  ranked: boolean;
  entryCoins: number;
  roomId?: string;
  roomCode?: string;
  durationSec?: number;
  rules?: Record<string, unknown>;
}

export function attachGameServer(http: HttpServer, db: PrismaClient, redis?: RedisLike, opts: GameServerOptions = {}) {
  const io = new IOServer(http, { cors: { origin: '*' }, perMessageDeflate: { threshold: 1024 } });
  const queues = new Map<number, MatchQueue>();
  const sessions = new Map<string, GameSession>();
  const userSession = new Map<string, string>();
  const sockets = new Map<string, Set<Socket>>();
  const lastEmote = new Map<string, number>();
  const botTimers = new Map<string, NodeJS.Timeout>();
  const finishing = new Set<string>();
  const botProfiles = new Map<string, { username: string; avatarId: string; level: number }>();

  const room = (id: string) => `match:${id}`;
  const queueFor = (entry: number) => { let q = queues.get(entry); if (!q) { q = new MatchQueue(); queues.set(entry, q); } return q; };
  const emitToUser = (userId: string, ev: string, payload: unknown) => { for (const s of sockets.get(userId) ?? []) s.emit(ev, payload); };
  realtime.isOnline = (id) => (sockets.get(id)?.size ?? 0) > 0;
  realtime.emitToUser = emitToUser;

  const persistState = (s: GameSession) => {
    if (!redis) return;
    redis.set(`match:${s.matchId}:state`, JSON.stringify(s.serialize()), 'EX', 7200).catch(() => {});
    redis.sadd('matches:active', s.matchId).catch(() => {});
  };
  const clearState = (s: GameSession) => {
    if (!redis) return;
    redis.del(`match:${s.matchId}:state`).catch(() => {});
    redis.srem('matches:active', s.matchId).catch(() => {});
  };

  async function profilesFor(s: GameSession) {
    const humanIds = s.players.filter((p) => !p.isBot).map((p) => p.userId);
    const rows = await db.profile.findMany({ where: { userId: { in: humanIds } } });
    const out: Record<string, { username: string; avatarId: string; level: number; imageUrl?: string | null }> = {};
    for (const p of s.players) {
      if (p.isBot) out[p.userId] = botProfiles.get(s.matchId) ?? { username: 'Ali', avatarId: 'avatar_02', level: 5 };
      else { const r = rows.find((x) => x.userId === p.userId); out[p.userId] = { username: r?.username ?? 'Player', avatarId: r?.avatarId ?? 'avatar_01', level: levelForXp(r?.xp ?? 0), imageUrl: r?.imageUrl }; }
    }
    return out;
  }

  const humansOf = (s: GameSession) => s.players.filter((p) => !p.isBot).map((p) => p.userId);
  const emitMatch = (s: GameSession, ev: string, payload: unknown) => io.to(room(s.matchId)).emit(ev, payload);

  async function startMatch(a: StartArgs) {
    const matchId = crypto.randomUUID();
    const hasBot = a.mode === 'bot';
    const entry = hasBot ? 0 : a.entryCoins;
    // collect entry fees; if anyone can't pay, refund the ones already charged
    const charged: string[] = [];
    if (entry > 0) {
      try {
        for (const id of a.humans) {
          await applyWalletTx(db, { userId: id, type: 'GAME_ENTRY', amount: -entry, idempotencyKey: `entry:${matchId}:${id}`, refType: 'match', refId: matchId });
          charged.push(id);
        }
      } catch (e) {
        for (const id of charged) await applyWalletTx(db, { userId: id, type: 'REFUND', amount: entry, idempotencyKey: `refund:${matchId}:${id}`, refType: 'match', refId: matchId });
        for (const id of a.humans) emitToUser(id, 'error_message', { code: e instanceof InsufficientFundsError ? 'insufficient_funds' : 'start_failed' });
        return null;
      }
    }
    const game = await getSetting(db, 'game');
    const baseRules = await getSetting(db, 'rules');
    const players = hasBot ? [{ userId: a.humans[0] }, { userId: BOT_ID, isBot: true }] : a.humans.map((userId) => ({ userId }));
    const session = new GameSession({
      matchId, players, rules: { ...DEFAULT_RULES, ...baseRules, ...(a.rules ?? {}) } as typeof DEFAULT_RULES,
      turnTimeMs: game.turnTimeSec * 1000, reconnectWindowMs: game.reconnectWindowSec * 1000,
      durationMs: (a.durationSec ?? game.defaultDurationSec) * 1000 || undefined,
      ranked: a.ranked, mode: a.mode, entryCoins: entry, botDifficulty: opts.botDifficulty ?? 'medium',
    });
    if (hasBot) botProfiles.set(matchId, { username: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], avatarId: 'avatar_0' + (2 + Math.floor(Math.random() * 4)), level: 3 + Math.floor(Math.random() * 6) });
    await db.match.create({
      data: {
        id: matchId, roomId: a.roomId, mode: a.mode, status: 'IN_PROGRESS', entryCoins: entry, seed: 1, ranked: a.ranked, startedAt: new Date(), rules: session.rules as object,
        players: { create: a.humans.map((userId, i) => ({ userId, side: i % 2 })) },
      },
    });
    if (a.roomId) await db.room.update({ where: { id: a.roomId }, data: { status: 'STARTED' } });
    sessions.set(matchId, session);
    for (const id of a.humans) {
      userSession.set(id, matchId);
      queues.forEach((q) => q.remove(id));
      for (const sk of sockets.get(id) ?? []) sk.join(room(matchId));
    }
    session.grantTime(COUNTDOWN_MS); // first turn starts after the on-screen 3-2-1
    emitMatch(session, 'game_started', { snapshot: session.snapshot(), profiles: await profilesFor(session), countdownMs: COUNTDOWN_MS, boardTheme: undefined, entryCoins: entry, mode: a.mode });
    emitMatch(session, 'turn_started', { side: 0, shooterId: session.shooter().userId, delayMs: COUNTDOWN_MS });
    persistState(session);
    scheduleBot(session, COUNTDOWN_MS);
    return session;
  }

  function scheduleBot(s: GameSession, extraDelay = 0) {
    if (s.state.winner !== null || !s.shooter().isBot) return;
    clearTimeout(botTimers.get(s.matchId));
    const delay = extraDelay + 1200 + Math.random() * 1500;
    botTimers.set(s.matchId, setTimeout(() => {
      if (s.state.winner !== null || s.paused || !s.shooter().isBot) return;
      void handleShot(s, s.shooter().userId, s.botShot());
    }, delay));
  }

  async function handleShot(s: GameSession, userId: string, shot: z.infer<typeof shotSchema>, ack?: (r: unknown) => void) {
    const r = s.submitShot(userId, shot);
    if (!r.ok) { ack?.({ ok: false, reason: r.reason }); return; }
    ack?.({ ok: true });
    const animMs = Math.round(((r.sim.frames.at(-1)?.step ?? 0) / 120) * 1000) + 600;
    s.grantTime(animMs);
    emitMatch(s, 'shot_sync', { by: userId, shot, events: r.events, sim: r.sim, snapshot: s.snapshot(), animMs });
    for (const e of r.events) {
      if (e.type === 'coin_pocketed') emitMatch(s, 'coin_pocketed', e);
      if (e.type === 'queen_pocketed') emitMatch(s, 'queen_pocketed', e);
      if (e.type === 'foul') emitMatch(s, 'foul', e);
      if (e.type === 'turn_changed') emitMatch(s, 'turn_changed', e);
      if (e.type === 'score_updated') emitMatch(s, 'score_updated', e);
    }
    persistState(s);
    if (s.state.winner !== null) await finish(s);
    else { emitMatch(s, 'turn_started', { side: s.state.current, shooterId: s.shooter().userId, delayMs: animMs }); scheduleBot(s, animMs); }
  }

  async function finish(s: GameSession) {
    if (finishing.has(s.matchId)) return;
    finishing.add(s.matchId);
    clearTimeout(botTimers.get(s.matchId));
    let summaries: Awaited<ReturnType<typeof persistFinishedMatch>> = [];
    try { summaries = await persistFinishedMatch(db, s); } catch (e) { console.error('persist failed', e); }
    emitMatch(s, 'game_finished', { winner: s.state.winner, scores: s.state.scores, reason: s.endReason, summaries });
    clearState(s);
    for (const id of humansOf(s)) { userSession.delete(id); for (const sk of sockets.get(id) ?? []) sk.leave(room(s.matchId)); }
    sessions.delete(s.matchId);
    finishing.delete(s.matchId);
  }

  const mutedBy = async (from: string, to: string) => isBlockedEitherWay(db, from, to);

  io.use((socket, next) => {
    try {
      const id = verifyAccess(String(socket.handshake.auth?.token ?? ''));
      socket.data.userId = id;
      next();
    } catch { next(new Error('unauthorized')); }
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    if (!sockets.has(userId)) sockets.set(userId, new Set());
    sockets.get(userId)!.add(socket);
    void db.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => {});

    const active = userSession.get(userId);
    if (active) {
      const s = sessions.get(active);
      if (s) {
        const wasPaused = s.paused;
        s.setConnected(userId, true);
        socket.join(room(active));
        void profilesFor(s).then((profiles) => socket.emit('game_state', { snapshot: s.snapshot(), profiles }));
        socket.to(room(active)).emit('player_reconnected', { userId });
        if (wasPaused && !s.paused) emitMatch(s, 'game_resumed', { turnEndsInMs: s.snapshot().turnEndsInMs });
        scheduleBot(s);
      }
    }

    socket.on('get_state', () => {
      const s = sessions.get(userSession.get(userId) ?? '');
      if (s) void profilesFor(s).then((profiles) => socket.emit('game_state', { snapshot: s.snapshot(), profiles }));
      else socket.emit('game_state', null);
    });

    // ---- quick match ----
    socket.on('queue_join', async (raw: unknown, ack?: (r: unknown) => void) => {
      const b = z.object({ entry: z.number().int().min(0).default(0), latencyMs: z.number().min(0).max(5000).default(50), region: z.string().max(8).default('global') }).safeParse(raw ?? {});
      if (!b.success || userSession.has(userId)) return ack?.({ ok: false, reason: 'invalid' });
      const game = await getSetting(db, 'game');
      if (!game.entryOptions.includes(b.data.entry)) return ack?.({ ok: false, reason: 'bad_entry' });
      if (b.data.entry > 0) {
        const w = await db.wallet.findUnique({ where: { userId } });
        if (!w || Number(w.balance) < b.data.entry) return ack?.({ ok: false, reason: 'insufficient_funds' });
      }
      const [rating, profile] = await Promise.all([db.rating.findUnique({ where: { userId } }), db.profile.findUnique({ where: { userId } })]);
      queues.forEach((q) => q.remove(userId));
      queueFor(b.data.entry).add({ userId, rating: rating?.rating ?? 1200, level: levelForXp(profile?.xp ?? 0), region: b.data.region, latencyMs: b.data.latencyMs, joinedAt: Date.now() });
      socket.emit('queue_joined', { entry: b.data.entry });
      ack?.({ ok: true });
    });
    socket.on('queue_leave', () => queues.forEach((q) => q.remove(userId)));

    // ---- private rooms ----
    socket.on('room_join', async (raw: unknown, ack?: (r: unknown) => void) => {
      try {
        const code = parseCode(String((raw as any)?.code ?? ''));
        const view = await roomView(db, code);
        if (!view.players.some((p) => p.userId === userId)) return ack?.({ ok: false, reason: 'not_in_room' });
        socket.join(`room:${code}`);
        socket.to(`room:${code}`).emit('player_joined', { room: view, userId });
        ack?.({ ok: true, room: view });
      } catch { ack?.({ ok: false, reason: 'not_found' }); }
    });
    socket.on('room_ready', async (raw: unknown, ack?: (r: unknown) => void) => {
      try {
        const b = z.object({ code: z.string(), ready: z.boolean() }).parse(raw);
        const code = parseCode(b.code);
        const view = await setReady(db, userId, code, b.ready);
        io.to(`room:${code}`).emit('player_ready', { room: view, userId, ready: b.ready });
        ack?.({ ok: true, room: view });
      } catch { ack?.({ ok: false }); }
    });
    socket.on('room_leave', async (raw: unknown) => {
      try {
        const code = parseCode(String((raw as any)?.code ?? ''));
        await leaveRoom(db, userId, code);
        socket.leave(`room:${code}`);
        io.to(`room:${code}`).emit('player_left', { userId, room: await roomView(db, code).catch(() => null) });
      } catch { /* ignore */ }
    });
    socket.on('room_start', async (raw: unknown, ack?: (r: unknown) => void) => {
      try {
        const code = parseCode(String((raw as any)?.code ?? ''));
        const view = await roomView(db, code);
        if (view.hostId !== userId) return ack?.({ ok: false, reason: 'host_only' });
        if (view.status === 'STARTED') return ack?.({ ok: false, reason: 'already_started' });
        if (view.players.length !== view.maxPlayers) return ack?.({ ok: false, reason: 'not_full' });
        if (!view.players.every((p) => p.userId === view.hostId || p.ready)) return ack?.({ ok: false, reason: 'not_ready' });
        // everyone must be online and not mid-match
        if (view.players.some((p) => !realtime.isOnline(p.userId) || userSession.has(p.userId))) return ack?.({ ok: false, reason: 'player_unavailable' });
        // host first so teams are host+3rd vs 2nd+4th
        const humans = [view.hostId, ...view.players.map((p) => p.userId).filter((id) => id !== view.hostId)];
        const s = await startMatch({ humans, mode: 'room', ranked: false, entryCoins: view.entryCoins, roomId: view.id, roomCode: code, durationSec: view.durationSec ?? undefined, rules: view.rules as Record<string, unknown> });
        ack?.({ ok: !!s, matchId: s?.matchId });
      } catch { ack?.({ ok: false, reason: 'error' }); }
    });

    // ---- gameplay ----
    socket.on('shot', async (raw, ack?: (r: unknown) => void) => {
      const parsed = shotSchema.safeParse(raw);
      const s = sessions.get(userSession.get(userId) ?? '');
      if (!parsed.success || !s) return ack?.({ ok: false, reason: 'invalid' });
      await handleShot(s, userId, parsed.data, ack);
    });

    socket.on('emote', async (id: string) => {
      const s = sessions.get(userSession.get(userId) ?? '');
      if (!s || !(EMOTES as readonly string[]).includes(id)) return;
      const game = await getSetting(db, 'game');
      const now = Date.now();
      if (now - (lastEmote.get(userId) ?? 0) < game.emoteCooldownSec * 1000) return;
      lastEmote.set(userId, now);
      for (const to of humansOf(s)) if (to === userId || !(await mutedBy(userId, to))) emitToUser(to, 'emote', { from: userId, id });
    });
    socket.on('quick_chat', async (id: string) => {
      const s = sessions.get(userSession.get(userId) ?? '');
      if (!s || !(QUICK_CHAT as readonly string[]).includes(id)) return;
      const game = await getSetting(db, 'game');
      const now = Date.now();
      if (now - (lastEmote.get(userId) ?? 0) < game.emoteCooldownSec * 1000) return;
      lastEmote.set(userId, now);
      for (const to of humansOf(s)) if (to === userId || !(await mutedBy(userId, to))) emitToUser(to, 'quick_chat', { from: userId, id });
    });
    socket.on('forfeit', async () => {
      const s = sessions.get(userSession.get(userId) ?? '');
      if (!s || s.state.winner !== null) return;
      s.forfeit(s.sideOf(userId)!);
      await finish(s);
    });

    socket.on('disconnect', () => {
      const set = sockets.get(userId);
      set?.delete(socket);
      if (set && set.size > 0) return; // still connected from another device
      sockets.delete(userId);
      queues.forEach((q) => q.remove(userId));
      const s = sessions.get(userSession.get(userId) ?? '');
      if (s) {
        s.setConnected(userId, false);
        emitMatch(s, 'player_disconnected', { userId, reconnectWindowMs: s.opts.reconnectWindowMs ?? 30000 });
        emitMatch(s, 'game_paused', { reason: 'disconnect', userId });
        persistState(s);
      }
    });
  });

  /** One scheduler tick: pair players, fill long waits with a bot, enforce timers. Exposed for tests. */
  async function pump() {
    const game = await getSetting(db, 'game');
    for (const [entry, q] of queues) {
      for (const [a, b] of q.findPairs()) {
        await startMatch({ humans: [a.userId, b.userId], mode: 'quick', ranked: true, entryCoins: entry }).catch((e) => console.error('startMatch', e));
      }
      for (const w of q.takeWaiting(game.botFillAfterSec * 1000)) {
        // bot games are free, unranked and never pay out
        await startMatch({ humans: [w.userId], mode: 'bot', ranked: false, entryCoins: 0 }).catch((e) => console.error('bot match', e));
      }
    }
    for (const s of [...sessions.values()]) {
      const wasPaused = s.paused;
      const act = s.checkTimeouts();
      if (!act) { void wasPaused; continue; }
      if (act.kind === 'turn_timeout') {
        emitMatch(s, 'turn_changed', { type: 'turn_changed', to: s.state.current, reason: 'timeout' });
        emitMatch(s, 'turn_started', { side: s.state.current, shooterId: s.shooter().userId, delayMs: 0 });
        persistState(s);
        scheduleBot(s);
      } else await finish(s).catch((e) => console.error('finish', e));
    }
  }

  async function restoreFromRedis() {
    if (!redis) return;
    for (const id of await redis.smembers('matches:active')) {
      const raw = await redis.get(`match:${id}:state`);
      if (!raw) { await redis.srem('matches:active', id); continue; }
      const s = GameSession.restore(JSON.parse(raw));
      sessions.set(s.matchId, s);
      for (const p of s.players) if (!p.isBot) userSession.set(p.userId, s.matchId);
    }
  }

  const timer = setInterval(() => { pump().catch((e) => console.error('pump', e)); }, opts.pairIntervalMs ?? 1000);
  void restoreFromRedis().catch((e) => console.error('restore', e));

  return {
    io, sessions, pump, startMatch, finish, handleShot,
    stop: () => { clearInterval(timer); for (const t of botTimers.values()) clearTimeout(t); io.close(); },
  };
}
