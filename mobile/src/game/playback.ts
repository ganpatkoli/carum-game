import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PHYSICS, type Body, type Frame, type HitEvent, type PocketEvent, type World } from '@carrom/game-core';
import { impactVolume, play } from '../audio/sounds';

export interface Falling { id: number; kind: Body['kind']; x: number; y: number; r: number; startedAt: number }
export interface SimData { frames: Frame[]; hits: HitEvent[]; pockets: PocketEvent[] }

const DT = DEFAULT_PHYSICS.dt;
const FALL_MS = 260;

/**
 * Plays a recorded shot (frames sampled by the physics engine) smoothly at real speed, firing collision /
 * pocket sounds at the right moments. The final resting positions always come from the authoritative state,
 * so a slightly different animation can never desync the game.
 */
export function useShotPlayback() {
  const [bodies, setBodies] = useState<Body[] | null>(null);
  const [falling, setFalling] = useState<Falling[]>([]);
  const raf = useRef<number | null>(null);
  const token = useRef(0);

  const stop = useCallback(() => {
    token.current++;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    setBodies(null); setFalling([]);
  }, []);
  useEffect(() => stop, [stop]);

  const playShot = useCallback((start: World, strikerSide: 0 | 1, strikerX: number, sim: SimData, onDone: () => void) => {
    const my = ++token.current;
    const meta = new Map<number, Body>();
    for (const b of start.bodies) meta.set(b.id, b);
    meta.set(0, { id: 0, kind: 'striker', x: strikerX, y: strikerSide === 0 ? DEFAULT_PHYSICS.boardSize - 150 : 150, vx: 0, vy: 0, radius: DEFAULT_PHYSICS.strikerRadius, mass: 1, pocketed: false });

    const frames = sim.frames;
    if (frames.length < 2) { onDone(); return; }
    const times = frames.map((f) => f.step * DT);
    const total = times[times.length - 1];
    const last = new Map<number, { x: number; y: number }>();
    let hitI = 0, pocketI = 0, k = 0;
    const falls: Falling[] = [];
    const t0 = performance.now();
    play('shot', 0.9);

    const tick = (now: number) => {
      if (token.current !== my) return;
      const t = (now - t0) / 1000;
      while (k < frames.length - 2 && times[k + 1] <= t) k++;
      const a = frames[k], b = frames[Math.min(k + 1, frames.length - 1)];
      const span = Math.max(1e-6, times[Math.min(k + 1, frames.length - 1)] - times[k]);
      const u = Math.max(0, Math.min(1, (t - times[k]) / span));
      const posB = new Map<number, [number, number]>();
      for (let i = 0; i < b.b.length; i += 3) posB.set(b.b[i], [b.b[i + 1], b.b[i + 2]]);
      const out: Body[] = [];
      for (let i = 0; i < a.b.length; i += 3) {
        const id = a.b[i], ax = a.b[i + 1], ay = a.b[i + 2];
        const nb = posB.get(id);
        const x = nb ? ax + (nb[0] - ax) * u : ax, y = nb ? ay + (nb[1] - ay) * u : ay;
        last.set(id, { x, y });
        const m = meta.get(id);
        if (m) out.push({ ...m, x, y });
      }
      while (hitI < sim.hits.length && sim.hits[hitI].step * DT <= t) {
        const h = sim.hits[hitI++];
        play(h.kind === 'coin' ? 'hit' : 'wall', impactVolume(h.v));
      }
      while (pocketI < sim.pockets.length && sim.pockets[pocketI].step * DT <= t) {
        const p = sim.pockets[pocketI++];
        const m = meta.get(p.id), pos = last.get(p.id);
        if (m && pos) falls.push({ id: p.id, kind: m.kind, x: pos.x, y: pos.y, r: m.radius, startedAt: now });
        play(p.kind === 'queen' ? 'queen' : 'pocket');
      }
      setBodies(out);
      setFalling(falls.filter((f) => now - f.startedAt < FALL_MS).map((f) => ({ ...f })));
      if (t >= total) { raf.current = null; setBodies(null); setFalling([]); onDone(); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  return { bodies, falling, playShot, stop, playing: bodies !== null };
}

export const fallProgress = (f: Falling) => Math.min(1, (performance.now() - f.startedAt) / FALL_MS);
