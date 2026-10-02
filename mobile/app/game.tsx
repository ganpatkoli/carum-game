import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { type Difficulty } from '@carrom/game-core';
import { play } from '../src/audio/sounds';
import { maybeShowInterstitial } from '../src/ads/ads';
import { useAuth } from '../src/store/auth';
import { useConfig } from '../src/store/config';
import { useCosmetics } from '../src/game/cosmetics';
import { GameLayout } from '../src/game/GameLayout';
import { Banner, Countdown, GameMenu, ResultOverlay, RoundButton, type MatchResult } from '../src/game/hud';
import { useOfflineGame } from '../src/game/useOfflineGame';
import { useT, type Key } from '../src/i18n';
import { recordOfflineMatch, syncOfflineMatches } from '../src/offline/queue';
import { Button, Pill } from '../src/ui/kit';

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const AI_NAMES: Record<Difficulty, string> = { easy: 'Ali', medium: 'Meera', hard: 'Vikram', expert: 'Grandmaster' };

/** Offline practice vs the AI (works with no internet). */
export default function PracticeGame() {
  const t = useT();
  const params = useLocalSearchParams<{ difficulty?: string }>();
  const difficulty: Difficulty = DIFFS.includes(params.difficulty as Difficulty) ? (params.difficulty as Difficulty) : 'easy';
  const g = useOfflineGame(difficulty);
  const me = useAuth((s) => s.me);
  const ads = useConfig((s) => s.config.ads);
  const cosm = useCosmetics();
  const [powerAim, setPowerAim] = useState(false);
  const [menu, setMenu] = useState(false);
  const [counting, setCounting] = useState(true);
  const [banner, setBanner] = useState<{ text: string; kind: 'bad' | 'good' | 'info' } | null>(null);
  const saved = useRef(false);

  useEffect(() => {
    const e = g.events;
    if (e.some((x) => x.type === 'foul')) setBanner({ text: t('game.foul'), kind: 'bad' });
    else if (e.some((x) => x.type === 'queen_covered')) setBanner({ text: t('game.queen'), kind: 'good' });
    else if (e.some((x) => x.type === 'queen_returned')) setBanner({ text: t('game.queenReturned'), kind: 'info' });
    else if (e.some((x) => x.type === 'queen_pocketed')) setBanner({ text: t('game.queenCover'), kind: 'info' });
    else return;
    const id = setTimeout(() => setBanner(null), 1600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.events]);

  // store the result so it can be synced when the player is online (stats only; no rewards)
  useEffect(() => {
    if (!g.outcome || saved.current) return;
    saved.current = true;
    void recordOfflineMatch({ difficulty, result: g.outcome, scores: [g.state.scores[0], g.state.scores[1]], durationSec: Math.round((Date.now() - g.startedAt) / 1000), startedAt: g.startedAt })
      .then(() => (me ? syncOfflineMatches() : 0));
  }, [g.outcome, g.state.scores, g.startedAt, difficulty, me]);

  const again = () => { saved.current = false; g.reset(); setCounting(true); };
  const exit = async () => { await maybeShowInterstitial(ads, false); router.replace('/'); };
  const bodies = g.playback.bodies ?? g.state.world.bodies;
  const myTurn = g.state.current === 0 && g.state.winner === null && !g.animating && !counting;

  const result: MatchResult | null = g.outcome ? { outcome: g.outcome, scores: [g.state.scores[0], g.state.scores[1]], ranked: false, note: t('play.practiceNote') } : null;
  const status = g.state.winner !== null ? t('game.matchOver') : g.state.current === 0 ? t('game.yourTurn') : g.thinking ? t('game.thinking') : t('game.opponentTurn');

  return (
    <GameLayout
      top={{ name: AI_NAMES[difficulty], avatarId: 'avatar_05', pocketed: g.state.pocketed[1], color: 'black', active: g.state.current === 1, subtitle: t(`play.${difficulty}` as Key) }}
      bottom={{ name: me?.profile.username ?? t('common.you'), avatarId: me?.profile.avatarId, imageUrl: me?.profile.imageUrl, pocketed: g.state.pocketed[0], color: 'white', active: g.state.current === 0 }}
      centerTop={<><Pill color="#0006" textColor="#ffd24a">🪙 {me?.balance ?? 0}</Pill><Pill color="#0006" textColor="#7fe3ff">⭐ {g.state.scores[0]} – {g.state.scores[1]}</Pill></>}
      status={status}
      bodies={bodies} falling={g.playback.falling} boardTheme={cosm.boardTheme} strikerColor={cosm.strikerColor}
      side={0} canShoot={myTurn} onShoot={g.play} hint={t('game.dragHint')}
      powerAim={powerAim} onPowerAim={() => setPowerAim((v) => !v)}
      buttons={<><RoundButton label="☰" onPress={() => setMenu(true)} /><RoundButton label="↺" onPress={again} /></>}
      floating={<Banner text={banner?.text ?? null} kind={banner?.kind} />}
      overlays={
        <>
          {counting && g.state.winner === null && <Countdown ms={3000} onDone={() => setCounting(false)} />}
          <GameMenu visible={menu} onClose={() => setMenu(false)}>
            <Button title={t('game.playAgain')} kind="secondary" onPress={() => { setMenu(false); again(); }} />
            <Button title={t('game.home')} kind="danger" onPress={() => { setMenu(false); router.replace('/'); }} />
          </GameMenu>
          {result && <ResultOverlay r={result} onAgain={again} onHome={exit} />}
          <View />
        </>
      }
    />
  );
}
