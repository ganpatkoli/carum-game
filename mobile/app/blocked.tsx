import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { api } from '../src/api/client';
import { useT } from '../src/i18n';
import { Avatar, Button, Card, QueryView, Row, Screen, SkeletonList } from '../src/ui/kit';
import { theme } from '../src/ui/theme';

export default function Blocked() {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['blocked'], queryFn: () => api<{ id: string; username: string; avatarId: string }[]>('/blocks') });
  const unblock = useMutation({ mutationFn: (id: string) => api(`/blocks/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['blocked'] }) });
  return (
    <Screen title={t('settings.blocked')}>
      <QueryView query={q} skeleton={<SkeletonList rows={3} />} isEmpty={(d) => d.length === 0} emptyText={t('settings.noBlocked')}>
        {(list) => <View style={{ gap: 10 }}>{list.map((u) => <Card key={u.id}><Row><Avatar avatarId={u.avatarId} size={42} /><Text style={{ color: theme.text, flex: 1, fontWeight: '700' }}>{u.username}</Text><Button title={t('settings.unblock')} kind="secondary" style={{ paddingVertical: 8 }} onPress={() => unblock.mutate(u.id)} /></Row></Card>)}</View>}
      </QueryView>
    </Screen>
  );
}
