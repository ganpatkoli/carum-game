import { BASELINE_HALF_LENGTH, BASELINE_OFFSET, DEFAULT_PHYSICS } from './config';
import type { Body, Frame, HitEvent, PhysicsConfig, PocketEvent, Shot, ShotOutcome, World } from './types';

export interface SimOptions {
  /** record sampled frames / hit / pocket events for animation (costs memory, off by default) */
  record?: boolean;
  /** record one frame every N physics steps (4 = 30fps at dt 1/120) */
  frameEvery?: number;
}

/**
 * Fixed-step, allocation-light 2D circle physics. Pure arithmetic on numbers with
 * a fixed iteration order, so the server and every client produce the same
 * result for the same input (same JS engine semantics for + - * / sqrt).
 */

export function cloneWorld(w: World): World {
  return { step: w.step, bodies: w.bodies.map((b) => ({ ...b })) };
}

export function pocketCenters(c: PhysicsConfig = DEFAULT_PHYSICS) {
  const s = c.boardSize;
  const o = c.wallInset;
  return [
    { x: o, y: o },
    { x: s - o, y: o },
    { x: o, y: s - o },
    { x: s - o, y: s - o },
  ];
}

/** Clamp a requested striker x to the legal baseline segment. */
export function clampStrikerX(x: number, c: PhysicsConfig = DEFAULT_PHYSICS): number {
  const mid = c.boardSize / 2;
  const lim = BASELINE_HALF_LENGTH - c.strikerRadius;
  return Math.min(mid + lim, Math.max(mid - lim, x));
}

/** player side 0 shoots from the bottom baseline (angle up = -y); side 1 from the top. */
export function strikerStart(side: 0 | 1, x: number, c: PhysicsConfig = DEFAULT_PHYSICS) {
  return {
    x: clampStrikerX(x, c),
    y: side === 0 ? c.boardSize - BASELINE_OFFSET : BASELINE_OFFSET,
  };
}

export function isStrikerPlacementFree(world: World, x: number, y: number, c: PhysicsConfig = DEFAULT_PHYSICS) {
  for (const b of world.bodies) {
    if (b.pocketed || b.kind === 'striker') continue;
    const dx = b.x - x, dy = b.y - y;
    const r = b.radius + c.strikerRadius;
    if (dx * dx + dy * dy < r * r) return false;
  }
  return true;
}

export function makeStriker(side: 0 | 1, x: number, c: PhysicsConfig = DEFAULT_PHYSICS): Body {
  const p = strikerStart(side, x, c);
  return { id: 0, kind: 'striker', x: p.x, y: p.y, vx: 0, vy: 0, radius: c.strikerRadius, mass: c.strikerMass, pocketed: false };
}

/** Validate shot inputs (server uses this before simulating). */
export function validateShot(shot: Shot): string | null {
  if (![shot.strikerX, shot.angle, shot.power].every(Number.isFinite)) return 'non-finite shot value';
  if (shot.power < 0 || shot.power > 1) return 'power out of range';
  if (shot.power < 0.02) return 'power too low';
  if (Math.abs(shot.angle) > Math.PI * 4) return 'angle out of range';
  return null;
}

