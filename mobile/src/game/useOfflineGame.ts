import { useCallback, useEffect, useRef, useState } from 'react';
import { applyShot, chooseShot, newGame, simulateShot, DEFAULT_PHYSICS, type Difficulty, type GameEvent, type GameState, type Shot, type World } from '@carrom/game-core';

/** Offline vs-AI game. Uses the exact same engine as the server, but never touches rewards, rating or wallet. */
export function useOfflineGame(difficulty: Difficulty) {
  const [state, setState] = useState<GameState>(() => newGame(0));
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const seed = useRef(1);

  const play = useCallback((shot: Shot) => {
    setState((s) => {
      const r = applyShot(s, shot);
      setEvents(r.events);
      return r.state;
    });
  }, []);

  /** Aim preview: simulate with the real physics but only the striker's first leg is shown to the player. */
  const preview = useCallback((shot: Shot): World => simulateShot(state.world, 0, shot, DEFAULT_PHYSICS).world, [state.world]);

  useEffect(() => {
    if (state.current !== 1 || state.winner !== null) return;
    setBusy(true);
    const id = setTimeout(() => {
      // heavy search: keep it off the touch path
      play(chooseShot(state, difficulty, seed.current++));
      setBusy(false);
    }, 600);
    return () => clearTimeout(id);
  }, [state, difficulty, play]);

  const reset = () => { setState(newGame(0)); setEvents([]); };
  return { state, events, busy, play, preview, reset };
}
