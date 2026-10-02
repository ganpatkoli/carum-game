import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { play } from '../src/audio/sounds';
import { attachMatchListeners, useMatch } from '../src/game/matchStore';
import { useT } from '../src/i18n';
import { useAuth } from '../src/store/auth';
import { Avatar, Button } from '../src/ui/kit';
import { toast } from '../src/ui/toast';
import { theme } from '../src/ui/theme';

function Ring({ delay }: { delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1)); }, [p, delay]);
  const style = useAnimatedStyle(() => ({ opacity: 0.7 * (1 - p.value), transform: [{ scale: 0.4 + p.value * 1.6 }] }));
  return <Animated.View style={[{ position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 3, borderColor: theme.gold }, style]} />;
}

/** Quick match search. Joins the queue, shows an animated radar, and jumps into the game when found. */
export default function Matchmaking() {
  const t = useT();
  const me = useAuth((s) => s.me);
  const { entry = '0' } = useLocalSearchParams<{ entry?: string }>();
  const phase = useMatch((s) => s.phase);
  const queueError = useMatch((s) => s.queueError);
  const [waited, setWaited] = useState(0);
  const [found, setFound] = useState(false);

  useEffect(() => {
    attachMatchListeners();
    void useMatch.getState().joinQueue(Number(entry) || 0);
    return () => { if (useMatch.getState().phase === 'queue') useMatch.getState().leaveQueue(); };
  }, [entry]);

  useEffect(() => { const id = setInterval(() => setWaited((w) => w + 1), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (phase !== 'playing') return;
    setFound(true); play('reward');
    const id = setTimeout(() => router.replace('/online'), 900);
    return () => clearTimeout(id);
  }, [phase]);
  useEffect(() => {
    if (!queueError) return;
    toast(queueError === 'insufficient_funds' ? t('play.notEnough') : t('net.error'), 'error');
    router.back();
  }, [queueError, t]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
      <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
        {!found && [0, 700, 1400].map((d) => <Ring key={d} delay={d} />)}
        <Avatar avatarId={me?.profile.avatarId} imageUrl={me?.profile.imageUrl} size={96} ring={theme.gold} />
      </View>
      <Text style={{ color: theme.text, fontSize: 24, fontWeight: '900' }}>{found ? t('mm.found') : t('mm.searching')}</Text>
      {!found && <Text style={{ color: theme.muted }}>{t('mm.waited', { n: waited })}</Text>}
      {!found && waited > 6 && <Text style={{ color: theme.muted, textAlign: 'center' }}>{t('mm.botNote')}</Text>}
      {!found && <Button title={t('mm.cancel')} kind="secondary" onPress={() => { useMatch.getState().leaveQueue(); router.back(); }} />}
    </View>
  );
}
