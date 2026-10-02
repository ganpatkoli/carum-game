import { initialWorld } from './board';
import { DEFAULT_PHYSICS } from './config';
import { isStrikerPlacementFree, simulateShot, validateShot, type SimOptions } from './physics';
import type { Body, Frame, HitEvent, PhysicsConfig, PocketEvent, Shot, World } from './types';

export interface RuleConfig {
  queenEnabled: boolean;
  queenCoverRequired: boolean;
  queenPoints: number;
  coinPoints: number;
  /** own coins returned to the board for a foul */
  foulReturnCount: number;
  strikerPocketedIsFoul: boolean;
  /** foul if the striker's first contact is an opponent coin */
  wrongFirstContactIsFoul: boolean;
  /** consecutive fouls by one player that forfeit extra penalty */
  maxConsecutiveFouls: number;
  /** extra opponent points when maxConsecutiveFouls is hit */
  multiFoulPenaltyPoints: number;
  /** award remaining opponent coins as bonus points to winner */
  boardPointsToWinner: boolean;
}

export const DEFAULT_RULES: RuleConfig = {
  queenEnabled: true,
  queenCoverRequired: true,
  queenPoints: 3,
  coinPoints: 1,
  foulReturnCount: 1,
  strikerPocketedIsFoul: true,
  wrongFirstContactIsFoul: false,
  maxConsecutiveFouls: 3,
  multiFoulPenaltyPoints: 1,
  boardPointsToWinner: true,
};

export type Side = 0 | 1;
export type QueenStatus = 'board' | 'pending' | 'covered';

export interface GameState {
  world: World;
  current: Side;
  /** coin colour each side owns: side 0 = white, side 1 = black */
  colors: ['white', 'black'];
  /** own coins each side has pocketed */
  pocketed: [number, number];
  queen: { status: QueenStatus; by: Side | null };
  scores: [number, number];
  fouls: [number, number];
  consecutiveFouls: [number, number];
  winner: Side | 'draw' | null;
  turnNumber: number;
}

export type GameEvent =
  | { type: 'coin_pocketed'; kind: Body['kind']; id: number; by: Side }
  | { type: 'queen_pocketed'; by: Side }
  | { type: 'queen_covered'; by: Side }
  | { type: 'queen_returned' }
  | { type: 'foul'; by: Side; reason: string }
  | { type: 'coin_returned'; kind: Body['kind'] }
  | { type: 'turn_changed'; to: Side }
  | { type: 'score_updated'; scores: [number, number] }
  | { type: 'game_finished'; winner: Side | 'draw' };

export function newGame(startSide: Side = 0, c: PhysicsConfig = DEFAULT_PHYSICS): GameState {
  return {
    world: initialWorld(c),
    current: startSide,
    colors: ['white', 'black'],
    pocketed: [0, 0],
    queen: { status: 'board', by: null },
    scores: [0, 0],
    fouls: [0, 0],
    consecutiveFouls: [0, 0],
    winner: null,
    turnNumber: 1,
  };
}

const ownColor = (s: GameState, side: Side) => s.colors[side];
const other = (s: Side): Side => (s === 0 ? 1 : 0);

let nextReturnId = 1000;

/** Put a coin back near the centre, spiralling outward until the spot is free. */
function returnCoin(world: World, kind: 'black' | 'white' | 'queen', c: PhysicsConfig) {
  const cx = c.boardSize / 2, cy = c.boardSize / 2;
  const stepR = c.coinRadius * 2.05;
  for (let ring = 0; ring < 8; ring++) {
    const n = ring === 0 ? 1 : ring * 6;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const x = cx + Math.cos(a) * ring * stepR, y = cy + Math.sin(a) * ring * stepR;
      if (isStrikerPlacementFree(world, x, y, { ...c, strikerRadius: c.coinRadius })) {
        world.bodies.push({ id: nextReturnId++, kind, x, y, vx: 0, vy: 0, radius: c.coinRadius, mass: c.coinMass, pocketed: false });
        return;
      }
    }
  }
}

export interface ShotResult {
  state: GameState;
  events: GameEvent[];
  /** present when applyShot was called with record: true */
  sim?: { frames: Frame[]; hits: HitEvent[]; pockets: PocketEvent[] };
}

