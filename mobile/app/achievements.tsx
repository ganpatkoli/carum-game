import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { api } from '../src/api/client';
import { useT } from '../src/i18n';
import { Card, QueryView, Row, Screen, SkeletonList } from '../src/ui/kit';
import { theme } from '../src/ui/theme';

interface A { id: string; title: string; target: number; rewardCoins: number; unlocked: boolean; unlockedAt: string | null }

export default function Achievements() {
  const t = useT();
  const q = useQuery({ queryKey: ['achievements'], queryFn: () => api<A[]>('/achievements') });
  return (
    <Screen title={t('rewards.achievements')}>
      <QueryView query={q} skeleton={<SkeletonList rows={6} />} isEmpty={(d) => d.length === 0}>
        {(list) => <View style={{ gap: 10 }}>{[...list].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)).map((a) => (
          <Card key={a.id} style={{ opacity: a.unlocked ? 1 : 0.6, borderColor: a.unlocked ? theme.gold : theme.border }}>
            <Row><Text style={{ fontSize: 30 }}>{a.unlocked ? '🏅' : '🔒'}</Text><View style={{ flex: 1 }}><Text style={{ color: theme.text, fontWeight: '800' }}>{a.title}</Text><Text style={{ color: theme.muted, fontSize: 12 }}>{a.unlocked ? t('rewards.unlocked') : t('rewards.locked')}</Text></View><Text style={{ color: theme.gold, fontWeight: '800' }}>+{a.rewardCoins} 🪙</Text></Row>
          </Card>))}</View>}
      </QueryView>
    </Screen>
  );
}
