import { BASELINE_HALF_LENGTH, DEFAULT_PHYSICS } from './config';
import { clampStrikerX, isStrikerPlacementFree, pocketCenters, simulateShot, strikerStart } from './physics';
import { makeRng } from './rng';
import { DEFAULT_RULES, type GameState, type RuleConfig } from './rules';
import type { PhysicsConfig, Shot } from './types';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface Profile {
  /** striker positions tried along the baseline */
  positions: number;
  /** max candidate shots actually simulated */
  budget: number;
  /** gaussian-ish angle error (radians) */
  angleNoise: number;
  powerNoise: number;
  /** considers where the queen can be covered */
  queenAware: boolean;
  /** avoids giving the opponent coins / considers defence */
  defensive: boolean;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: { positions: 3, budget: 6, angleNoise: 0.09, powerNoise: 0.25, queenAware: false, defensive: false },
  medium: { positions: 5, budget: 24, angleNoise: 0.035, powerNoise: 0.12, queenAware: false, defensive: false },
  hard: { positions: 7, budget: 60, angleNoise: 0.012, powerNoise: 0.05, queenAware: true, defensive: true },
  expert: { positions: 11, budget: 140, angleNoise: 0.002, powerNoise: 0.015, queenAware: true, defensive: true },
};

/** Estimate the power needed to travel `dist` under constant friction + drag. */
function powerForDistance(dist: number, c: PhysicsConfig, boost: number) {
  const v = Math.sqrt(2 * c.friction * dist) * (1 + c.drag * 0.5) + c.stopSpeed;
  return Math.min(1, Math.max(0.05, (v * boost) / c.maxStrikerSpeed));
}

interface Candidate { shot: Shot; hint: number }

export function chooseShot(
  state: GameState,
  difficulty: Difficulty,
  seed = 1,
  rules: RuleConfig = DEFAULT_RULES,
  c: PhysicsConfig = DEFAULT_PHYSICS,
): Shot {
  const prof = PROFILES[difficulty];
  const rng = makeRng(seed);
  const side = state.current;
  const mine = state.colors[side];
  const dirY = side === 0 ? -1 : 1;
  const pockets = pocketCenters(c);
  const mid = c.boardSize / 2;
  const lim = BASELINE_HALF_LENGTH - c.strikerRadius;

  const targets = state.world.bodies.filter(
    (b) => b.kind === mine || (b.kind === 'queen' && rules.queenEnabled && (state.queen.status !== 'covered')),
  );
  const mustCoverQueen = state.queen.status === 'pending' && state.queen.by === side;

  const cands: Candidate[] = [];
  for (let pi = 0; pi < prof.positions; pi++) {
    const x = clampStrikerX(prof.positions === 1 ? mid : mid - lim + (2 * lim * pi) / (prof.positions - 1), c);
    const { y } = strikerStart(side, x, c);
    if (!isStrikerPlacementFree(state.world, x, y, c)) continue;
    for (const t of targets) {
      for (const p of pockets) {
        // ghost-ball: striker centre must be on the far side of the target from the pocket
        const tx = t.x - p.x, ty = t.y - p.y;
        const tl = Math.hypot(tx, ty);
        if (tl < 1) continue;
        const gx = t.x + (tx / tl) * (t.radius + c.strikerRadius);
        const gy = t.y + (ty / tl) * (t.radius + c.strikerRadius);
        const dx = gx - x, dy = gy - y;
        if (dy * dirY < 0) continue; // cannot shoot backwards through own baseline... allow only forward
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        // cut angle sanity: striker direction vs target->pocket direction
        const cut = Math.abs(Math.cos(angle - Math.atan2(-ty, -tx)));
        if (cut < 0.35) continue;
        const power = powerForDistance(dist + tl, c, 1.15);
        const hint = cut * 2 - (dist + tl) / c.boardSize - (t.kind === 'queen' && !mustCoverQueen ? 0.3 : 0);
        cands.push({ shot: { strikerX: x, angle, power }, hint });
      }
    }
    // fallback exploratory shot straight at the centre
    const ca = Math.atan2(mid - y, mid - x);
    cands.push({ shot: { strikerX: x, angle: ca, power: powerForDistance(Math.hypot(mid - x, mid - y), c, 1.1) }, hint: -1 });
  }

  cands.sort((a, b) => b.hint - a.hint);
  const picked = cands.slice(0, prof.budget);

  let best: { shot: Shot; score: number } | null = null;
  for (const cand of picked) {
    const noisy = (v: number, n: number) => v + (rng() * 2 - 1) * n;
    const variants = prof.defensive ? [1, 1.12] : [1];
    for (const pv of variants) {
      const shot: Shot = {
        strikerX: cand.shot.strikerX,
        angle: noisy(cand.shot.angle, prof.angleNoise),
        power: Math.min(1, Math.max(0.04, noisy(cand.shot.power * pv, prof.powerNoise * cand.shot.power))),
      };
      const out = simulateShot(state.world, side, shot, c);
      const own = out.pocketed.filter((b) => b.kind === mine).length;
      const opp = out.pocketed.filter((b) => b.kind !== mine && b.kind !== 'queen').length;
      const queen = out.pocketed.some((b) => b.kind === 'queen');
      let score = own * 10 - opp * 6;
      if (out.strikerPocketed) score -= 25;
      if (queen) {
        if (!prof.queenAware) score += 6;
        else score += own > 0 || mustCoverQueen ? 14 : -4; // only take the queen when it can be covered
      }
      if (mustCoverQueen && own === 0) score -= 8;
      if (prof.defensive && own === 0 && !out.strikerPocketed) {
        // quiet safe shot: prefer leaving few coins near pockets (cheap proxy: low striker speed use)
        score += 1 - shot.power;
      }
      if (!best || score > best.score) best = { shot, score };
    }
  }
  return best?.shot ?? { strikerX: mid, angle: dirY < 0 ? -Math.PI / 2 : Math.PI / 2, power: 0.3 };
}
