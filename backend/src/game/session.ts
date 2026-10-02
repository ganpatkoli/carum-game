import {
  DEFAULT_PHYSICS, DEFAULT_RULES, applyShot, chooseShot, isStrikerPlacementFree, newGame, validateShot,
  type Difficulty, type GameEvent, type GameState, type RuleConfig, type Shot, type Side, type ShotResult,
} from '@carrom/game-core';

export interface PlayerSlot {
  userId: string;
  isBot: boolean;
  /** 0 or 1. In 2v2 teammates share a side and alternate shooting. */
  team: Side;
  connected: boolean;
  disconnectedAt: number | null;
}

export interface SessionOptions {
  matchId: string;
  /** 2 players, or 4 for doubles (teams are players[0,2] vs players[1,3]) */
  players: { userId: string; isBot?: boolean }[];
  rules?: RuleConfig;
  turnTimeMs?: number;
  reconnectWindowMs?: number;
  /** total match length; at expiry the higher score wins. 0/undefined = play to completion */
  durationMs?: number;
  ranked?: boolean;
  mode?: 'quick' | 'friend' | 'room' | 'bot';
  entryCoins?: number;
  botDifficulty?: Difficulty;
  now?: () => number;
}

export type SubmitResult =
  | { ok: true; events: GameEvent[]; state: GameState; sim: NonNullable<ShotResult['sim']>; shooter: string }
  | { ok: false; reason: string; suspicious: boolean };

export interface ActionLog { at: number; userId: string; type: string; detail: Record<string, unknown> }
export interface PlayerStats { shots: number; pocketed: number; queenCovers: number; fouls: number }

export type TimeoutAction =
  | { kind: 'forfeit'; side: Side }
  | { kind: 'time_up' }
  | { kind: 'turn_timeout'; userId: string; side: Side }
  | null;

const MAX_TURN_TIMEOUTS = 3;

/**
 * Authoritative game session. Clients only ever send a shot (striker x, angle, power); the server
 * simulates it, so clients cannot forge coin positions, pockets or scores.
 */
export class GameSession {
  readonly matchId: string;
  readonly rules: RuleConfig;
  readonly ranked: boolean;
  readonly mode: 'quick' | 'friend' | 'room' | 'bot';
  readonly opts: SessionOptions;
  readonly entryCoins: number;
  readonly botDifficulty: Difficulty;
  readonly startedAt: number;
  state: GameState;
  players: PlayerSlot[];
  log: ActionLog[] = [];
  suspiciousFlags: string[] = [];
  stats: Record<string, PlayerStats> = {};
  turnStartedAt: number;
  endReason: 'completed' | 'forfeit' | 'time' = 'completed';
  forfeitedBy: Side | null = null;
  /** connection metadata kept only so admins can review suspicious matches (shared devices / IPs) */
  clientMeta: Record<string, { ip?: string; deviceKey?: string }> = {};
  private now: () => number;
  private turnTimeMs: number;
  private reconnectWindowMs: number;
  private endsAt: number | null;
  private lastShotAt: Record<string, number> = {};
  private strikes: Record<string, number> = {};
  private pointer: [number, number] = [0, 0];
  private timeouts: Record<string, number> = {};
  private pauseStart: number | null = null;
  private botSeed = 1;

  constructor(o: SessionOptions) {
    if (o.players.length !== 2 && o.players.length !== 4) throw new Error('2 or 4 players required');
    this.matchId = o.matchId;
    this.rules = o.rules ?? DEFAULT_RULES;
    this.opts = o;
    this.ranked = !!o.ranked;
    this.mode = o.mode ?? 'quick';
    this.entryCoins = o.entryCoins ?? 0;
    this.botDifficulty = o.botDifficulty ?? 'medium';
    this.now = o.now ?? Date.now;
    this.turnTimeMs = o.turnTimeMs ?? 45_000;
    this.reconnectWindowMs = o.reconnectWindowMs ?? 30_000;
    this.startedAt = this.now();
    this.endsAt = o.durationMs ? this.startedAt + o.durationMs : null;
    this.state = newGame(0);
    this.players = o.players.map((p, i) => ({ userId: p.userId, isBot: !!p.isBot, team: (i % 2) as Side, connected: true, disconnectedAt: null }));
    for (const p of this.players) this.stats[p.userId] = { shots: 0, pocketed: 0, queenCovers: 0, fouls: 0 };
    this.turnStartedAt = this.now();
  }

