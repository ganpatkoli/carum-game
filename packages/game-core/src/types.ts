export type CoinKind = 'black' | 'white' | 'queen' | 'striker';

export interface Vec2 { x: number; y: number }

export interface Body {
  id: number;
  kind: CoinKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  /** true once the body has fallen into a pocket */
  pocketed: boolean;
}

export interface PhysicsConfig {
  boardSize: number;
  /** playing-surface inset from the frame, walls sit here */
  wallInset: number;
  pocketRadius: number;
  coinRadius: number;
  strikerRadius: number;
  coinMass: number;
  strikerMass: number;
  /** constant deceleration (units/s^2), board surface friction */
  friction: number;
  /** proportional velocity loss per second (air/felt drag) */
  drag: number;
  wallRestitution: number;
  coinRestitution: number;
  stopSpeed: number;
  maxStrikerSpeed: number;
  dt: number;
  maxSteps: number;
}

export interface Shot {
  /** striker x along the baseline, in board units */
  strikerX: number;
  /** aim angle, radians */
  angle: number;
  /** 0..1 */
  power: number;
}

export interface World {
  bodies: Body[];
  step: number;
}

/** One sampled animation frame: flat [id, x, y, id, x, y, ...] for every live body. */
export interface Frame { step: number; b: number[] }
export interface HitEvent { step: number; kind: 'coin' | 'wall'; v: number }
export interface PocketEvent { step: number; id: number; kind: CoinKind }

export interface ShotOutcome {
  frames?: Frame[];
  hits?: HitEvent[];
  pockets?: PocketEvent[];
  world: World;
  pocketed: Body[];
  strikerPocketed: boolean;
  steps: number;
  /** ids of coins touched by the striker first, in order */
  firstContact: CoinKind | null;
}
