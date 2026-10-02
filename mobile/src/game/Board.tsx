import { Canvas, Circle, Group, Line, LinearGradient, RadialGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { DEFAULT_PHYSICS, pocketCenters, type Body, type Shot } from '@carrom/game-core';
import { boardThemes, type BoardThemeId } from '../ui/theme';
import { castGuide } from './aimGuide';
import { fallProgress, type Falling } from './playback';

const COIN = { black: ['#6a6a6a', '#0b0b0b'], white: ['#ffffff', '#cfc6b4'], queen: ['#ff6b6b', '#a3121f'] } as const;

/** Frame margin as a fraction of the canvas — shared with the gesture code. */
export const FRAME = 0.05;
export const baselineY = (side: 0 | 1) => (side === 0 ? 850 : 150);

export interface BoardProps {
  bodies: Body[];
  falling?: Falling[];
  size: number;
  theme?: BoardThemeId;
  /** resting striker (shown while it is somebody's turn and nothing is moving) */
  striker?: { x: number; side: 0 | 1; color?: string; blocked?: boolean } | null;
  aim?: Shot | null;
  powerAim?: boolean;
  /** draw rotated 180° so the local player on the top side still sees themselves at the bottom */
  flip?: boolean;
}

export function Board({ bodies, falling = [], size, theme = 'classic', striker, aim, powerAim, flip }: BoardProps) {
  const t = boardThemes[theme];
  const m = size * FRAME;
  const s = size - 2 * m;
  const k = s / DEFAULT_PHYSICS.boardSize;
  const P = (x: number, y: number) => vec(m + x * k, m + y * k);
  const pockets = useMemo(() => pocketCenters(), []);
  const guide = aim && striker ? castGuide(bodies, striker.x, baselineY(striker.side), aim) : null;
  const stub = aim && striker ? { x: striker.x + Math.cos(aim.angle) * 140, y: baselineY(striker.side) + Math.sin(aim.angle) * 140 } : null;

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={flip ? [{ translateX: size }, { translateY: size }, { rotate: Math.PI }] : []}>
      {/* wooden frame */}
      <RoundedRect x={0} y={0} width={size} height={size} r={size * 0.03}>
        <LinearGradient start={vec(0, 0)} end={vec(size, size)} colors={[t.frame, '#3b2210', t.frame]} />
      </RoundedRect>
      <RoundedRect x={m * 0.55} y={m * 0.55} width={size - m * 1.1} height={size - m * 1.1} r={size * 0.015} color="rgba(0,0,0,0.35)" style="stroke" strokeWidth={2} />
      {/* playing surface */}
      <RoundedRect x={m} y={m} width={s} height={s} r={4}>
        <RadialGradient c={vec(size / 2, size / 2)} r={s * 0.75} colors={[t.surface, t.surface, '#d8a96a']} />
      </RoundedRect>

      {/* centre ornament */}
      {[0.17, 0.115, 0.05].map((r, i) => <Circle key={r} cx={size / 2} cy={size / 2} r={s * r} color={t.line} style="stroke" strokeWidth={i === 0 ? 2 : 1.2} />)}
      <Circle cx={size / 2} cy={size / 2} r={s * 0.02} color="#b3202c" />

      {/* diagonal arrows from each corner */}
      {[[0, 0, 1, 1], [1000, 0, -1, 1], [0, 1000, 1, -1], [1000, 1000, -1, -1]].map(([x, y, dx, dy], i) => (
        <Group key={i}>
          <Line p1={P(x + dx * 90, y + dy * 90)} p2={P(x + dx * 250, y + dy * 250)} color={t.line} strokeWidth={1.5} />
          <Circle c={P(x + dx * 300, y + dy * 300)} r={s * 0.012} color={t.line} />
        </Group>
      ))}

      {/* baselines with end circles */}
      {[150, 850].map((y) => (
        <Group key={y}>
          <Line p1={P(200, y - 22)} p2={P(800, y - 22)} color={t.line} strokeWidth={1.5} />
          <Line p1={P(200, y + 22)} p2={P(800, y + 22)} color={t.line} strokeWidth={1.5} />
          <Circle c={P(200, y)} r={22 * k} color="#c0392b" />
          <Circle c={P(800, y)} r={22 * k} color="#c0392b" />
          <Circle c={P(200, y)} r={22 * k} color={t.line} style="stroke" strokeWidth={1.2} />
          <Circle c={P(800, y)} r={22 * k} color={t.line} style="stroke" strokeWidth={1.2} />
        </Group>
      ))}
      {[150, 850].map((x) => (
        <Group key={x}>
          <Line p1={P(x - 22, 200)} p2={P(x - 22, 800)} color={t.line} strokeWidth={1.2} />
          <Line p1={P(x + 22, 200)} p2={P(x + 22, 800)} color={t.line} strokeWidth={1.2} />
        </Group>
      ))}

      {/* pockets with nets */}
      {pockets.map((p, i) => (
        <Group key={i}>
          <Circle c={P(p.x, p.y)} r={(DEFAULT_PHYSICS.pocketRadius + 7) * k} color="#6d3fa8" />
          <Circle c={P(p.x, p.y)} r={DEFAULT_PHYSICS.pocketRadius * k}>
            <RadialGradient c={P(p.x, p.y)} r={DEFAULT_PHYSICS.pocketRadius * k} colors={['#000', '#1c1c1c']} />
          </Circle>
          <Circle c={P(p.x, p.y)} r={DEFAULT_PHYSICS.pocketRadius * k * 0.7} color="rgba(255,255,255,0.12)" style="stroke" strokeWidth={1} />
        </Group>
      ))}

      {/* aim guide (under the pieces) */}
      {aim && striker && stub && (
        <Group>
          {!powerAim && <Line p1={P(striker.x, baselineY(striker.side))} p2={P(stub.x, stub.y)} color="rgba(255,255,255,0.85)" strokeWidth={2} />}
          {powerAim && guide && (
            <>
              <Line p1={P(striker.x, baselineY(striker.side))} p2={P(guide.end.x, guide.end.y)} color="rgba(255,255,255,0.9)" strokeWidth={2} />
              <Circle c={P(guide.end.x, guide.end.y)} r={DEFAULT_PHYSICS.strikerRadius * k} color="rgba(255,255,255,0.7)" style="stroke" strokeWidth={2} />
              {guide.deflect && <Line p1={P(guide.end.x, guide.end.y)} p2={P(guide.deflect.x, guide.deflect.y)} color="rgba(255,226,122,0.9)" strokeWidth={2} />}
            </>
          )}
        </Group>
      )}

      {bodies.map((b) => <Piece key={b.id} x={m + b.x * k} y={m + b.y * k} r={b.radius * k} kind={b.kind} />)}
      {falling.map((f) => {
        const p = fallProgress(f);
        return <Piece key={'f' + f.id} x={m + f.x * k} y={m + f.y * k} r={f.r * k * (1 - p * 0.85)} kind={f.kind} fade={1 - p} />;
      })}
      {striker && <Piece x={m + striker.x * k} y={m + baselineY(striker.side) * k} r={DEFAULT_PHYSICS.strikerRadius * k} kind="striker" color={striker.blocked ? '#e5484d' : striker.color} />}
      </Group>
    </Canvas>
  );
}

function Piece({ x, y, r, kind, color, fade = 1 }: { x: number; y: number; r: number; kind: Body['kind']; color?: string; fade?: number }) {
  const [hi, lo] = kind === 'striker' ? ['#ffffff', color ?? '#d98a00'] : COIN[kind];
  return (
    <Group opacity={fade}>
      <Circle cx={x + 1.5} cy={y + 2.5} r={r} color="rgba(0,0,0,0.35)" />
      <Circle cx={x} cy={y} r={r}>
        <RadialGradient c={vec(x - r * 0.35, y - r * 0.4)} r={r * 1.5} colors={[hi, lo]} />
      </Circle>
      <Circle cx={x} cy={y} r={r * 0.62} color="rgba(0,0,0,0.28)" style="stroke" strokeWidth={1} />
      {kind === 'striker' && <Circle cx={x} cy={y} r={r * 0.3} color="rgba(0,0,0,0.25)" />}
    </Group>
  );
}
