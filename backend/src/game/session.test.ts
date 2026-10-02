import { describe, expect, it } from 'vitest';
import { GameSession } from './session';
import { ratingDelta, expectedScore } from './elo';
import { MatchQueue, allowedGap } from '../matchmaking/queue';

const mk = (now = { t: 1000 }) => ({ now, s: new GameSession({ matchId: 'm', players: [{ userId: 'a' }, { userId: 'b' }], now: () => now.t }) });
const shot = { strikerX: 500, angle: -Math.PI / 2, power: 0.6 };

describe('GameSession anti-cheat', () => {
  it('accepts a valid shot from the player whose turn it is', () => {
    const { s } = mk();
    expect(s.submitShot('a', shot).ok).toBe(true);
  });
  it('rejects out-of-turn, stranger, bad power and off-baseline shots', () => {
    const { s } = mk();
    expect(s.submitShot('b', shot)).toMatchObject({ ok: false, reason: 'not_your_turn' });
    expect(s.submitShot('x', shot)).toMatchObject({ ok: false, reason: 'not_a_player' });
    expect(s.submitShot('a', { ...shot, power: 5 })).toMatchObject({ ok: false });
    expect(s.submitShot('a', { ...shot, strikerX: 50 })).toMatchObject({ ok: false, reason: 'striker_off_baseline' });
  });
  it('flags repeated violations as suspicious', () => {
    const { s } = mk();
    for (let i = 0; i < 3; i++) s.submitShot('b', shot);
    expect(s.isSuspicious()).toBe(true);
  });
  it('rate-limits impossibly fast consecutive shots by the same player', () => {
    const { s, now } = mk();
    s.submitShot('a', { ...shot, power: 0.05 }); // no pocket, turn passes
    s.submitShot('b', { ...shot, power: 0.05 });
    now.t += 100;
    expect(s.submitShot('a', shot)).toMatchObject({ ok: false, reason: 'shot_too_fast' });
  });
  it('forfeits after the reconnect window and restores on reconnect', () => {
    const { s, now } = mk();
    s.setConnected('b', false);
    now.t += 10_000;
    expect(s.checkTimeouts()).toBeNull();
    s.setConnected('b', true);
    expect(s.snapshot().players[1].connected).toBe(true);
    s.setConnected('b', false);
    now.t += 31_000;
    expect(s.checkTimeouts()).toEqual({ kind: 'forfeit', side: 1 });
    expect(s.state.winner).toBe(0);
  });
  it('snapshot hides nothing the client could not already see and has all coins', () => {
    expect(mk().s.snapshot().coins).toHaveLength(19);
  });
});

describe('elo', () => {
  it('is symmetric-ish and zero-sum for equal players', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
    expect(ratingDelta(1200, 1200, 1, 50)).toBe(-ratingDelta(1200, 1200, 0, 50));
  });
  it('rewards upsets more', () => {
    expect(ratingDelta(1000, 1400, 1, 10)).toBeGreaterThan(ratingDelta(1400, 1000, 1, 10));
  });
});

describe('matchmaking', () => {
  const e = (userId: string, rating: number, joinedAt: number, region = 'in') => ({ userId, rating, level: 1, region, latencyMs: 50, joinedAt });
  it('pairs close ratings and refuses unfair pairings at first', () => {
    const q = new MatchQueue();
    q.add(e('a', 1200, 0)); q.add(e('b', 1260, 0)); q.add(e('c', 1900, 0));
    const pairs = q.findPairs(1000);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].map((p) => p.userId).sort()).toEqual(['a', 'b']);
    expect(q.has('c')).toBe(true);
  });
  it('widens the window over time', () => {
    expect(allowedGap(60_000)).toBeGreaterThan(allowedGap(0));
    const q = new MatchQueue();
    q.add(e('a', 1000, 0)); q.add(e('c', 1500, 0));
    expect(q.findPairs(1000)).toHaveLength(0);
    expect(q.findPairs(60_000)).toHaveLength(1);
  });
  it('does not match a player with themselves', () => {
    const q = new MatchQueue();
    q.add(e('a', 1000, 0));
    expect(q.findPairs(100_000)).toHaveLength(0);
  });
});

