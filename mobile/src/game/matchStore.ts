import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import { DEFAULT_PHYSICS, type Body, type GameEvent, type Shot } from '@carrom/game-core';
import { play } from '../audio/sounds';
import { translate, useLang } from '../i18n';
import { emitAck, getSocket } from '../net/socket';
import { useAuth } from '../store/auth';
import { useConfig } from '../store/config';
import type { MatchResult } from './hud';
import type { SimData } from './playback';

export interface PlayerProfile { username: string; avatarId: string; level: number; imageUrl?: string | null }
export interface Slot { userId: string; team: 0 | 1; isBot: boolean; connected: boolean }
export interface Snapshot {
  matchId: string; current: 0 | 1; shooterId: string; scores: [number, number]; pocketed: [number, number]; queen: { status: string; by: number | null };
  winner: 0 | 1 | 'draw' | null; ranked: boolean; paused: boolean; turnEndsInMs: number; matchEndsInMs: number | null;
  coins: { id: number; kind: Body['kind']; x: number; y: number }[]; players: Slot[];
}
export interface ShotMsg { by: string; shot: Shot; events: GameEvent[]; sim: SimData; snapshot: Snapshot; animMs: number }

interface MatchState {
  phase: 'idle' | 'queue' | 'playing' | 'finished';
  connected: boolean;
  queueEntry: number; queuedAt: number; queueError: string | null;
  matchId: string | null; mode: string; entryCoins: number; ranked: boolean;
  players: Slot[]; profiles: Record<string, PlayerProfile>;
  bodies: Body[]; scores: [number, number]; pocketed: [number, number]; queen: Snapshot['queen'];
  shooterId: string | null; current: 0 | 1;
  turnEndsAt: number | null; matchEndsAt: number | null; paused: boolean; away: string[];
  countdownMs: number; countdownKey: number;
  pending: ShotMsg[];
  banner: { text: string; kind: 'bad' | 'good' | 'info'; id: number } | null;
  reactions: { id: number; from: string; text: string }[];
  finished: { winner: 0 | 1 | 'draw'; scores: [number, number]; reason: string; summaries: any[] } | null;
  result: MatchResult | null;
  // actions
  joinQueue: (entry: number) => Promise<boolean>;
  leaveQueue: () => void;
  sendShot: (shot: Shot) => Promise<string | null>;
  applyShotDone: (msg: ShotMsg) => void;
  resign: () => void;
  react: (kind: 'emote' | 'quick_chat', id: string) => void;
  reset: () => void;
}

const toBodies = (coins: Snapshot['coins']): Body[] => coins.map((c) => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, vx: 0, vy: 0, radius: DEFAULT_PHYSICS.coinRadius, mass: DEFAULT_PHYSICS.coinMass, pocketed: false }));
let bannerId = 1, reactionId = 1;

const initial = {
  phase: 'idle' as const, connected: true, queueEntry: 0, queuedAt: 0, queueError: null, matchId: null, mode: 'quick', entryCoins: 0, ranked: false,
  players: [], profiles: {}, bodies: [], scores: [0, 0] as [number, number], pocketed: [0, 0] as [number, number], queen: { status: 'board', by: null },
  shooterId: null, current: 0 as 0 | 1, turnEndsAt: null, matchEndsAt: null, paused: false, away: [] as string[],
  countdownMs: 0, countdownKey: 0, pending: [], banner: null, reactions: [], finished: null, result: null,
};

