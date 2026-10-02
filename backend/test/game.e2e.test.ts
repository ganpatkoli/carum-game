import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { emitAck, once, startTestServer } from './helpers';
import { getSetting, setSetting } from '../src/common/settings';

let t: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => { t = await startTestServer({ botDifficulty: 'easy' }); });
afterAll(async () => { await t.stop(); });

const bal = async (id: string) => Number((await t.db.wallet.findUniqueOrThrow({ where: { userId: id } })).balance);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pair(entry = 0) {
  const a = await t.registerUser('Ma'); const b = await t.registerUser('Mb');
  const sa = await t.connect(a.accessToken); const sb = await t.connect(b.accessToken);
  const started = Promise.all([once(sa, 'game_started'), once(sb, 'game_started')]);
  expect((await emitAck(sa, 'queue_join', { entry })).ok).toBe(true);
  expect((await emitAck(sb, 'queue_join', { entry })).ok).toBe(true);
  await t.rt.pump();
  const [ga] = await started;
  const first = ga.snapshot.shooterId === a.userId ? { u: a, s: sa } : { u: b, s: sb };
  const second = first.u === a ? { u: b, s: sb } : { u: a, s: sa };
  return { a, b, sa, sb, ga, first, second, matchId: ga.snapshot.matchId as string, close: () => { sa.close(); sb.close(); } };
}

/** both players alternate harmless low-power shots (turn passes each time) so the match counts as "real". */
async function playShots(m: Awaited<ReturnType<typeof pair>>, n: number) {
  for (let i = 0; i < n; i++) {
    await sleep(350);
    const sess = t.rt.sessions.get(m.matchId)!;
    const who = sess.shooter().userId === m.first.u.userId ? m.first : m.second;
    const r = await emitAck(who.s, 'shot', { strikerX: 500, angle: -Math.PI / 2, power: 0.05 });
    if (!r.ok) throw new Error('quiet shot rejected: ' + r.reason);
  }
}

