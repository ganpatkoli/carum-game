import type { PhysicsConfig } from './types';

export const DEFAULT_PHYSICS: PhysicsConfig = {
  boardSize: 1000,
  wallInset: 0,
  pocketRadius: 42,
  coinRadius: 16,
  strikerRadius: 22,
  coinMass: 1,
  strikerMass: 2.2,
  friction: 260,
  drag: 0.35,
  wallRestitution: 0.82,
  coinRestitution: 0.94,
  stopSpeed: 6,
  maxStrikerSpeed: 2600,
  dt: 1 / 120,
  maxSteps: 120 * 20,
};

/** Baseline geometry (distance of baseline from the board edge, and half-length). */
export const BASELINE_OFFSET = 150;
export const BASELINE_HALF_LENGTH = 300;