  private teamPlayers(side: Side) { return this.players.filter((p) => p.team === side); }

  /** whoever is due to shoot right now */
  shooter(): PlayerSlot {
    const side = this.state.current;
    const team = this.teamPlayers(side);
    return team[this.pointer[side] % team.length];
  }

  setClientMeta(userId: string, meta: { ip?: string; deviceKey?: string }) { this.clientMeta[userId] = { ...this.clientMeta[userId], ...meta }; }

  sideOf(userId: string): Side | null { return this.players.find((p) => p.userId === userId)?.team ?? null; }
  hasPlayer(userId: string) { return this.players.some((p) => p.userId === userId); }
  get paused() { return this.pauseStart !== null; }

  private record(userId: string, type: string, detail: Record<string, unknown> = {}) {
    this.log.push({ at: this.now(), userId, type, detail });
  }

  private reject(userId: string, reason: string, suspicious: boolean): SubmitResult {
    this.record(userId, 'rejected_shot', { reason });
    if (suspicious) {
      this.strikes[userId] = (this.strikes[userId] ?? 0) + 1;
      this.suspiciousFlags.push(`${userId}:${reason}`);
    }
    return { ok: false, reason, suspicious };
  }

  submitShot(userId: string, shot: Shot): SubmitResult {
    if (this.state.winner !== null) return this.reject(userId, 'game_finished', false);
    if (!this.hasPlayer(userId)) return this.reject(userId, 'not_a_player', true);
    if (this.paused) return this.reject(userId, 'game_paused', false);
    const shooter = this.shooter();
    if (shooter.userId !== userId) return this.reject(userId, 'not_your_turn', true);
    const bad = validateShot(shot);
    if (bad) return this.reject(userId, bad, true);
    if (Math.abs(shot.strikerX - 500) > 300) return this.reject(userId, 'striker_off_baseline', true);

    const t = this.now();
    const last = this.lastShotAt[userId];
    // a shot cannot be submitted faster than a human can aim
    if (!shooter.isBot && last !== undefined && t - last < 300) return this.reject(userId, 'shot_too_fast', true);
    if (t - this.turnStartedAt > this.turnTimeMs + 5_000) return this.reject(userId, 'turn_expired', false);

    const side = this.state.current;
    const baseY = side === 0 ? DEFAULT_PHYSICS.boardSize - 150 : 150;
    if (!isStrikerPlacementFree(this.state.world, shot.strikerX, baseY)) return this.reject(userId, 'illegal_placement', false);

    const r = applyShot(this.state, shot, this.rules, DEFAULT_PHYSICS, { record: true });
    this.lastShotAt[userId] = t;
    this.timeouts[userId] = 0;
    const st = this.stats[userId];
    st.shots++;
    for (const e of r.events) {
      if (e.type === 'coin_pocketed' && e.by === side && e.kind === this.state.colors[side]) st.pocketed++;
      if (e.type === 'queen_covered' && e.by === side) st.queenCovers++;
      if (e.type === 'foul' && e.by === side) st.fouls++;
    }
    this.state = r.state;
    // the shooter pointer advances only when the turn actually passes to the other team
    if (r.state.current !== side) this.pointer[side]++;
    this.turnStartedAt = t;
    this.record(userId, 'shot', { shot, events: r.events.map((e) => e.type) });
    return { ok: true, events: r.events, state: r.state, sim: r.sim!, shooter: userId };
  }

  /** Shots take a few seconds to animate on every client; that time must not come out of the next player's clock. */
  grantTime(ms: number) { this.turnStartedAt += ms; }

  setConnected(userId: string, connected: boolean) {
    const p = this.players.find((x) => x.userId === userId);
    if (!p || p.isBot) return;
    p.connected = connected;
    p.disconnectedAt = connected ? null : this.now();
    this.record(userId, connected ? 'reconnected' : 'disconnected');
    const anyAway = this.players.some((x) => !x.isBot && !x.connected);
    if (anyAway && this.pauseStart === null) this.pauseStart = this.now();
    if (!anyAway && this.pauseStart !== null) {
      // time spent waiting for a reconnect must not eat anybody's turn clock
      const paused = this.now() - this.pauseStart;
      this.turnStartedAt += paused;
      if (this.endsAt) this.endsAt += paused;
      this.pauseStart = null;
    }
  }

