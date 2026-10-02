import { type ReactNode } from 'react';
import { Dimensions, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Body, Shot } from '@carrom/game-core';
import { BoardArea } from './BoardArea';
import type { Falling } from './playback';
import { PlayerCard, PowerAimButton, type PlayerInfo } from './hud';
import { theme } from '../ui/theme';

export const BOARD_SIZE = Math.min(Dimensions.get('window').width - 16, 520);

interface Props {
  top: PlayerInfo; bottom: PlayerInfo;
  centerTop: ReactNode; status: string; statusTone?: 'normal' | 'warn';
  bodies: Body[]; falling?: Falling[]; boardTheme?: string; strikerColor?: string;
  side: 0 | 1; canShoot: boolean; onShoot: (s: Shot) => void; hint?: string;
  powerAim: boolean; onPowerAim: () => void;
  buttons: ReactNode;
  overlays?: ReactNode; floating?: ReactNode;
}

/** The wood-themed match screen shared by offline practice and online play. */
export function GameLayout(p: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.wood, alignItems: 'center', paddingTop: insets.top + 6, paddingBottom: insets.bottom + 8, paddingHorizontal: 8 }}>
      <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6, gap: 6 }}>
        <PlayerCard p={p.top} align="left" />
        <View style={{ gap: 4, alignItems: 'center' }}>{p.centerTop}</View>
        <View style={{ width: 8 }} />
      </View>
      <Text style={{ color: p.statusTone === 'warn' ? '#ffd24a' : '#fff', fontWeight: '800', marginVertical: 8 }}>{p.status}</Text>
      <View>
        <BoardArea size={BOARD_SIZE} bodies={p.bodies} falling={p.falling} boardTheme={p.boardTheme} strikerColor={p.strikerColor} side={p.side} enabled={p.canShoot} powerAim={p.powerAim} onShoot={p.onShoot} hint={p.hint} />
        {p.floating}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', width: '100%', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, gap: 6 }}>
        <PlayerCard p={p.bottom} align="left" />
        <View style={{ flexDirection: 'row', gap: 8 }}>{p.buttons}</View>
        <PowerAimButton on={p.powerAim} onPress={p.onPowerAim} />
      </View>
      {p.overlays}
    </View>
  );
}