export const useMatch = create<MatchState>((set, get) => ({
  ...initial,

  async joinQueue(entry) {
    set({ phase: 'queue', queueEntry: entry, queuedAt: Date.now(), queueError: null });
    try {
      const r = await emitAck<{ ok: boolean; reason?: string }>('queue_join', { entry, latencyMs: 60 });
      if (!r.ok) { set({ phase: 'idle', queueError: r.reason ?? 'invalid' }); return false; }
      return true;
    } catch { set({ phase: 'idle', queueError: 'network' }); return false; }
  },
  leaveQueue() { getSocket().emit('queue_leave'); if (get().phase === 'queue') set({ phase: 'idle' }); },

  async sendShot(shot) {
    try { const r = await emitAck<{ ok: boolean; reason?: string }>('shot', shot); return r.ok ? null : r.reason ?? 'rejected'; }
    catch { return 'network'; }
  },

  /** Called by the screen when a queued shot has finished animating: snap to the authoritative state. */
  applyShotDone(msg) {
    const s = msg.snapshot;
    set((st) => ({
      pending: st.pending.filter((m) => m !== msg),
      bodies: toBodies(s.coins), scores: s.scores, pocketed: s.pocketed, queen: s.queen, shooterId: s.shooterId, current: s.current, players: s.players,
    }));
  },

  resign() { getSocket().emit('forfeit'); },
  react(kind, id) { getSocket().emit(kind, id); },
  reset() { set({ ...initial, connected: get().connected }); },
}));

const tr = (key: Parameters<typeof translate>[1]) => translate(useLang.getState().lang, key);
const turnMs = () => useConfig.getState().config.game.turnTimeSec * 1000;

const bannerFor = (events: GameEvent[]): { text: string; kind: 'bad' | 'good' | 'info' } | null => {
  if (events.some((e) => e.type === 'foul')) return { text: tr('game.foul'), kind: 'bad' };
  if (events.some((e) => e.type === 'queen_covered')) return { text: tr('game.queen'), kind: 'good' };
  if (events.some((e) => e.type === 'queen_returned')) return { text: tr('game.queenReturned'), kind: 'info' };
  if (events.some((e) => e.type === 'queen_pocketed')) return { text: tr('game.queenCover'), kind: 'info' };
  return null;
};

function setBanner(text: string, kind: 'bad' | 'good' | 'info') {
  const id = bannerId++;
  useMatch.setState({ banner: { text, kind, id } });
  setTimeout(() => { if (useMatch.getState().banner?.id === id) useMatch.setState({ banner: null }); }, 1700);
}

let attached: Socket | null = null;

