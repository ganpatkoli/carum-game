import { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { clampStrikerX, isStrikerPlacementFree, type Body, type Shot } from '@carrom/game-core';
import { haptic } from '../ui/haptics';
import { boardThemeOf, theme as ui } from '../ui/theme';
import { Board, FRAME, baselineY } from './Board';
import type { Falling } from './playback';

interface Props {
  size: number;
  /** bodies to draw: resting coins, or interpolated frame during playback */
  bodies: Body[];
  falling?: Falling[];
  boardTheme?: string;
  strikerColor?: string;
  side: 0 | 1;
  /** true when the local player may place/aim/shoot right now */
  enabled: boolean;
  powerAim: boolean;
  onShoot: (shot: Shot) => void;
  hint?: string;
  guideLimit?: number;
}

/**
 * Touch rules: touching near your baseline slides the striker; anywhere else is a slingshot
 * (pull back from the striker, longer pull = more power; release to shoot).
 */
export function BoardArea({ size, bodies, falling, boardTheme, strikerColor, side, enabled, powerAim, onShoot, hint, guideLimit }: Props) {
  const [strikerX, setStrikerX] = useState(500);
  const [aim, setAim] = useState<Shot | null>(null);
  const mode = useRef<'move' | 'aim' | null>(null);
  const sx = useRef(500);
  const aimRef = useRef<Shot | null>(null);
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const m = size * FRAME;
  const k = (size - 2 * m) / 1000;
  // when the board is drawn flipped (top-side player), touches are mapped back into board space
  const toBoard = (px: number, py: number) => ({ x: side === 1 ? 1000 - (px - m) / k : (px - m) / k, y: side === 1 ? 1000 - (py - m) / k : (py - m) / k });
  const base = baselineY(side);
  const blocked = useMemo(() => !isStrikerPlacementFree({ bodies, step: 0 }, strikerX, base), [bodies, strikerX, base]);
  const blockedRef = useRef(blocked); blockedRef.current = blocked;

  const pan = Gesture.Pan().runOnJS(true).minDistance(0)
    .onBegin((e) => { const p = toBoard(e.x, e.y); mode.current = !enabledRef.current ? null : Math.abs(p.y - base) < 80 ? 'move' : 'aim'; })
    .onChange((e) => {
      const p = toBoard(e.x, e.y);
      if (mode.current === 'move') { sx.current = clampStrikerX(p.x); setStrikerX(sx.current); }
      else if (mode.current === 'aim') {
        // pull back from the striker; the shot goes the opposite way
        const dx = sx.current - p.x, dy = base - p.y;
        const len = Math.hypot(dx, dy);
        const s: Shot = { strikerX: sx.current, angle: Math.atan2(dy, dx), power: Math.min(1, len / 350) };
        if (len > 8) { aimRef.current = s; setAim(s); }
      }
    })
    .onFinalize(() => {
      const a = aimRef.current;
      if (mode.current === 'aim' && a && a.power > 0.05 && enabledRef.current) {
        if (blockedRef.current) haptic('error'); else { haptic('medium'); onShoot(a); }
      }
      aimRef.current = null; mode.current = null; setAim(null);
    });

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View accessibilityLabel="carrom board">
          <Board
            bodies={bodies} falling={falling} size={size} theme={boardThemeOf(boardTheme)}
            striker={enabled || (!bodies.some((b) => b.kind === 'striker') && enabled) ? { x: strikerX, side, color: strikerColor, blocked } : null}
            aim={enabled ? aim : null} powerAim={powerAim} flip={side === 1} guideLimit={guideLimit}
          />
          {enabled && aim && <PowerMeter power={aim.power} size={size} />}
        </View>
      </GestureDetector>
      {enabled && hint ? <Text style={{ color: ui.muted, fontSize: 12, textAlign: 'center', marginTop: 6 }}>{hint}</Text> : null}
    </View>
  );
}

/** Vertical power gauge shown while pulling back: green → yellow → red. */
function PowerMeter({ power, size }: { power: number; size: number }) {
  const h = size * 0.5;
  const color = power < 0.4 ? '#3fb950' : power < 0.75 ? '#f2b705' : '#e5484d';
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 6, top: size * 0.25, alignItems: 'center', gap: 4 }}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12, textShadowColor: '#000', textShadowRadius: 3 }}>{Math.round(power * 100)}%</Text>
      <View style={{ width: 12, height: h, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.45)', overflow: 'hidden', justifyContent: 'flex-end', borderWidth: 1, borderColor: '#fff6' }}>
        <View style={{ width: 12, height: h * power, backgroundColor: color }} />
      </View>
    </View>
  );
}