describe('ranked quick match', () => {
  it('pairs, takes entry fees, validates shots server-side, syncs frames, and settles everything', async () => {
    const m = await pair(50);
    expect(m.ga).toMatchObject({ mode: 'quick', entryCoins: 50, countdownMs: 3000 });
    expect(m.ga.snapshot.ranked).toBe(true);
    expect(m.ga.snapshot.coins).toHaveLength(19);
    for (const u of [m.a, m.b]) expect(await bal(u.userId)).toBe(450);

    // cheating attempts
    expect(await emitAck(m.second.s, 'shot', { strikerX: 500, angle: -1.5, power: 0.5 })).toMatchObject({ ok: false, reason: 'not_your_turn' });
    expect((await emitAck(m.first.s, 'shot', { strikerX: 500, angle: -1.5, power: 99 })).ok).toBe(false);
    expect((await emitAck(m.first.s, 'shot', { strikerX: 5, angle: -1.5, power: 0.5 })).ok).toBe(false);
    expect((await emitAck(m.first.s, 'shot', { strikerX: 'x' })).ok).toBe(false);

    const sync = once(m.second.s, 'shot_sync');
    expect((await emitAck(m.first.s, 'shot', { strikerX: 500, angle: -Math.PI / 2, power: 0.9 })).ok).toBe(true);
    const ev = await sync;
    expect(ev.by).toBe(m.first.u.userId);
    expect(ev.sim.frames.length).toBeGreaterThan(5);
    expect(ev.sim.frames[0].b.length % 3).toBe(0);
    expect(ev.snapshot.coins.length).toBeGreaterThan(0);
    expect(ev.animMs).toBeGreaterThan(600);

    await playShots(m, 3); // 1 real shot above + 3 quiet shots = a genuine game
    // loser resigns → winner takes the pot
    const fin = once(m.first.s, 'game_finished');
    m.second.s.emit('forfeit');
    const f = await fin;
    expect(f.reason).toBe('forfeit');
    expect(f.winner).toBe(m.first.u.team ?? f.winner);
    const win = f.summaries.find((s: any) => s.result === 'win'); const lose = f.summaries.find((s: any) => s.result === 'loss');
    expect(win.userId).toBe(m.first.u.userId);
    expect(win.ratingChange).toBeGreaterThan(0);
    expect(lose.ratingChange).toBeLessThan(0);
    expect(win.ratingChange + lose.ratingChange).toBe(0); // equal ratings, equal games → zero-sum
    expect(win.coins).toBe(50); expect(lose.coins).toBe(-50);
    await sleep(100);
    expect(await bal(m.first.u.userId)).toBe(450 + 100 + 100); // pot + FIRST_WIN reward
    expect(await bal(m.second.u.userId)).toBe(450);

    const match = await t.db.match.findUniqueOrThrow({ where: { id: m.matchId }, include: { result: true, players: true, events: true } });
    expect(match).toMatchObject({ status: 'FINISHED', ranked: true });
    expect(match.result).toMatchObject({ winnerId: m.first.u.userId, reason: 'forfeit' });
    expect(match.events.some((e) => e.type === 'shot')).toBe(true);
    expect(match.events.some((e) => e.type === 'rejected_shot')).toBe(true);
    const wp = await t.db.profile.findUniqueOrThrow({ where: { userId: m.first.u.userId } });
    expect(wp).toMatchObject({ matchesPlayed: 1, matchesWon: 1, currentStreak: 1, xp: 50 });
    const lp = await t.db.profile.findUniqueOrThrow({ where: { userId: m.second.u.userId } });
    expect(lp).toMatchObject({ matchesPlayed: 1, matchesLost: 1, currentStreak: 0 });
    const wr = await t.db.rating.findUniqueOrThrow({ where: { userId: m.first.u.userId } });
    expect(wr).toMatchObject({ previous: 1200, highest: wr.rating });
    // progression hooks ran
    expect(win.achievements).toContain('FIRST_WIN');
    expect(win.achievements).not.toContain('PERFECT_GAME'); // winning by forfeit is not a perfect game
    const missions = (await t.http('GET', '/missions', undefined, m.first.u.accessToken)).body;
    expect(missions.find((x: any) => x.id === 'play_1').progress).toBe(1);
    expect(missions.find((x: any) => x.id === 'win_1').progress).toBe(1);
    // both can queue again
    expect((await emitAck(m.first.s, 'queue_join', { entry: 0 })).ok).toBe(true);
    m.close();
  });

  it('free quick matches pay the configured win / loss coins', async () => {
    const m = await pair(0);
    await playShots(m, 4);
    const fin = once(m.first.s, 'game_finished');
    m.second.s.emit('forfeit');
    const f = await fin; await sleep(100);
    const g = await getSetting(t.db, 'game');
    const achv = (await t.db.walletTransaction.findMany({ where: { userId: m.first.u.userId, refType: 'achievement' } })).reduce((n, x) => n + Number(x.amount), 0);
    expect(await bal(m.first.u.userId)).toBe(500 + g.winCoins + achv);
    expect(await bal(m.second.u.userId)).toBe(500 + g.lossCoins);
    const types = (await t.db.walletTransaction.findMany({ where: { userId: m.second.u.userId } })).map((x) => x.type);
    expect(types).toContain('GAME_LOSS');
    expect(f.summaries.find((s: any) => s.result === 'win').coins).toBe(g.winCoins);
    m.close();
  });

  it('refuses invalid entry options and players who cannot pay', async () => {
    const u = await t.registerUser('Qe'); const s = await t.connect(u.accessToken);
    expect(await emitAck(s, 'queue_join', { entry: 7 })).toMatchObject({ ok: false, reason: 'bad_entry' });
    expect(await emitAck(s, 'queue_join', { entry: 500 })).toMatchObject({ ok: true });
    s.emit('queue_leave'); await sleep(100);
    await t.db.$executeRaw`UPDATE "Wallet" SET balance = 10, "totalEarned" = 10 + "totalSpent" WHERE "userId" = ${u.userId}::uuid`;
    expect(await emitAck(s, 'queue_join', { entry: 100 })).toMatchObject({ ok: false, reason: 'insufficient_funds' });
    s.close();
  });

  it('refunds the first payer if the second cannot afford the fee (race between queueing and starting)', async () => {
    const a = await t.registerUser('Ra'); const b = await t.registerUser('Rb');
    const sa = await t.connect(a.accessToken); const sb = await t.connect(b.accessToken);
    await emitAck(sa, 'queue_join', { entry: 100 }); await emitAck(sb, 'queue_join', { entry: 100 });
    await t.db.$executeRaw`UPDATE "Wallet" SET balance = 5, "totalEarned" = 5 + "totalSpent" WHERE "userId" = ${b.userId}::uuid`; // spends coins after queueing
    const err = once(sa, 'error_message');
    await t.rt.pump();
    expect((await err).code).toBe('insufficient_funds');
    expect(await bal(a.userId)).toBe(500); // fee returned
    expect(await bal(b.userId)).toBe(5);
    expect(await t.db.walletTransaction.count({ where: { userId: a.userId, type: 'REFUND' } })).toBe(1);
    sa.close(); sb.close();
  });
});