/** Wire server events into the store. Safe to call repeatedly; (re)binds when the socket instance changes. */
export function attachMatchListeners() {
  const s = getSocket();
  if (attached === s) return;
  attached = s;
  const st = useMatch;
  const me = () => useAuth.getState().me?.id ?? '';

  const load = (snapshot: Snapshot, profiles: Record<string, PlayerProfile>, extra: Partial<ReturnType<typeof st.getState>> = {}) => {
    const away = snapshot.players.filter((p) => !p.isBot && !p.connected).map((p) => p.userId);
    st.setState({
      phase: 'playing', matchId: snapshot.matchId, ranked: snapshot.ranked, players: snapshot.players, profiles, bodies: toBodies(snapshot.coins), scores: snapshot.scores, pocketed: snapshot.pocketed,
      queen: snapshot.queen, shooterId: snapshot.shooterId, current: snapshot.current, paused: snapshot.paused, away, finished: null, result: null, queueError: null,
      turnEndsAt: Date.now() + snapshot.turnEndsInMs, matchEndsAt: snapshot.matchEndsInMs === null ? null : Date.now() + snapshot.matchEndsInMs, ...extra,
    });
  };

  s.on('connect', () => { st.setState({ connected: true }); if (st.getState().phase === 'playing') s.emit('get_state'); });
  s.on('disconnect', () => st.setState({ connected: false }));

  s.on('game_started', (d: { snapshot: Snapshot; profiles: Record<string, PlayerProfile>; countdownMs: number; entryCoins: number; mode: string }) => {
    load(d.snapshot, d.profiles, { pending: [], entryCoins: d.entryCoins, mode: d.mode, countdownMs: d.countdownMs, countdownKey: Date.now(), turnEndsAt: Date.now() + d.countdownMs + d.snapshot.turnEndsInMs });
  });
  // reconnect / app resumed: the server's word is final
  s.on('game_state', (d: { snapshot: Snapshot; profiles: Record<string, PlayerProfile> } | null) => {
    if (!d) { if (st.getState().phase === 'playing') st.setState({ phase: st.getState().finished ? 'finished' : 'idle' }); return; }
    load(d.snapshot, d.profiles, { pending: [], countdownMs: 0 });
  });

  s.on('shot_sync', (m: ShotMsg) => {
    st.setState((x) => ({ pending: [...x.pending, m], turnEndsAt: Date.now() + m.animMs + turnMs() }));
    const b = bannerFor(m.events);
    if (b) setTimeout(() => setBanner(b.text, b.kind), Math.min(1200, m.animMs / 2));
  });
  s.on('turn_started', (d: { side: 0 | 1; shooterId: string; delayMs: number }) => st.setState({ shooterId: d.shooterId, current: d.side, turnEndsAt: Date.now() + d.delayMs + turnMs() }));
  s.on('turn_changed', (d: { reason?: string }) => { if (d.reason === 'timeout') setBanner(tr('game.turnSkipped'), 'info'); });

  s.on('player_disconnected', (d: { userId: string }) => st.setState((x) => ({ away: [...new Set([...x.away, d.userId])] })));
  s.on('game_paused', () => st.setState({ paused: true }));
  s.on('player_reconnected', (d: { userId: string }) => st.setState((x) => ({ away: x.away.filter((a) => a !== d.userId) })));
  s.on('game_resumed', (d: { turnEndsInMs: number }) => st.setState({ paused: false, away: [], turnEndsAt: Date.now() + d.turnEndsInMs }));

  s.on('emote', (d: { from: string; id: string }) => pushReaction(d.from, `emote.${d.id}`));
  s.on('quick_chat', (d: { from: string; id: string }) => pushReaction(d.from, `chat.${d.id}`));
  s.on('error_message', (d: { code: string }) => st.setState({ queueError: d.code, phase: st.getState().phase === 'queue' ? 'idle' : st.getState().phase }));

  s.on('game_finished', (d: { winner: 0 | 1 | 'draw'; scores: [number, number]; reason: string; summaries: any[] }) => {
    st.setState({ finished: d, phase: 'finished' });
    // refresh profile/wallet so the result screen can show the new XP bar
    void useAuth.getState().refreshMe().then((m) => {
      const mine = d.summaries.find((x) => x.userId === me());
      const myTeam = st.getState().players.find((p) => p.userId === me())?.team ?? 0;
      const outcome: 'win' | 'loss' | 'draw' = mine?.result ?? (d.winner === 'draw' ? 'draw' : d.winner === myTeam ? 'win' : 'loss');
      const level = m?.profile.level ?? 1;
      st.setState({
        result: {
          outcome, scores: [d.scores[myTeam], d.scores[myTeam === 0 ? 1 : 0]], ranked: st.getState().ranked,
          ratingChange: mine?.ratingChange, xpGain: mine?.xpGain, levelUp: mine?.levelUp ?? null, coins: mine?.coins, achievements: mine?.achievements ?? [],
          xp: m ? { level, into: m.profile.xpIntoLevel, need: m.profile.xpForNext } : undefined,
          note: d.reason === 'forfeit' ? (outcome === 'win' ? tr('game.opponentLeft') : undefined) : d.reason === 'time' ? tr('game.timeUp') : undefined,
        },
      });
    });
  });
}

function pushReaction(from: string, key: string) {
  const id = reactionId++;
  play('notification', 0.4);
  useMatch.setState((x) => ({ reactions: [...x.reactions.slice(-3), { id, from, text: key }] }));
  setTimeout(() => useMatch.setState((x) => ({ reactions: x.reactions.filter((r) => r.id !== id) })), 2600);
}
