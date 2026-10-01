import { useQuery } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { useLang } from '../../src/i18n';
import { useSettings } from '../../src/store/settings';
import { ErrorState, Loading } from '../../src/ui/States';
import { theme } from '../../src/ui/theme';

export default function Profile() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ playerId: string; rating: number; profile: any }>('/me') });
  const { lang, setLang } = useLang();
  const s = useSettings();
  if (me.isLoading) return <Loading />;
  if (me.isError) return <ErrorState onRetry={() => me.refetch()} />;
  const p = me.data!.profile;
  const rate = p.matchesPlayed ? Math.round((p.matchesWon / p.matchesPlayed) * 100) : 0;
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20, paddingTop: 60, gap: 10 }}>
      <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>{p.name} (@{p.username})</Text>
      <Text style={{ color: theme.muted }}>ID {me.data!.playerId} · Lv {p.level} · {p.xp} XP · ★ {me.data!.rating}</Text>
      <Text style={{ color: theme.text }}>Win rate {rate}% · {p.matchesWon}W / {p.matchesLost}L / {p.draws}D · streak {p.currentStreak}</Text>
      <Pressable onPress={() => setLang(lang === 'en' ? 'hi' : 'en')}><Text style={{ color: theme.gold }}>Language: {lang.toUpperCase()}</Text></Pressable>
      {(['sound', 'music', 'vibration'] as const).map((k) => (
        <Pressable key={k} onPress={() => s.toggle(k)}><Text style={{ color: theme.text }}>{k}: {s[k] ? 'on' : 'off'}</Text></Pressable>
      ))}
    </View>
  );
}
