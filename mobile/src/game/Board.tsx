import { Canvas, Circle, Group, Line, Rect, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { boardThemes } from '../ui/theme';
import { DEFAULT_PHYSICS, pocketCenters, type Shot, type World } from '@carrom/game-core';

const COLORS = { black: '#111', white: '#f5f5f0', queen: '#d62839', striker: '#f2b705' } as const;

interface Props { world: World; size: number; theme?: keyof typeof boardThemes; aim?: { shot: Shot; side: 0 | 1 } | null }

export function Board({ world, size, theme = 'classic', aim }: Props) {
  const k = size / DEFAULT_PHYSICS.boardSize;
  const t = boardThemes[theme];
  const pockets = useMemo(() => pocketCenters(), []);
  const mid = size / 2;
  const strikerPos = aim ? { x: aim.shot.strikerX, y: aim.side === 0 ? 850 : 150 } : null;
  return (
    <Canvas style={{ width: size, height: size }}>
      <Rect x={0} y={0} width={size} height={size} color={t.frame} />
      <Rect x={size * 0.02} y={size * 0.02} width={size * 0.96} height={size * 0.96} color={t.surface} />
      <Circle cx={mid} cy={mid} r={size * 0.1} color="transparent" style="stroke" strokeWidth={2} />
      <Circle cx={mid} cy={mid} r={size * 0.1} color={t.line} style="stroke" strokeWidth={2} />
      <Circle cx={mid} cy={mid} r={size * 0.02} color={COLORS.queen} style="stroke" strokeWidth={2} />
      {[150, 850].map((y) => <Line key={y} p1={vec(200 * k, y * k)} p2={vec(800 * k, y * k)} color={t.line} strokeWidth={2} />)}
      {pockets.map((p, i) => <Circle key={i} cx={p.x * k} cy={p.y * k} r={DEFAULT_PHYSICS.pocketRadius * k} color="#050505" />)}
      <Group>
        {world.bodies.map((b) => (
          <Group key={b.id}>
            <Circle cx={b.x * k + 1} cy={b.y * k + 2} r={b.radius * k} color="rgba(0,0,0,0.3)" />
            <Circle cx={b.x * k} cy={b.y * k} r={b.radius * k} color={COLORS[b.kind]} />
            <Circle cx={b.x * k} cy={b.y * k} r={b.radius * k * 0.6} color="rgba(0,0,0,0.25)" style="stroke" strokeWidth={1} />
          </Group>
        ))}
      </Group>
      {aim && strikerPos && (
        <Group>
          <Line p1={vec(strikerPos.x * k, strikerPos.y * k)} p2={vec((strikerPos.x + Math.cos(aim.shot.angle) * 300 * (0.3 + aim.shot.power)) * k, (strikerPos.y + Math.sin(aim.shot.angle) * 300 * (0.3 + aim.shot.power)) * k)} color="rgba(255,255,255,0.85)" strokeWidth={2} />
          <Circle cx={strikerPos.x * k} cy={strikerPos.y * k} r={DEFAULT_PHYSICS.strikerRadius * k} color={COLORS.striker} />
        </Group>
      )}
    </Canvas>
  );
}
