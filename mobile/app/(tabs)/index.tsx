import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { useT } from '../../src/i18n';
import { ErrorState, Loading } from '../../src/ui/States';
import { theme } from '../../src/ui/theme';

const Card = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={{ flex: 1, minWidth: '45%', backgroundColor: theme.card, padding: 18, borderRadius: 16 }}>
    <Text style={{ color: theme.text, fontWeight: '700' }}>{label}</Text>
  </Pressable>
);

export default function Home() {
  const t = useT();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ profile: { username: string; level: number }; balance: number }>('/me') });
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, gap: 16 }} style={{ backgroundColor: theme.bg }}>
      <Text style={{ color: theme.gold, fontSize: 28, fontWeight: '900' }}>{t('brand.name')}</Text>
      <Text style={{ color: theme.muted }}>{t('brand.tagline')}</Text>
      {me.isLoading ? <Loading /> : me.isError ? <ErrorState onRetry={() => me.refetch()} /> : (
        <View style={{ backgroundColor: theme.card, padding: 16, borderRadius: 16 }}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>{me.data?.profile.username} · Lv {me.data?.profile.level}</Text>
          <Text style={{ color: theme.gold }}>🪙 {me.data?.balance}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Card label={t('home.quickPlay')} onPress={() => router.push('/play')} />
        <Card label={t('home.friends')} onPress={() => router.push('/play')} />
        <Card label={t('home.privateRoom')} onPress={() => router.push('/play')} />
        <Card label={t('home.practice')} onPress={() => router.push('/game?difficulty=easy')} />
      </View>
    </ScrollView>
  );
}
