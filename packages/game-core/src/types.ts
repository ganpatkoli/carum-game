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

export interface ShotOutcome {
  world: World;
  pocketed: Body[];
  strikerPocketed: boolean;
  steps: number;
  /** ids of coins touched by the striker first, in order */
  firstContact: CoinKind | null;
}