export function simulateShot(
  start: World,
  side: 0 | 1,
  shot: Shot,
  c: PhysicsConfig = DEFAULT_PHYSICS,
  opts: SimOptions = {},
): ShotOutcome {
  const world = cloneWorld(start);
  world.bodies = world.bodies.filter((b) => b.kind !== 'striker');
  const striker = makeStriker(side, shot.strikerX, c);
  const speed = shot.power * c.maxStrikerSpeed;
  striker.vx = Math.cos(shot.angle) * speed;
  striker.vy = Math.sin(shot.angle) * speed;
  world.bodies.unshift(striker);

  const pockets = pocketCenters(c);
  const pocketed: Body[] = [];
  let firstContact: ShotOutcome['firstContact'] = null;
  let steps = 0;
  const frames: Frame[] = [];
  const hits: HitEvent[] = [];
  const pocketEvents: PocketEvent[] = [];
  const every = opts.frameEvery ?? 4;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const snap = () => {
    const b: number[] = [];
    for (const o of world.bodies) if (!o.pocketed) b.push(o.id, r1(o.x), r1(o.y));
    frames.push({ step: steps, b });
  };
  if (opts.record) snap();

  while (steps < c.maxSteps) {
    steps++;
    world.step++;
    const live = world.bodies;
    let moving = false;

    // integrate
    for (const b of live) {
      if (b.pocketed) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const decel = (c.friction + c.drag * sp) * c.dt;
        const nsp = sp - decel;
        if (nsp <= c.stopSpeed * 0.25 && sp < c.stopSpeed) {
          b.vx = 0; b.vy = 0;
        } else if (nsp <= 0) {
          b.vx = 0; b.vy = 0;
        } else {
          const k = nsp / sp;
          b.vx *= k; b.vy *= k;
        }
      }
      b.x += b.vx * c.dt;
      b.y += b.vy * c.dt;
      if (b.vx !== 0 || b.vy !== 0) moving = true;
    }

    // walls
    const lo = c.wallInset, hi = c.boardSize - c.wallInset;
    for (const b of live) {
      if (b.pocketed) continue;
      const pvx = b.vx, pvy = b.vy;
      if (b.x - b.radius < lo) { b.x = lo + b.radius; b.vx = Math.abs(b.vx) * c.wallRestitution; }
      else if (b.x + b.radius > hi) { b.x = hi - b.radius; b.vx = -Math.abs(b.vx) * c.wallRestitution; }
      if (b.y - b.radius < lo) { b.y = lo + b.radius; b.vy = Math.abs(b.vy) * c.wallRestitution; }
      else if (b.y + b.radius > hi) { b.y = hi - b.radius; b.vy = -Math.abs(b.vy) * c.wallRestitution; }
      if (opts.record && (pvx !== b.vx || pvy !== b.vy)) hits.push({ step: steps, kind: 'wall', v: Math.hypot(pvx, pvy) });
    }

    // pockets (checked before collisions so a rim-grazing coin still drops)
    for (const b of live) {
      if (b.pocketed) continue;
      for (const p of pockets) {
        const dx = b.x - p.x, dy = b.y - p.y;
        const r = c.pocketRadius;
        if (dx * dx + dy * dy < r * r) {
          b.pocketed = true; b.vx = 0; b.vy = 0;
          pocketed.push(b);
          if (opts.record) pocketEvents.push({ step: steps, id: b.id, kind: b.kind });
          break;
        }
      }
    }

    // pairwise collisions, fixed order
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        if (b.pocketed) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const invA = 1 / a.mass, invB = 1 / b.mass;
        // positional correction
        const overlap = rr - d;
        const corr = overlap / (invA + invB);
        a.x -= nx * corr * invA; a.y -= ny * corr * invA;
        b.x += nx * corr * invB; b.y += ny * corr * invB;
        // impulse
        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
          const jImp = (-(1 + c.coinRestitution) * rvn) / (invA + invB);
          a.vx -= jImp * invA * nx; a.vy -= jImp * invA * ny;
          b.vx += jImp * invB * nx; b.vy += jImp * invB * ny;
        }
        if (opts.record && rvn < -20) hits.push({ step: steps, kind: 'coin', v: -rvn });
        if (firstContact === null) {
          if (a.kind === 'striker' && b.kind !== 'striker') firstContact = b.kind;
          else if (b.kind === 'striker' && a.kind !== 'striker') firstContact = a.kind;
        }
      }
    }

    if (opts.record && steps % every === 0) snap();
    if (!moving) break;
  }
  if (opts.record) snap();

  // anything still creeping is stopped
  for (const b of world.bodies) { b.vx = 0; b.vy = 0; }

  const strikerPocketed = pocketed.some((b) => b.kind === 'striker');
  world.bodies = world.bodies.filter((b) => !b.pocketed && b.kind !== 'striker');
  return {
    world, pocketed: pocketed.filter((b) => b.kind !== 'striker'), strikerPocketed, steps, firstContact,
    ...(opts.record ? { frames, hits, pockets: pocketEvents } : {}),
  };
}
