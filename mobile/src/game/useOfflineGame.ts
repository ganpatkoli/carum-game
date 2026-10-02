import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PHYSICS, DEFAULT_RULES, applyShot, chooseShot, newGame, type Difficulty, type GameEvent, type GameState, type Shot } from '@carrom/game-core';
import { play } from '../audio/sounds';
import { useConfig } from '../store/config';
import { useShotPlayback } from './playback';

/**
 * Offline practice vs the AI. Same engine and rules as the server, but results never touch rewards,
 * rating or coins. The human is side 0 (bottom), the AI side 1.
 */
export function useOfflineGame(difficulty: Difficulty) {
  const cfg = useConfig((s) => s.config.rules);
  const rules = { ...DEFAULT_RULES, ...cfg };
  const [state, setState] = useState<GameState>(() => newGame(0));
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [thinking, setThinking] = useState(false);
  const pb = useShotPlayback();
  const seed = useRef(Math.floor(Math.random() * 1e6));
  const startedAt = useRef(Date.now());
  const busy = useRef(false);

  const play_ = useCallback((shot: Shot) => {
    if (busy.current) return;
    busy.current = true;
    const side = state.current;
    const r = applyShot(state, shot, rules, DEFAULT_PHYSICS, { record: true });
    pb.playShot(state.world, side, shot.strikerX, r.sim!, () => {
      setState(r.state); setEvents(r.events);
      for (const e of r.events) { if (e.type === 'foul') play('foul'); if (e.type === 'queen_covered') play('queen'); }
      busy.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pb.playShot]);

  useEffect(() => {
    if (state.current !== 1 || state.winner !== null || pb.playing || busy.current) return;
    setThinking(true);
    // let the "thinking" label render first: the search blocks the JS thread for a moment on hard levels
    const id = setTimeout(() => {
      const shot = chooseShot(state, difficulty, seed.current++, rules);
      setThinking(false);
      play_(shot);
    }, 650);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pb.playing]);

  const reset = () => { pb.stop(); busy.current = false; setState(newGame(0)); setEvents([]); startedAt.current = Date.now(); };
  const outcome: 'win' | 'loss' | 'draw' | null = state.winner === null ? null : state.winner === 'draw' ? 'draw' : state.winner === 0 ? 'win' : 'loss';
  return { state, events, thinking, playback: pb, play: play_, reset, outcome, startedAt: startedAt.current, animating: pb.playing || busy.current };
}
