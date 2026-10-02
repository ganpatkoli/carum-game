import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { clampStrikerX, type Difficulty, type Shot } from '@carrom/game-core';
import { api } from '../src/api/client';
import { Board, FRAME } from '../src/game/Board';
import { useOfflineGame } from '../src/game/useOfflineGame';
import { useT } from '../src/i18n';
import { useSettings } from '../src/store/settings';
import { theme } from '../src/ui/theme';

const SIZE = Math.min(Dimensions.get('window').width - 16, 520);
const WOOD = '#b9651f';

function PlayerCard({ name, emoji, pocketed, color, active, align }: { name: string; emoji: string; pocketed: number; color: 'white' | 'black'; active: boolean; align: 'left' | 'right' }) {
  return (
    <View style={{ flexDirection: align === 'left' ? 'row' : 'row-reverse', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#3a2412', borderWidth: 3, borderColor: active ? '#ffd24a' : '#8a5a2b', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
      </View>
      <View style={{ alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>{name}</Text>
        <View style={{ flexDirection: 'row', gap: 3, marginTop: 3 }}>
          {Array.from({ length: 9 }, (_, i) => (
            <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color === 'white' ? '#f5f5f0' : '#111', opacity: i < pocketed ? 1 : 0.25, borderWidth: 1, borderColor: '#0006' }} />
          ))}
        </View>
      </View>
    </View>
  );
}

const Round = ({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) => (
  <Pressable onPress={onPress} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: active ? '#ffd24a' : '#e6a14a', borderWidth: 3, borderColor: '#7a4410', alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 20 }}>{label}</Text>
  </Pressable>
);

export default function GameScreen() {
  const t = useT();
  const { difficulty = 'easy' } = useLocalSearchParams<{ difficulty: Difficulty }>();
  const g = useOfflineGame(difficulty);
  const vibration = useSettings((s) => s.vibration);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ profile: { username: string }; balance: number }>('/me'), retry: false });
  const [aim, setAim] = useState<Shot | null>(null);
  const [powerAim, setPowerAim] = useState(false);
  const [sx, setSx] = useState(500);
  const mode = useRef<'move' | 'aim' | null>(null);
  const sxRef = useRef(500);
  const aimRef = useRef<Shot | null>(null);

  const myTurn = g.state.current === 0 && g.state.winner === null && !g.busy;
  const m = SIZE * FRAME;
  const k = (SIZE - 2 * m) / 1000;
  const toBoard = (px: number, py: number) => ({ x: (px - m) / k, y: (py - m) / k });

  // Touch near the bottom baseline slides the striker; anywhere else slingshots (pull back to aim, longer pull = more power).
  const pan = Gesture.Pan().runOnJS(true).minDistance(0)
    .onBegin((e) => { const p = toBoard(e.x, e.y); mode.current = !myTurn ? null : Math.abs(p.y - 850) < 75 ? 'move' : 'aim'; })
    .onChange((e) => {
      const p = toBoard(e.x, e.y);
      if (mode.current === 'move') { sxRef.current = clampStrikerX(p.x); setSx(sxRef.current); }
      else if (mode.current === 'aim') {
        const dx = sxRef.current - p.x, dy = 850 - p.y;
        const s: Shot = { strikerX: sxRef.current, angle: Math.atan2(dy, dx), power: Math.min(1, Math.hypot(dx, dy) / 350) };
        aimRef.current = s; setAim(s);
      }
    })
    .onFinalize(() => {
      const a = aimRef.current;
      if (mode.current === 'aim' && a && a.power > 0.05 && myTurn) {
        if (vibration) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        g.play(a);
      }
      aimRef.current = null; mode.current = null; setAim(null);
    });

  const w = g.state.winner;
  const status = w !== null ? (w === 0 ? t('game.win') : w === 1 ? t('game.lose') : t('game.draw')) : g.state.current === 0 ? t('game.yourTurn') : t('game.thinking');
  const name = me.data?.profile.username ?? 'You';

  return (
    <View style={{ flex: 1, backgroundColor: WOOD, alignItems: 'center', paddingTop: 44, paddingHorizontal: 8 }}>
      {/* top bar */}
      <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6 }}>
        <PlayerCard name="Ali" emoji="🤖" pocketed={g.state.pocketed[1]} color="black" active={g.state.current === 1} align="left" />
        <View style={{ gap: 4 }}>
          <View style={{ backgroundColor: '#0006', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: '#ffd24a', fontWeight: '800' }}>🪙 {me.data?.balance ?? 0}</Text></View>
          <View style={{ backgroundColor: '#0006', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: '#7fe3ff', fontWeight: '800' }}>⭐ {g.state.scores[0]}–{g.state.scores[1]}</Text></View>
        </View>
        <PlayerCard name={name} emoji="😎" pocketed={g.state.pocketed[0]} color="white" active={g.state.current === 0} align="right" />
      </View>

      <Text style={{ color: '#fff', fontWeight: '800', marginVertical: 8 }}>{status}{g.events.some((e) => e.type === 'foul') ? `  ·  ${t('game.foul')}` : ''}</Text>

      <GestureDetector gesture={pan}>
        <View>
          <Board world={g.state.world} size={SIZE} striker={myTurn ? { x: sx, side: 0 } : null} aim={aim} powerAim={powerAim} />
        </View>
      </GestureDetector>

      {/* bottom bar */}
      <View style={{ flexDirection: 'row', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 6 }}>
        <PlayerCard name={name} emoji="😎" pocketed={g.state.pocketed[0]} color="white" active={myTurn} align="left" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Round label="☰" onPress={() => router.back()} />
          <Round label="⭐" onPress={() => {}} />
          <Round label="↺" onPress={g.reset} />
        </View>
        <Pressable onPress={() => setPowerAim((v) => !v)} style={{ backgroundColor: powerAim ? '#ffd24a' : '#e8452c', borderRadius: 12, borderWidth: 3, borderColor: '#7a1a0a', paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ color: powerAim ? '#4a2a00' : '#fff', fontWeight: '900', fontSize: 12 }}>POWER</Text>
          <Text style={{ color: powerAim ? '#4a2a00' : '#fff', fontWeight: '900', fontSize: 12 }}>AIM</Text>
        </Pressable>
      </View>

      {w !== null && (
        <Pressable onPress={g.reset} style={{ marginTop: 14, backgroundColor: theme.gold, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ fontWeight: '900' }}>{t('game.playAgain')}</Text>
        </Pressable>
      )}
    </View>
  );
}
