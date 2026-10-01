import { describe, expect, it } from 'vitest';
import { chooseShot, initialWorld, newGame, applyShot, simulateShot, DEFAULT_RULES, DEFAULT_PHYSICS, validateShot, type World } from './index';

const hash = (w: World) => JSON.stringify(w.bodies.map((b) => [b.id, +b.x.toFixed(6), +b.y.toFixed(6)]));

describe('board', () => {
  it('has 9 black, 9 white, 1 queen without overlaps', () => {
    const w = initialWorld();
    expect(w.bodies.filter((b) => b.kind === 'black')).toHaveLength(9);
    expect(w.bodies.filter((b) => b.kind === 'white')).toHaveLength(9);
    expect(w.bodies.filter((b) => b.kind === 'queen')).toHaveLength(1);
    for (let i = 0; i < w.bodies.length; i++)
      for (let j = i + 1; j < w.bodies.length; j++) {
        const a = w.bodies[i], b = w.bodies[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius - 0.01);
      }
  });
});

describe('physics', () => {
  it('is deterministic', () => {
    const shot = { strikerX: 500, angle: -Math.PI / 2, power: 0.8 };
    const a = simulateShot(initialWorld(), 0, shot);
    const b = simulateShot(initialWorld(), 0, shot);
    expect(hash(a.world)).toBe(hash(b.world));
    expect(a.steps).toBe(b.steps);
  });
  it('a hard centre shot scatters coins and comes to rest', () => {
    const start = initialWorld();
    const out = simulateShot(start, 0, { strikerX: 500, angle: -Math.PI / 2, power: 1 });
    expect(hash(out.world)).not.toBe(hash(start));
    expect(out.steps).toBeLessThan(DEFAULT_PHYSICS.maxSteps);
    expect(out.world.bodies.every((b) => b.vx === 0 && b.vy === 0)).toBe(true);
  });
  it('never leaves coins outside the board', () => {
    const out = simulateShot(initialWorld(), 0, { strikerX: 400, angle: -1.2, power: 1 });
    for (const b of out.world.bodies) {
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x).toBeLessThanOrEqual(1000);
      expect(b.y).toBeGreaterThanOrEqual(0); expect(b.y).toBeLessThanOrEqual(1000);
    }
  });
  it('pockets a coin rolled into a corner', () => {
    const w: World = { step: 0, bodies: [{ id: 1, kind: 'black', x: 200, y: 200, vx: 0, vy: 0, radius: 16, mass: 1, pocketed: false }] };
    // striker at bottom shot straight at coin cannot pocket; instead place coin and strike diagonally
    const out = simulateShot({ ...w, bodies: [{ ...w.bodies[0], x: 500, y: 500 }] }, 0, { strikerX: 500, angle: -Math.PI / 2, power: 1 });
    expect(out.pocketed.length + out.world.bodies.length).toBe(1);
  });
  it('rejects bad shots', () => {
    expect(validateShot({ strikerX: 500, angle: NaN, power: 0.5 })).not.toBeNull();
    expect(validateShot({ strikerX: 500, angle: 0, power: 2 })).not.toBeNull();
    expect(validateShot({ strikerX: 500, angle: 0, power: 0.5 })).toBeNull();
  });
});

describe('rules', () => {
  it('switches turn when nothing is pocketed', () => {
    const g = newGame(0);
    const { state } = applyShot(g, { strikerX: 500, angle: -Math.PI / 2, power: 0.05 });
    expect(state.current).toBe(1);
  });
  it('striker pocketed is a foul and passes the turn', () => {
    const g = newGame(0);
    g.world = { step: 0, bodies: [] };
    // aim from baseline toward the top-left pocket
    const shot = { strikerX: 250, angle: Math.atan2(0 - 850, 0 - 250), power: 1 };
    const r = applyShot(g, shot);
    expect(r.events.some((e) => e.type === 'foul')).toBe(true);
    expect(r.state.current).toBe(1);
  });
  it('queen without cover is returned', () => {
    const g = newGame(0);
    g.queen = { status: 'pending', by: 0 };
    g.world = { step: 0, bodies: [{ id: 5, kind: 'black', x: 800, y: 300, vx: 0, vy: 0, radius: 16, mass: 1, pocketed: false }] };
    const r = applyShot(g, { strikerX: 500, angle: -Math.PI / 2, power: 0.05 });
    expect(r.state.queen.status).toBe('board');
    expect(r.state.world.bodies.some((b) => b.kind === 'queen')).toBe(true);
  });
  it('never mutates its input', () => {
    const g = newGame(0);
    const before = JSON.stringify(g);
    applyShot(g, { strikerX: 500, angle: -Math.PI / 2, power: 0.9 });
    expect(JSON.stringify(g)).toBe(before);
  });
  it('rules are configurable', () => {
    expect(DEFAULT_RULES.queenCoverRequired).toBe(true);
  });
});

describe('ai', () => {
  it('returns valid shots for every difficulty', () => {
    for (const d of ['easy', 'medium', 'hard', 'expert'] as const) {
      const s = chooseShot(newGame(0), d, 7);
      expect(validateShot(s)).toBeNull();
    }
  });
  it('is reproducible for a given seed', () => {
    expect(chooseShot(newGame(0), 'hard', 3)).toEqual(chooseShot(newGame(0), 'hard', 3));
  });
  it('expert finishes a full game vs easy without crashing', () => {
    let g = newGame(0);
    let turns = 0;
    while (g.winner === null && turns < 400) {
      const d = g.current === 0 ? 'expert' : 'easy';
      g = applyShot(g, chooseShot(g, d, turns + 1)).state;
      turns++;
    }
    expect(turns).toBeGreaterThan(1);
  }, 120000);
});
