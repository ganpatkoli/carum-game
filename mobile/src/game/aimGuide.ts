import { DEFAULT_PHYSICS, type Body, type Shot } from '@carrom/game-core';

export interface Guide {
  /** striker path end (first coin contact point or wall) */
  end: { x: number; y: number };
  /** where the struck coin will head, when the guide hits one */
  deflect: { x: number; y: number } | null;
  hit: boolean;
}

/** Straight-line ray cast from the striker. "Power aim" shows this long; normal aim only shows a short stub. */
export function castGuide(bodies: Body[], x0: number, y0: number, shot: Shot, c = DEFAULT_PHYSICS): Guide {
  const dx = Math.cos(shot.angle), dy = Math.sin(shot.angle);
  let tBest = Infinity;
  let hitBody: Body | null = null;
  for (const b of bodies) {
    if (b.kind === 'striker') continue;
    const fx = x0 - b.x, fy = y0 - b.y;
    const R = b.radius + c.strikerRadius;
    const B = fx * dx + fy * dy;
    const C = fx * fx + fy * fy - R * R;
    const disc = B * B - C;
    if (disc < 0) continue;
    const t = -B - Math.sqrt(disc);
    if (t > 0 && t < tBest) { tBest = t; hitBody = b; }
  }
  // walls
  const lo = c.strikerRadius, hi = c.boardSize - c.strikerRadius;
  const tw = Math.min(dx > 0 ? (hi - x0) / dx : dx < 0 ? (lo - x0) / dx : Infinity, dy > 0 ? (hi - y0) / dy : dy < 0 ? (lo - y0) / dy : Infinity);
  if (tw < tBest) { tBest = tw; hitBody = null; }
  const end = { x: x0 + dx * tBest, y: y0 + dy * tBest };
  if (!hitBody) return { end, deflect: null, hit: false };
  const nx = hitBody.x - end.x, ny = hitBody.y - end.y;
  const n = Math.hypot(nx, ny) || 1;
  return { end, deflect: { x: hitBody.x + (nx / n) * 160, y: hitBody.y + (ny / n) * 160 }, hit: true };
}
