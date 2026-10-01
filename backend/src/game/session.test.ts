import { describe, expect, it } from 'vitest';
import { GameSession } from './session';
import { ratingDelta, expectedScore } from './elo';
import { MatchQueue, allowedGap } from '../matchmaking/queue';

const mk = (now = { t: 1000 }) => ({ now, s: new GameSession({ matchId: 'm', players: ['a', 'b'], now: () => now.t }) });
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
    expect(s.checkTimeouts()).toEqual({ forfeit: 1 });
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
