import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { api, errorMessage } from '../../src/api/client';
import { useT } from '../../src/i18n';
import { useAuth } from '../../src/store/auth';
import { Avatar, Button, Card, Pill, QueryView, Row, Screen, SkeletonList } from '../../src/ui/kit';
import { toast } from '../../src/ui/toast';
import { theme } from '../../src/ui/theme';

interface Pub { id: string; username: string; name: string; avatarId: string; imageUrl: string | null; level: number; country: string | null; online: boolean; stats: { rating: number; played: number; won: number; lost: number; draws: number; bestStreak: number } | null }

export default function PublicProfile() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const meId = useAuth((s) => s.me?.id);
  const q = useQuery({ queryKey: ['public', id], queryFn: () => api<Pub>(`/users/${id}/public`) });
  const add = useMutation({ mutationFn: () => api('/friends/requests', { json: { toUserId: id } }), onSuccess: () => toast(t('friends.sent'), 'success'), onError: (e) => toast(errorMessage(e, t('net.error')), 'error') });
  const block = useMutation({ mutationFn: () => api('/blocks', { json: { userId: id } }), onSuccess: () => { toast(t('friends.block'), 'success'); router.back(); } });
  return (
    <Screen title="">
      <QueryView query={q} skeleton={<SkeletonList rows={3} height={90} />}>
        {(u) => (
          <>
            <Card style={{ alignItems: 'center', gap: 6 }}>
              <Avatar avatarId={u.avatarId} imageUrl={u.imageUrl} size={88} ring={u.online ? theme.green : undefined} />
              <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>{u.name}</Text>
              <Text style={{ color: theme.muted }}>@{u.username}{u.country ? ` · ${u.country}` : ''}</Text>
              <Row><Pill color={theme.gold} textColor="#2b1a00">{t('home.level', { n: u.level })}</Pill>{u.stats && <Pill>★ {u.stats.rating}</Pill>}<Pill color={u.online ? '#1f3a24' : theme.card2}>{u.online ? t('friends.online') : t('friends.offline')}</Pill></Row>
            </Card>
            {u.stats && <Card><Row style={{ justifyContent: 'space-around' }}><Text style={{ color: theme.text }}>{u.stats.played} {t('profile.played')}</Text><Text style={{ color: theme.green }}>{u.stats.won} {t('profile.won')}</Text><Text style={{ color: theme.red }}>{u.stats.lost} {t('profile.lost')}</Text></Row></Card>}
            {u.id !== meId && (
              <View style={{ gap: 10 }}>
                <Button title={t('friends.add')} onPress={() => add.mutate()} loading={add.isPending} />
                <Button title={t('game.report')} kind="secondary" onPress={() => router.push(`/report?userId=${u.id}`)} />
                <Button title={t('friends.block')} kind="danger" onPress={() => Alert.alert(u.username, t('friends.block') + '?', [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.yes'), style: 'destructive', onPress: () => block.mutate() }])} />
              </View>
            )}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
