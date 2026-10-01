import { useLocalSearchParams, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import type { Difficulty, Shot } from '@carrom/game-core';
import { Board } from '../src/game/Board';
import { useOfflineGame } from '../src/game/useOfflineGame';
import { useT } from '../src/i18n';
import { useSettings } from '../src/store/settings';
import { theme } from '../src/ui/theme';

const SIZE = Math.min(Dimensions.get('window').width - 24, 520);

export default function GameScreen() {
  const t = useT();
  const { difficulty = 'easy' } = useLocalSearchParams<{ difficulty: Difficulty }>();
  const g = useOfflineGame(difficulty);
  const vibration = useSettings((s) => s.vibration);
  const [aim, setAim] = useState<Shot | null>(null);
  const strikerX = useRef(500);
  const k = 1000 / SIZE;

  // Drag backwards from the striker (slingshot): direction opposite to drag, power from drag length.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onChange((e) => {
      const sx = strikerX.current, sy = 850;
      const dx = sx - e.x * k, dy = sy - e.y * k;
      const len = Math.hypot(dx, dy);
      setAim({ strikerX: sx, angle: Math.atan2(dy, dx), power: Math.min(1, len / 350) });
    })
    .onEnd(() => {
      fire();
    });

  function fire() {
    setAim((a) => {
      if (a && a.power > 0.05 && g.state.current === 0 && !g.busy) {
        if (vibration) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        g.play(a);
      }
      return null;
    });
  }

  const myTurn = g.state.current === 0 && g.state.winner === null;
  const w = g.state.winner;
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', paddingTop: 50, gap: 12 }}>
      <Text style={{ color: theme.text, fontSize: 16 }}>{g.state.scores[0]} – {g.state.scores[1]}</Text>
      <Text style={{ color: theme.gold }}>{w !== null ? (w === 0 ? t('game.win') : w === 1 ? t('game.lose') : t('game.draw')) : myTurn ? t('game.yourTurn') : t('game.thinking')}</Text>
      <GestureDetector gesture={pan}>
        <View><Board world={g.state.world} size={SIZE} aim={aim ? { shot: aim, side: 0 } : null} /></View>
      </GestureDetector>
      {g.events.some((e) => e.type === 'foul') && <Text style={{ color: theme.red }}>{t('game.foul')}</Text>}
      {w !== null && <Pressable onPress={g.reset} style={{ backgroundColor: theme.gold, padding: 14, borderRadius: 12 }}><Text style={{ fontWeight: '800' }}>{t('game.playAgain')}</Text></Pressable>}
      <Pressable onPress={() => router.back()}><Text style={{ color: theme.muted }}>←</Text></Pressable>
    </View>
  );
}
