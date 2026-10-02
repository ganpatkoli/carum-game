import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { play } from '../audio/sounds';
import { useT, type Key } from '../i18n';
import { Avatar, Button, Row } from '../ui/kit';
import { theme } from '../ui/theme';

export interface PlayerInfo { name: string; avatarId?: string; imageUrl?: string | null; pocketed: number; color: 'white' | 'black'; active: boolean; subtitle?: string }

export function PlayerCard({ p, align }: { p: PlayerInfo; align: 'left' | 'right' }) {
  return (
    <View style={{ flexDirection: align === 'left' ? 'row' : 'row-reverse', alignItems: 'center', gap: 8, flexShrink: 1 }}>
      <Avatar avatarId={p.avatarId} imageUrl={p.imageUrl} size={48} ring={p.active ? '#ffd24a' : '#8a5a2b'} />
      <View style={{ alignItems: align === 'left' ? 'flex-start' : 'flex-end', flexShrink: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '800' }} numberOfLines={1}>{p.name}</Text>
        {p.subtitle ? <Text style={{ color: '#ffe9c4', fontSize: 11 }} numberOfLines={1}>{p.subtitle}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 2, marginTop: 3 }}>
          {Array.from({ length: 9 }, (_, i) => (
            <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: p.color === 'white' ? '#f5f5f0' : '#111', opacity: i < p.pocketed ? 1 : 0.25, borderWidth: 1, borderColor: '#0006' }} />
          ))}
        </View>
      </View>
    </View>
  );
}

export function RoundButton({ label, onPress, active, badge }: { label: string; onPress: () => void; active?: boolean; badge?: boolean }) {
  return (
    <Pressable accessibilityLabel={label} onPress={() => { play('click', 0.6); onPress(); }}
      style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: active ? '#ffd24a' : '#e6a14a', borderWidth: 3, borderColor: theme.woodDark, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20 }}>{label}</Text>
      {badge ? <View style={{ position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: theme.red }} /> : null}
    </Pressable>
  );
}

export function PowerAimButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  const t = useT();
  const words = t('game.powerAim').split(' ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('game.powerAim')} onPress={() => { play('click', 0.6); onPress(); }}
      style={{ backgroundColor: on ? '#ffd24a' : '#e8452c', borderRadius: 12, borderWidth: 3, borderColor: '#7a1a0a', paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }}>
      {words.map((w, i) => <Text key={i} style={{ color: on ? '#4a2a00' : '#fff', fontWeight: '900', fontSize: 12 }}>{w}</Text>)}
    </Pressable>
  );
}

/** Short message that pops over the board (foul, queen, turn skipped…). */
export function Banner({ text, kind = 'info' }: { text: string | null; kind?: 'info' | 'bad' | 'good' }) {
  if (!text) return null;
  const bg = kind === 'bad' ? theme.red : kind === 'good' ? '#2f9e44' : '#3a2410';
  return (
    <Animated.View key={text} entering={ZoomIn.duration(180)} exiting={FadeOut.duration(250)} pointerEvents="none"
      style={{ position: 'absolute', alignSelf: 'center', top: '42%', backgroundColor: bg, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 14, borderWidth: 2, borderColor: '#fff6' }}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>{text}</Text>
    </Animated.View>
  );
}