describe('GameSession extras', () => {
  const noMove = { strikerX: 500, angle: -Math.PI / 2, power: 0.05 };
  const mk4 = (now = { t: 1000 }) => ({ now, s: new GameSession({ matchId: 'm4', players: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }, { userId: 'd' }], now: () => now.t }) });

  it('4-player doubles: teammates alternate, opponents are teams', () => {
    const { s, now } = mk4();
    expect(s.shooter().userId).toBe('a');
    expect(s.submitShot('c', noMove)).toMatchObject({ ok: false, reason: 'not_your_turn' }); // teammate must wait
    now.t += 500; expect(s.submitShot('a', noMove).ok).toBe(true);
    expect(s.shooter().userId).toBe('b');
    now.t += 500; expect(s.submitShot('b', noMove).ok).toBe(true);
    expect(s.shooter().userId).toBe('c'); // team 0's second player
    expect(s.sideOf('c')).toBe(0);
    expect(s.sideOf('d')).toBe(1);
  });
  it('rejects 3 players', () => {
    expect(() => new GameSession({ matchId: 'x', players: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }] })).toThrow();
  });
  it('turn timer passes the turn, and three timeouts in a row forfeit', () => {
    const { s, now } = mk();
    now.t += 46_000;
    expect(s.checkTimeouts()).toMatchObject({ kind: 'turn_timeout', userId: 'a' });
    expect(s.state.current).toBe(1);
    now.t += 46_000; expect(s.checkTimeouts()).toMatchObject({ kind: 'turn_timeout', userId: 'b' });
    now.t += 46_000; expect(s.checkTimeouts()).toMatchObject({ kind: 'turn_timeout', userId: 'a' });
    now.t += 46_000; expect(s.checkTimeouts()).toMatchObject({ kind: 'turn_timeout', userId: 'b' });
    now.t += 46_000; expect(s.checkTimeouts()).toMatchObject({ kind: 'forfeit', side: 0 });
    expect(s.state.winner).toBe(1);
  });
  it('a timed match ends on score when the clock runs out', () => {
    const now = { t: 1000 };
    const s = new GameSession({ matchId: 't', players: [{ userId: 'a' }, { userId: 'b' }], durationMs: 60_000, turnTimeMs: 600_000, now: () => now.t });
    s.state = { ...s.state, scores: [3, 1] };
    now.t += 61_000;
    expect(s.checkTimeouts()).toEqual({ kind: 'time_up' });
    expect(s.state.winner).toBe(0);
    expect(s.endReason).toBe('time');
  });
  it('time spent waiting for a reconnect does not consume the turn clock', () => {
    const { s, now } = mk();
    now.t += 30_000;
    s.setConnected('b', false);
    expect(s.paused).toBe(true);
    expect(s.submitShot('a', noMove)).toMatchObject({ ok: false, reason: 'game_paused' });
    now.t += 20_000; // still inside the 30s window... plus turn would have expired if the clock ran
    expect(s.checkTimeouts()).toBeNull();
    s.setConnected('b', true);
    expect(s.paused).toBe(false);
    now.t += 5_000;
    expect(s.checkTimeouts()).toBeNull(); // 35s of real turn time, not 55
  });
  it('rejects a striker placed on top of a coin', () => {
    const { s } = mk();
    s.state = { ...s.state, world: { ...s.state.world, bodies: [...s.state.world.bodies, { id: 99, kind: 'black', x: 500, y: 850, vx: 0, vy: 0, radius: 16, mass: 1, pocketed: false }] } };
    expect(s.submitShot('a', shot)).toMatchObject({ ok: false, reason: 'illegal_placement' });
  });
  it('serializes and restores a live game (server restart)', () => {
    const { s, now } = mk();
    now.t += 500; s.submitShot('a', { strikerX: 500, angle: -Math.PI / 2, power: 0.9 });
    const copy = GameSession.restore(JSON.parse(JSON.stringify(s.serialize())), () => now.t);
    expect(copy.state.scores).toEqual(s.state.scores);
    expect(copy.state.world.bodies.length).toBe(s.state.world.bodies.length);
    expect(copy.shooter().userId).toBe(s.shooter().userId);
    expect(copy.paused).toBe(true); // everyone must reconnect after a restart
  });
  it('records per-player stats', () => {
    const { s } = mk();
    s.submitShot('a', { strikerX: 500, angle: -Math.PI / 2, power: 0.9 });
    expect(s.stats.a.shots).toBe(1);
  });
});