/** Pure: does not mutate the input state. */
export function applyShot(
  prev: GameState,
  shot: Shot,
  rules: RuleConfig = DEFAULT_RULES,
  c: PhysicsConfig = DEFAULT_PHYSICS,
  opts: SimOptions = {},
): ShotResult {
  if (prev.winner !== null) throw new Error('game already finished');
  const err = validateShot(shot);
  if (err) throw new Error(err);

  const side = prev.current;
  const opp = other(side);
  const mine = ownColor(prev, side);
  const theirs = ownColor(prev, opp);
  const out = simulateShot(prev.world, side, shot, c, opts);
  const sim = opts.record ? { frames: out.frames ?? [], hits: out.hits ?? [], pockets: out.pockets ?? [] } : undefined;
  const events: GameEvent[] = [];

  const s: GameState = {
    ...prev,
    world: out.world,
    pocketed: [...prev.pocketed] as [number, number],
    queen: { ...prev.queen },
    scores: [...prev.scores] as [number, number],
    fouls: [...prev.fouls] as [number, number],
    consecutiveFouls: [...prev.consecutiveFouls] as [number, number],
  };

  const myCoins = out.pocketed.filter((b) => b.kind === mine);
  const theirCoins = out.pocketed.filter((b) => b.kind === theirs);
  const queenPocketed = out.pocketed.some((b) => b.kind === 'queen') && rules.queenEnabled;

  let foulReason: string | null = null;
  if (out.strikerPocketed && rules.strikerPocketedIsFoul) foulReason = 'striker_pocketed';
  else if (rules.wrongFirstContactIsFoul && out.firstContact === theirs) foulReason = 'wrong_first_contact';

  // an uncovered queen from the previous turn must be resolved by this shot
  const hadPending = prev.queen.status === 'pending' && prev.queen.by === side;

  for (const b of out.pocketed) {
    events.push({ type: 'coin_pocketed', kind: b.kind, id: b.id, by: side });
  }

  if (foulReason) {
    events.push({ type: 'foul', by: side, reason: foulReason });
    s.fouls[side]++;
    s.consecutiveFouls[side]++;
    // coins pocketed on a foul shot go back on the board
    for (const b of out.pocketed) {
      if (b.kind === 'striker') continue;
      returnCoin(s.world, b.kind, c);
      events.push({ type: 'coin_returned', kind: b.kind });
    }
    // penalty: return previously pocketed own coins
    let toReturn = Math.min(rules.foulReturnCount, s.pocketed[side]);
    while (toReturn-- > 0) {
      s.pocketed[side]--;
      s.scores[side] -= rules.coinPoints;
      returnCoin(s.world, mine, c);
      events.push({ type: 'coin_returned', kind: mine });
    }
    if (rules.maxConsecutiveFouls > 0 && s.consecutiveFouls[side] >= rules.maxConsecutiveFouls) {
      s.scores[opp] += rules.multiFoulPenaltyPoints;
      s.consecutiveFouls[side] = 0;
    }
    if (hadPending || (queenPocketed && s.queen.by === side)) {
      s.queen = { status: 'board', by: null };
      events.push({ type: 'queen_returned' });
    }
    if (hadPending) { /* queen already on its way back */ }
    s.current = opp;
    s.turnNumber++;
    events.push({ type: 'turn_changed', to: opp });
    s.scores[side] = Math.max(0, s.scores[side]);
    events.push({ type: 'score_updated', scores: s.scores });
    return finish(s, events, rules, side, c, sim);
  }

  s.consecutiveFouls[side] = 0;

  // score own coins
  s.pocketed[side] += myCoins.length;
  s.scores[side] += myCoins.length * rules.coinPoints;

  // opponent coins pocketed are credited to the opponent
  s.pocketed[opp] += theirCoins.length;
  s.scores[opp] += theirCoins.length * rules.coinPoints;

  let continues = myCoins.length > 0;

  // queen logic
  if (queenPocketed) {
    events.push({ type: 'queen_pocketed', by: side });
    if (!rules.queenCoverRequired || myCoins.length > 0) {
      s.queen = { status: 'covered', by: side };
      s.scores[side] += rules.queenPoints;
      events.push({ type: 'queen_covered', by: side });
    } else {
      s.queen = { status: 'pending', by: side };
    }
    continues = true;
  } else if (hadPending) {
    if (myCoins.length > 0) {
      s.queen = { status: 'covered', by: side };
      s.scores[side] += rules.queenPoints;
      events.push({ type: 'queen_covered', by: side });
    } else {
      returnCoin(s.world, 'queen', c);
      s.queen = { status: 'board', by: null };
      events.push({ type: 'queen_returned' });
    }
  }

  if (!continues) {
    s.current = opp;
    s.turnNumber++;
    events.push({ type: 'turn_changed', to: opp });
  }
  events.push({ type: 'score_updated', scores: s.scores });
  return finish(s, events, rules, side, c, sim);
}

function finish(s: GameState, events: GameEvent[], rules: RuleConfig, last: Side, _c: PhysicsConfig, sim?: ShotResult['sim']): ShotResult {
  const total = 9;
  const queenSettled = !rules.queenEnabled || s.queen.status === 'covered';
  for (const side of [0, 1] as Side[]) {
    if (s.pocketed[side] >= total && queenSettled) {
      s.winner = side;
      if (rules.boardPointsToWinner) {
        s.scores[side] += total - s.pocketed[other(side)];
        events.push({ type: 'score_updated', scores: s.scores });
      }
      break;
    }
  }
  // all coins gone but queen never covered: finishing player must return the queen and continue
  if (s.winner === null && s.pocketed[0] + s.pocketed[1] >= total * 2) {
    s.winner = s.scores[0] === s.scores[1] ? 'draw' : s.scores[0] > s.scores[1] ? 0 : 1;
  }
  if (s.winner !== null) events.push({ type: 'game_finished', winner: s.winner });
  void last;
  return { state: s, events, sim };
}