/** 3 – 2 – 1 – GO! with a sound per step. Calls onDone when finished. */
export function Countdown({ ms, onDone }: { ms: number; onDone?: () => void }) {
  const t = useT();
  const steps = Math.max(1, Math.round(ms / 1000));
  const [n, setN] = useState(steps);
  const scale = useSharedValue(1);
  useEffect(() => {
    let i = steps;
    play('countdown');
    const id = setInterval(() => {
      i--;
      if (i > 0) { setN(i); play('countdown'); } else if (i === 0) { setN(0); play('go'); } else { clearInterval(id); onDone?.(); }
    }, 1000);
    return () => clearInterval(id);
  }, [steps, onDone]);
  useEffect(() => { scale.value = 1.6; scale.value = withSpring(1, { damping: 8 }); }, [n, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
      <Animated.Text style={[{ color: '#fff', fontSize: 96, fontWeight: '900' }, style]}>{n > 0 ? n : t('game.go')}</Animated.Text>
    </View>
  );
}

function CountUp({ to, suffix = '', prefix = '' }: { to: number; suffix?: string; prefix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = Date.now(); const dur = 900;
    const tick = () => { const p = Math.min(1, (Date.now() - t0) / dur); setV(Math.round(to * p)); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{prefix}{v > 0 && to > 0 ? '+' : ''}{v}{suffix}</Text>;
}

export interface MatchResult {
  outcome: 'win' | 'loss' | 'draw';
  scores: [number, number];
  ranked?: boolean; ratingChange?: number; xpGain?: number; levelUp?: number | null; coins?: number; achievements?: string[];
  xp?: { level: number; into: number; need: number };
  note?: string;
}

/** Victory / defeat screen: animated title, rating, XP bar fill, level-up, coins and achievements. */
export function ResultOverlay({ r, onAgain, onHome, againLabel }: { r: MatchResult; onAgain?: () => void; onHome: () => void; againLabel?: string }) {
  const t = useT();
  const titleKey: Key = r.outcome === 'win' ? 'game.win' : r.outcome === 'loss' ? 'game.lose' : 'game.draw';
  const bar = useSharedValue(0);
  const pop = useSharedValue(0);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return; played.current = true;
    play(r.outcome === 'win' ? 'win' : r.outcome === 'loss' ? 'loss' : 'notification');
    pop.value = withSequence(withTiming(1.25, { duration: 260 }), withSpring(1));
    if (r.xp) {
      const from = Math.max(0, (r.xp.into - (r.xpGain ?? 0)) / r.xp.need);
      bar.value = from; bar.value = withDelay(500, withTiming(Math.min(1, r.xp.into / r.xp.need), { duration: 900 }));
    }
  }, [r, bar, pop]);
  const titleStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const barStyle = useAnimatedStyle(() => ({ width: `${Math.round(bar.value * 100)}%` }));
  const color = r.outcome === 'win' ? '#ffd24a' : r.outcome === 'loss' ? '#9aa0ac' : '#7fe3ff';
  return (
    <Animated.View entering={FadeIn.duration(250)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,6,2,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {r.outcome === 'win' && <Text style={{ position: 'absolute', top: '12%', fontSize: 44 }}>🎉 🏆 🎉</Text>}
      <Animated.Text style={[{ color, fontSize: 46, fontWeight: '900' }, titleStyle]}>{t(titleKey)}</Animated.Text>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', marginVertical: 8 }}>{r.scores[0]} – {r.scores[1]}</Text>
      {r.note ? <Text style={{ color: theme.muted, marginBottom: 8, textAlign: 'center' }}>{r.note}</Text> : null}
      <View style={{ width: '100%', maxWidth: 340, gap: 10, marginVertical: 12 }}>
        {r.ranked === false && <Text style={{ color: theme.muted, textAlign: 'center' }}>{t('game.unranked')}</Text>}
        {!!r.ratingChange && r.ranked !== false && <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: theme.muted }}>{t('game.rating')}</Text><Text style={{ color: r.ratingChange >= 0 ? theme.green : theme.red, fontWeight: '800', fontSize: 18 }}>{r.ratingChange >= 0 ? '+' : ''}{r.ratingChange}</Text></Row>}
        {r.xpGain !== undefined && <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: theme.muted }}>{t('game.xp')}</Text><CountUp to={r.xpGain} /></Row>}
        {r.xp && (
          <View>
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 4 }}>{t('result.xpBar', { n: r.xp.level })}</Text>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: '#ffffff22', overflow: 'hidden' }}><Animated.View style={[{ height: 10, backgroundColor: theme.gold }, barStyle]} /></View>
          </View>
        )}
        {r.coins !== undefined && r.coins !== 0 && <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: theme.muted }}>{t('game.coinsWon')}</Text><Text style={{ color: r.coins > 0 ? theme.gold : theme.red, fontWeight: '800', fontSize: 18 }}>🪙 {r.coins > 0 ? '+' : ''}{r.coins}</Text></Row>}
        {r.levelUp ? <Animated.Text entering={ZoomIn.delay(900)} style={{ color: theme.gold, fontWeight: '900', fontSize: 20, textAlign: 'center' }}>⬆️ {t('game.levelUp', { n: r.levelUp })}</Animated.Text> : null}
        {r.achievements?.map((a) => <Animated.Text key={a} entering={ZoomIn.delay(1200)} style={{ color: '#fff', textAlign: 'center' }}>🏅 {t('game.achievement', { name: a.replace(/_/g, ' ').toLowerCase() })}</Animated.Text>)}
      </View>
      <View style={{ width: '100%', maxWidth: 340, gap: 10 }}>
        {onAgain ? <Button title={againLabel ?? t('game.playAgain')} onPress={onAgain} /> : null}
        <Button title={t('game.home')} onPress={onHome} kind="secondary" />
      </View>
    </Animated.View>
  );
}

export function GameMenu({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable style={{ width: '100%', maxWidth: 340, backgroundColor: theme.card, borderRadius: 18, padding: 18, gap: 10, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', marginBottom: 4 }}>{t('game.menu')}</Text>
          {children}
          <Button title={t('game.resume')} onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Floating emote bubble shown above a player for a few seconds. */
export function EmoteBubble({ text }: { text: string | null }) {
  if (!text) return null;
  return <Animated.View key={text} entering={ZoomIn.duration(150)} exiting={FadeOut.duration(300)} style={{ position: 'absolute', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}><Text style={{ fontWeight: '800', color: '#222' }}>{text}</Text></Animated.View>;
}
