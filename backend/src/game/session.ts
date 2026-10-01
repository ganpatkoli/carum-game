import {
  DEFAULT_PHYSICS, DEFAULT_RULES, applyShot, newGame, validateShot,
  type GameEvent, type GameState, type RuleConfig, type Shot, type Side,
} from '@carrom/game-core';

export interface PlayerSlot {
  userId: string;
  connected: boolean;
  disconnectedAt: number | null;
}

export interface SessionOptions {
  matchId: string;
  players: [string, string];
  rules?: RuleConfig;
  turnTimeMs?: number;
  reconnectWindowMs?: number;
  now?: () => number;
}

export type SubmitResult =
  | { ok: true; events: GameEvent[]; state: GameState }
  | { ok: false; reason: string; suspicious: boolean };

export interface ActionLog { at: number; userId: string; type: string; detail: Record<string, unknown> }

/**
 * Authoritative game session. The client only ever sends a shot (striker x, angle,
 * power); the server runs the physics itself, so clients cannot forge coin
 * positions, pockets or scores.
 */
export class GameSession {
  readonly matchId: string;
  readonly rules: RuleConfig;
  state: GameState;
  players: [PlayerSlot, PlayerSlot];
  log: ActionLog[] = [];
  suspiciousFlags: string[] = [];
  turnStartedAt: number;
  private now: () => number;
  private turnTimeMs: number;
  private reconnectWindowMs: number;
  private lastShotAt: Record<string, number> = {};
  private strikes: Record<string, number> = {};
  forfeitedBy: Side | null = null;

  constructor(o: SessionOptions) {
    this.matchId = o.matchId;
    this.rules = o.rules ?? DEFAULT_RULES;
    this.now = o.now ?? Date.now;
    this.turnTimeMs = o.turnTimeMs ?? 45_000;
    this.reconnectWindowMs = o.reconnectWindowMs ?? 30_000;
    this.state = newGame(0);
    this.players = [o.players[0], o.players[1]].map((userId) => ({ userId, connected: true, disconnectedAt: null })) as [PlayerSlot, PlayerSlot];
    this.turnStartedAt = this.now();
  }

  sideOf(userId: string): Side | null {
    return this.players[0].userId === userId ? 0 : this.players[1].userId === userId ? 1 : null;
  }

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
    const side = this.sideOf(userId);
    if (side === null) return this.reject(userId, 'not_a_player', true);
    if (side !== this.state.current) return this.reject(userId, 'not_your_turn', true);
    const bad = validateShot(shot);
    if (bad) return this.reject(userId, bad, true);
    if (Math.abs(shot.strikerX - 500) > 300) return this.reject(userId, 'striker_off_baseline', true);

    const t = this.now();
    const last = this.lastShotAt[userId];
    // a shot cannot be submitted faster than a human can aim
    if (last !== undefined && t - last < 300) return this.reject(userId, 'shot_too_fast', true);
    if (t - this.turnStartedAt > this.turnTimeMs + 5_000) return this.reject(userId, 'turn_expired', false);

    const r = applyShot(this.state, shot, this.rules, DEFAULT_PHYSICS);
    this.lastShotAt[userId] = t;
    this.state = r.state;
    this.turnStartedAt = t;
    this.record(userId, 'shot', { shot, events: r.events.map((e) => e.type) });
    return { ok: true, events: r.events, state: r.state };
  }

  setConnected(userId: string, connected: boolean) {
    const side = this.sideOf(userId);
    if (side === null) return;
    const p = this.players[side];
    p.connected = connected;
    p.disconnectedAt = connected ? null : this.now();
    this.record(userId, connected ? 'reconnected' : 'disconnected');
  }

  /** Called on a timer. Returns a forfeit if someone stayed away past the reconnect window. */
  checkTimeouts(): { forfeit: Side } | null {
    if (this.state.winner !== null) return null;
    for (const side of [0, 1] as Side[]) {
      const p = this.players[side];
      if (!p.connected && p.disconnectedAt !== null && this.now() - p.disconnectedAt >= this.reconnectWindowMs) {
        return this.forfeit(side);
      }
    }
    return null;
  }

  forfeit(side: Side) {
    this.forfeitedBy = side;
    this.state = { ...this.state, winner: side === 0 ? 1 : 0 };
    this.record(this.players[side].userId, 'forfeit');
    return { forfeit: side };
  }

  /** Client-safe snapshot used for reconnect restore. */
  snapshot() {
    return {
      matchId: this.matchId,
      current: this.state.current,
      scores: this.state.scores,
      queen: this.state.queen,
      winner: this.state.winner,
      coins: this.state.world.bodies.map((b) => ({ id: b.id, kind: b.kind, x: b.x, y: b.y })),
      players: this.players.map((p) => ({ userId: p.userId, connected: p.connected })),
    };
  }

  isSuspicious() { return Object.values(this.strikes).some((n) => n >= 3); }
}
