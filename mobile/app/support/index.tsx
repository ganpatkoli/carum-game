import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { useT, type Key } from '../../src/i18n';
import { Button, Card, Pill, QueryView, Row, Screen, SkeletonList } from '../../src/ui/kit';
import { theme } from '../../src/ui/theme';

interface T { id: string; category: string; status: string; description: string; createdAt: string }

export default function Support() {
  const t = useT();
  const q = useQuery({ queryKey: ['tickets'], queryFn: () => api<T[]>('/support/tickets') });
  return (
    <Screen title={t('support.title')}>
      <Button title={`＋ ${t('support.new')}`} onPress={() => router.push('/support/new')} />
      <QueryView query={q} skeleton={<SkeletonList rows={4} />} isEmpty={(d) => d.length === 0} emptyText={t('support.none')}>
        {(list) => <View style={{ gap: 10 }}>{list.map((x) => (
          <Card key={x.id} onPress={() => router.push(`/support/${x.id}`)} style={{ gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: theme.text, fontWeight: '800' }}>{t(`support.cat.${x.category}` as Key)}</Text><Pill color={x.status === 'RESOLVED' ? '#1f3a24' : theme.card2}>{t(`support.status.${x.status}` as Key)}</Pill></Row>
            <Text style={{ color: theme.muted }} numberOfLines={2}>{x.description}</Text>
            <Text style={{ color: theme.muted, fontSize: 11 }}>{new Date(x.createdAt).toLocaleString()}</Text>
          </Card>))}</View>}
      </QueryView>
    </Screen>
  );
}