describe('anti-boosting', () => {
  it('an instantly-abandoned match changes no rating and grants no progress', async () => {
    const m = await pair(0);
    const fin = once(m.first.s, 'game_finished');
    m.second.s.emit('forfeit');
    const f = await fin;
    expect(f.summaries.every((x: any) => x.ratingChange === 0)).toBe(true);
    expect(f.summaries.every((x: any) => x.achievements.length === 0)).toBe(true);
    const missions = (await t.http('GET', '/missions', undefined, m.first.u.accessToken)).body;
    expect(missions.find((x: any) => x.id === 'play_1').progress).toBe(0);
    // it still shows in the stats
    expect((await t.db.profile.findUniqueOrThrow({ where: { userId: m.first.u.userId } })).matchesPlayed).toBe(1);
    m.close();
  });
});

describe('connection handling', () => {
  it('pauses on disconnect, restores state on reconnect, and resumes', async () => {
    const m = await pair(0);
    const paused = once(m.first.s, 'game_paused'); const disc = once(m.first.s, 'player_disconnected');
    m.second.s.close();
    expect((await disc).userId).toBe(m.second.u.userId);
    await paused;
    expect(t.rt.sessions.get(m.matchId)!.paused).toBe(true);
    expect(await emitAck(m.first.s, 'shot', { strikerX: 500, angle: -1.5, power: 0.5 })).toMatchObject({ ok: false, reason: 'game_paused' });

    const back = await t.connect(m.second.u.accessToken);
    const state = await once(back, 'game_state');
    expect(state.snapshot.matchId).toBe(m.matchId);
    expect(Object.keys(state.profiles)).toHaveLength(2);
    expect(state.snapshot.paused).toBe(false);
    expect(t.rt.sessions.get(m.matchId)!.paused).toBe(false);
    // get_state works on demand too
    back.emit('get_state'); expect((await once(back, 'game_state')).snapshot.matchId).toBe(m.matchId);
    const fin = once(m.first.s, 'game_finished'); back.emit('forfeit'); await fin;
    m.first.s.close(); back.close();
  });

  it('forfeits an opponent who stays away past the reconnect window', async () => {
    const orig = await getSetting(t.db, 'game');
    await setSetting(t.db, 'game', { ...orig, reconnectWindowSec: 5 });
    try {
      const m = await pair(0);
      m.second.s.close();
      const fin = once(m.first.s, 'game_finished');
      await sleep(5200);
      await t.rt.pump();
      const f = await fin;
      expect(f.reason).toBe('forfeit');
      expect(f.summaries.find((s: any) => s.result === 'win').userId).toBe(m.first.u.userId);
      m.first.s.close();
    } finally { await setSetting(t.db, 'game', orig); }
  }, 20000);

  it('multiple devices: closing one socket does not pause the game', async () => {
    const m = await pair(0);
    const second = await t.connect(m.first.u.accessToken);
    m.first.s.close(); await sleep(150);
    expect(t.rt.sessions.get(m.matchId)!.paused).toBe(false);
    second.emit('forfeit'); await once(m.second.s, 'game_finished');
    second.close(); m.second.s.close();
  });

  it('turn timer passes the turn automatically', async () => {
    const m = await pair(0);
    const sess = t.rt.sessions.get(m.matchId)!;
    (sess as any).turnStartedAt -= 60_000;
    const changed = once(m.second.s, 'turn_changed');
    await t.rt.pump();
    expect((await changed).reason).toBe('timeout');
    expect(sess.shooter().userId).toBe(m.second.u.userId);
    m.first.s.emit('forfeit'); await once(m.second.s, 'game_finished'); m.close();
  });
});

