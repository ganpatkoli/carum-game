import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { api, errorMessage } from '../src/api/client';
import { useT } from '../src/i18n';
import { Button, Card, QueryView, Row, Screen, SkeletonList } from '../src/ui/kit';
import { toast } from '../src/ui/toast';
import { theme } from '../src/ui/theme';

interface N { id: string; kind: string; title: string; body: string; data: any; read: boolean; createdAt: string }
const ICON: Record<string, string> = { friend_request: '🤝', game_invite: '🎮', achievement: '🏅', level_up: '⬆️', support: '💬', report: '🛡', event: '✨', daily_reward: '🎁' };

export default function Notifications() {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api<{ unread: number; items: N[] }>('/notifications?limit=50') });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read', { json: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });

  const open = async (n: N) => {
    if (n.kind === 'friend_request') router.push('/friends');
    else if (n.kind === 'game_invite' && n.data?.code) {
      try { await api('/rooms/join', { json: { code: n.data.code } }); router.push(`/room/${n.data.code}`); } catch (e) { toast(errorMessage(e, t('room.notFound')), 'error'); }
    } else if (n.kind === 'support' && n.data?.ticketId) router.push(`/support/${n.data.ticketId}`);
    else if (n.kind === 'achievement') router.push('/achievements');
  };

  return (
    <Screen title={t('notif.title')} right={<Button title={t('notif.markRead')} kind="ghost" onPress={() => readAll.mutate()} style={{ paddingVertical: 6 }} />}>
      <QueryView query={q} skeleton={<SkeletonList rows={6} />} isEmpty={(d) => d.items.length === 0} emptyText={t('notif.none')}>
        {(d) => <View style={{ gap: 10 }}>{d.items.map((n) => (
          <Card key={n.id} onPress={() => open(n)} style={{ borderColor: n.read ? theme.border : theme.gold }}>
            <Row><Text style={{ fontSize: 26 }}>{ICON[n.kind] ?? '🔔'}</Text><View style={{ flex: 1 }}><Text style={{ color: theme.text, fontWeight: '800' }}>{n.title}</Text><Text style={{ color: theme.muted }}>{n.body}</Text><Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>{new Date(n.createdAt).toLocaleString()}</Text></View></Row>
          </Card>))}</View>}
      </QueryView>
    </Screen>
  );
}