  /** Called on a timer. */
  checkTimeouts(): TimeoutAction {
    if (this.state.winner !== null) return null;
    const t = this.now();
    for (const p of this.players) {
      if (!p.isBot && !p.connected && p.disconnectedAt !== null && t - p.disconnectedAt >= this.reconnectWindowMs) {
        this.forfeit(p.team);
        return { kind: 'forfeit', side: p.team };
      }
    }
    if (this.paused) return null;
    if (this.endsAt && t >= this.endsAt) { this.endByTime(); return { kind: 'time_up' }; }
    if (t - this.turnStartedAt >= this.turnTimeMs) {
      const s = this.shooter();
      this.timeouts[s.userId] = (this.timeouts[s.userId] ?? 0) + 1;
      if (this.timeouts[s.userId] >= MAX_TURN_TIMEOUTS) { this.forfeit(s.team); return { kind: 'forfeit', side: s.team }; }
      this.skipTurn();
      return { kind: 'turn_timeout', userId: s.userId, side: s.team };
    }
    return null;
  }

  /** Pass the turn without a shot (turn timer expired). */
  skipTurn() {
    const side = this.state.current;
    const opp: Side = side === 0 ? 1 : 0;
    this.record(this.shooter().userId, 'turn_timeout');
    this.pointer[side]++;
    this.state = { ...this.state, current: opp, turnNumber: this.state.turnNumber + 1 };
    this.turnStartedAt = this.now();
  }

  forfeit(side: Side) {
    this.forfeitedBy = side;
    this.endReason = 'forfeit';
    this.state = { ...this.state, winner: side === 0 ? 1 : 0 };
    this.record(this.teamPlayers(side)[0].userId, 'forfeit');
    return { forfeit: side };
  }

  private endByTime() {
    this.endReason = 'time';
    const [a, b] = this.state.scores;
    this.state = { ...this.state, winner: a === b ? 'draw' : a > b ? 0 : 1 };
    this.record(this.players[0].userId, 'time_up');
  }

  /** Server-side bot move: picks a shot with the same AI used offline. */
  botShot(): Shot {
    return chooseShot(this.state, this.botDifficulty, this.botSeed++, this.rules);
  }

  /** Client-safe snapshot used for reconnect restore. */
  snapshot() {
    return {
      matchId: this.matchId,
      current: this.state.current,
      shooterId: this.shooter().userId,
      scores: this.state.scores,
      pocketed: this.state.pocketed,
      queen: this.state.queen,
      winner: this.state.winner,
      ranked: this.ranked,
      paused: this.paused,
      turnEndsInMs: Math.max(0, this.turnTimeMs - (this.now() - this.turnStartedAt)),
      matchEndsInMs: this.endsAt ? Math.max(0, this.endsAt - this.now()) : null,
      coins: this.state.world.bodies.map((b) => ({ id: b.id, kind: b.kind, x: b.x, y: b.y })),
      players: this.players.map((p) => ({ userId: p.userId, team: p.team, isBot: p.isBot, connected: p.connected })),
    };
  }

  /** Full state for Redis, so a restarted server can resume live matches. */
  serialize() {
    return {
      opts: { ...this.opts, now: undefined },
      state: this.state, pointer: this.pointer, stats: this.stats, strikes: this.strikes,
      turnElapsedMs: this.now() - this.turnStartedAt,
      matchRemainingMs: this.endsAt ? this.endsAt - this.now() : null,
      players: this.players.map((p) => ({ userId: p.userId, isBot: p.isBot })),
    };
  }

  static restore(d: ReturnType<GameSession['serialize']>, now?: () => number) {
    const s = new GameSession({ ...(d.opts as SessionOptions), now });
    s.state = d.state;
    s.pointer = d.pointer;
    s.stats = d.stats;
    s.strikes = d.strikes;
    const t = (now ?? Date.now)();
    s.turnStartedAt = t - d.turnElapsedMs;
    s.endsAt = d.matchRemainingMs === null ? null : t + d.matchRemainingMs;
    // nobody is connected right after a restart; everyone gets the normal reconnect window
    for (const p of s.players) if (!p.isBot) s.setConnected(p.userId, false);
    return s;
  }

  isSuspicious() { return Object.values(this.strikes).some((n) => n >= 3); }
}