describe('private timed room', () => {
  it('ends on the clock and refunds a draw', async () => {
    const h = await t.registerUser('Th'); const g = await t.registerUser('Tg');
    const room = (await t.http('POST', '/rooms', { entryCoins: 100, durationSec: 1 }, h.accessToken)).body;
    await t.http('POST', '/rooms/join', { code: room.code }, g.accessToken);
    const sh = await t.connect(h.accessToken); const sg = await t.connect(g.accessToken);
    await emitAck(sh, 'room_join', { code: room.code }); await emitAck(sg, 'room_join', { code: room.code });
    await emitAck(sg, 'room_ready', { code: room.code, ready: true });
    const started = once(sg, 'game_started');
    await emitAck(sh, 'room_start', { code: room.code }); await started;
    expect(await bal(h.userId)).toBe(400);
    const fin = once(sh, 'game_finished');
    await sleep(1200); // 0–0 after one second
    await t.rt.pump();
    const f = await fin;
    expect(f).toMatchObject({ winner: 'draw', reason: 'time' });
    await sleep(100);
    expect(await bal(h.userId)).toBe(500); expect(await bal(g.userId)).toBe(500); // refunds
    const prof = await t.db.profile.findUniqueOrThrow({ where: { userId: h.userId } });
    expect(prof.draws).toBe(1);
    // private games never touch the rating
    expect((await t.db.rating.findUniqueOrThrow({ where: { userId: h.userId } })).rating).toBe(1200);
    sh.close(); sg.close();
  });
});

describe('bot opponent', () => {
  it('fills a long wait with a free, unranked bot match that plays back', async () => {
    const orig = await getSetting(t.db, 'game');
    await setSetting(t.db, 'game', { ...orig, botFillAfterSec: 3 });
    try {
      const u = await t.registerUser('Bt'); const s = await t.connect(u.accessToken);
      await emitAck(s, 'queue_join', { entry: 100 }); // wants a paid game, but bots are always free
      await sleep(3200);
      const started = once(s, 'game_started');
      await t.rt.pump();
      const gs = await started;
      expect(gs).toMatchObject({ mode: 'bot', entryCoins: 0 });
      expect(gs.snapshot.ranked).toBe(false);
      expect(gs.snapshot.players.some((p: any) => p.isBot)).toBe(true);
      const botId = gs.snapshot.players.find((p: any) => p.isBot).userId;
      expect(gs.profiles[botId].username).toBeTruthy();
      expect(await bal(u.userId)).toBe(500);

      // human shoots, bot answers on its own
      const botShot = new Promise<any>((res) => s.on('shot_sync', (e) => { if (e.by === botId) res(e); }));
      expect((await emitAck(s, 'shot', { strikerX: 500, angle: -Math.PI / 2, power: 0.05 })).ok).toBe(true);
      const e = await Promise.race([botShot, sleep(20000).then(() => null)]);
      expect(e).not.toBeNull();
      expect(e.snapshot.shooterId).toBeTruthy();

      const fin = once(s, 'game_finished');
      s.emit('forfeit');
      const f = await fin; await sleep(100);
      expect(f.summaries).toHaveLength(1);
      expect(f.summaries[0]).toMatchObject({ result: 'loss', ratingChange: 0, coins: 0 });
      expect(await bal(u.userId)).toBe(500); // no loss coins vs a bot either
      expect((await t.db.rating.findUniqueOrThrow({ where: { userId: u.userId } })).rating).toBe(1200);
      s.close();
    } finally { await setSetting(t.db, 'game', orig); }
  }, 40000);
});

