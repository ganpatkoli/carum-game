import { DEFAULT_PHYSICS } from './config';
import type { Body, PhysicsConfig, World } from './types';

/** Standard layout: queen centre, inner ring of 6 alternating, outer ring of 12. */
export function initialWorld(c: PhysicsConfig = DEFAULT_PHYSICS): World {
  const cx = c.boardSize / 2, cy = c.boardSize / 2;
  const r = c.coinRadius;
  const bodies: Body[] = [];
  let id = 1;
  const mk = (kind: 'black' | 'white' | 'queen', x: number, y: number) =>
    bodies.push({ id: id++, kind, x, y, vx: 0, vy: 0, radius: r, mass: c.coinMass, pocketed: false });

  mk('queen', cx, cy);
  const gap = 0.2; // tiny gap so the layout starts without overlap
  const ring1 = 2 * r + gap;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    mk(i % 2 === 0 ? 'black' : 'white', cx + Math.cos(a) * ring1, cy + Math.sin(a) * ring1);
  }
  // outer ring: 12 coins; 6 sit on the inner-ring axes (distance 2*ring1), 6 between
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI / 6) * i - Math.PI / 2;
    const dist = i % 2 === 0 ? ring1 * 2 : ring1 * Math.sqrt(3);
    mk(i % 2 === 0 ? 'white' : 'black', cx + Math.cos(a) * dist, cy + Math.sin(a) * dist);
  }
  return { bodies, step: 0 };
}