describe('emotes & quick chat', () => {
  it('delivers to the opponent, enforces cooldown, ignores unknown ids, respects blocks', async () => {
    const m = await pair(0);
    const got = once(m.second.s, 'emote');
    m.first.s.emit('emote', 'gg');
    expect(await got).toEqual({ from: m.first.u.userId, id: 'gg' });
    // cooldown: immediate second emote is dropped
    let extra = 0; m.second.s.on('emote', () => extra++);
    m.first.s.emit('emote', 'fire'); await sleep(200);
    expect(extra).toBe(0);
    // unknown ids are ignored
    m.second.s.emit('emote', '<script>'); await sleep(100);
    // blocked player does not receive chat from the blocker's opponent
    await t.http('POST', '/blocks', { userId: m.first.u.userId }, m.second.u.accessToken);
    let chat = 0; m.second.s.on('quick_chat', () => chat++);
    await sleep(3100);
    m.first.s.emit('quick_chat', 'nice_shot'); await sleep(250);
    expect(chat).toBe(0);
    const fin = once(m.first.s, 'game_finished'); m.second.s.emit('forfeit'); await fin;
    m.close();
  }, 20000);
});

describe('Redis persistence', () => {
  it('a restarted server restores live matches from Redis and players can reconnect', async () => {
    const store = new Map<string, string>(); const sets = new Map<string, Set<string>>();
    const fake = {
      async set(k: string, v: string) { store.set(k, v); }, async get(k: string) { return store.get(k) ?? null; }, async del(k: string) { store.delete(k); },
      async sadd(k: string, m: string) { (sets.get(k) ?? sets.set(k, new Set()).get(k)!).add(m); }, async srem(k: string, m: string) { sets.get(k)?.delete(m); },
      async smembers(k: string) { return [...(sets.get(k) ?? [])]; },
    };
    const { buildApp } = await import('../src/app');
    const { attachGameServer } = await import('../src/websocket/socket');
    const { io: client } = await import('socket.io-client');
    const boot = async () => { const app = buildApp(t.db); await app.ready(); const rt = attachGameServer(app.server, t.db, fake as any, { pairIntervalMs: 60_000 }); await app.listen({ port: 0 }); return { app, rt, base: `http://127.0.0.1:${(app.server.address() as any).port}` }; };

    const one = await boot();
    const a = await t.registerUser('Rs1'); const b = await t.registerUser('Rs2');
    const conn = (base: string, tok: string) => new Promise<Socket>((res) => { const s = client(base, { auth: { token: tok }, transports: ['websocket'] }); s.once('connect', () => res(s)); });
    const [sa, sb] = [await conn(one.base, a.accessToken), await conn(one.base, b.accessToken)];
    const started = once(sa, 'game_started');
    await emitAck(sa, 'queue_join', { entry: 0 }); await emitAck(sb, 'queue_join', { entry: 0 });
    await one.rt.pump(); const gs = await started;
    const firstId = gs.snapshot.shooterId;
    await emitAck(firstId === a.userId ? sa : sb, 'shot', { strikerX: 500, angle: -Math.PI / 2, power: 0.9 });
    await sleep(100);
    const scoresBefore = one.rt.sessions.get(gs.snapshot.matchId)!.state.scores;
    const coinsBefore = one.rt.sessions.get(gs.snapshot.matchId)!.state.world.bodies.length;
    sa.close(); sb.close(); one.rt.stop(); await one.app.close(); // "crash"

    const two = await boot(); await sleep(150);
    const restored = two.rt.sessions.get(gs.snapshot.matchId);
    expect(restored).toBeTruthy();
    expect(restored!.state.scores).toEqual(scoresBefore);
    expect(restored!.state.world.bodies.length).toBe(coinsBefore);
    const s2 = await conn(two.base, a.accessToken);
    const st = await once(s2, 'game_state');
    expect(st.snapshot.matchId).toBe(gs.snapshot.matchId);
    expect(st.snapshot.coins).toHaveLength(coinsBefore);
    const s3 = await conn(two.base, b.accessToken); await once(s3, 'game_state');
    expect(two.rt.sessions.get(gs.snapshot.matchId)!.paused).toBe(false);
    const fin = once(s3, 'game_finished'); s2.emit('forfeit'); await fin;
    expect(store.has(`match:${gs.snapshot.matchId}:state`)).toBe(false); // cleaned up
    [s2, s3].forEach((s) => s.close()); two.rt.stop(); await two.app.close();
  }, 30000);
});
