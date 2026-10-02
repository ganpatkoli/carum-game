import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { api, errorMessage } from '../src/api/client';
import { useT } from '../src/i18n';
import { Avatar, Button, Card, Empty, Input, QueryView, Row, Screen, Segmented, SkeletonList } from '../src/ui/kit';
import { toast } from '../src/ui/toast';
import { theme } from '../src/ui/theme';

interface Friend { id: string; username: string; avatarId: string; imageUrl: string | null; level: number; rating: number; online: boolean }
interface Requests { incoming: { id: string; from: { id: string; username: string; avatarId: string } }[]; outgoing: { id: string; to: { id: string; username: string; avatarId: string } }[] }
interface Found { id: string; username: string; avatarId: string; imageUrl: string | null; level: number }

export default function Friends() {
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'friends' | 'requests' | 'add'>('friends');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = setTimeout(() => setDebounced(query.trim()), 350); return () => clearTimeout(id); }, [query]);

  const friends = useQuery({ queryKey: ['friends'], queryFn: () => api<Friend[]>('/friends'), refetchInterval: 15_000 });
  const reqs = useQuery({ queryKey: ['friend-requests'], queryFn: () => api<Requests>('/friends/requests') });
  const search = useQuery({ queryKey: ['user-search', debounced], queryFn: () => api<Found[]>(`/users/search?q=${encodeURIComponent(debounced)}`), enabled: debounced.length >= 2 });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['friends'] }); qc.invalidateQueries({ queryKey: ['friend-requests'] }); };
  const fail = (e: unknown) => toast(errorMessage(e, t('net.error')), 'error');

  const add = useMutation({ mutationFn: (id: string) => api<{ status: string }>('/friends/requests', { json: { toUserId: id } }), onSuccess: (r) => { toast(r.status === 'ACCEPTED' ? t('friends.accepted') : t('friends.sent'), 'success'); refresh(); }, onError: fail });
  const respond = useMutation({ mutationFn: (v: { id: string; ok: boolean }) => api(`/friends/requests/${v.id}/${v.ok ? 'accept' : 'reject'}`, { json: {} }), onSuccess: refresh, onError: fail });
  const invite = useMutation({ mutationFn: (id: string) => api<{ code: string }>('/rooms/invite', { json: { friendId: id } }), onSuccess: (r) => { toast(t('friends.invited'), 'success'); router.push(`/room/${r.code}`); }, onError: fail });
  const remove = useMutation({ mutationFn: (id: string) => api(`/friends/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError: fail });
  const block = useMutation({ mutationFn: (id: string) => api('/blocks', { json: { userId: id } }), onSuccess: refresh, onError: fail });

  const menu = (f: Friend) => Alert.alert(f.username, undefined, [
    { text: t('friends.remove'), onPress: () => remove.mutate(f.id) },
    { text: t('friends.block'), style: 'destructive', onPress: () => block.mutate(f.id) },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
  const pending = reqs.data?.incoming.length ?? 0;

  return (
    <Screen title={t('friends.title')}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'friends', label: t('friends.title') }, { value: 'requests', label: `${t('friends.requests')}${pending ? ` (${pending})` : ''}` }, { value: 'add', label: t('friends.add') }]} />

      {tab === 'friends' && (
        <QueryView query={friends} skeleton={<SkeletonList rows={5} />} isEmpty={(d) => d.length === 0} emptyText={t('friends.none')}>
          {(list) => <View style={{ gap: 10 }}>{list.map((f) => (
            <Pressable key={f.id} onLongPress={() => menu(f)} onPress={() => router.push(`/user/${f.id}`)}>
              <Card>
                <Row>
                  <View><Avatar avatarId={f.avatarId} imageUrl={f.imageUrl} size={46} /><View style={{ position: 'absolute', right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, backgroundColor: f.online ? theme.green : theme.muted, borderWidth: 2, borderColor: theme.card }} /></View>
                  <View style={{ flex: 1 }}><Text style={{ color: theme.text, fontWeight: '800' }}>{f.username}</Text><Text style={{ color: theme.muted, fontSize: 12 }}>Lv {f.level} · ★ {f.rating} · {f.online ? t('friends.online') : t('friends.offline')}</Text></View>
                  <Button title={t('friends.invite')} style={{ paddingVertical: 8 }} onPress={() => invite.mutate(f.id)} disabled={!f.online || invite.isPending} />
                </Row>
              </Card>
            </Pressable>))}</View>}
        </QueryView>
      )}

      {tab === 'requests' && (
        <QueryView query={reqs} skeleton={<SkeletonList rows={3} />} isEmpty={(d) => d.incoming.length + d.outgoing.length === 0}>
          {(d) => <View style={{ gap: 10 }}>
            {d.incoming.map((r) => <Card key={r.id}><Row><Avatar avatarId={r.from.avatarId} size={42} /><Text style={{ color: theme.text, flex: 1, fontWeight: '700' }}>{r.from.username}</Text><Button title={t('friends.accept')} style={{ paddingVertical: 8 }} onPress={() => respond.mutate({ id: r.id, ok: true })} /><Button title="✕" kind="secondary" style={{ paddingVertical: 8 }} onPress={() => respond.mutate({ id: r.id, ok: false })} /></Row></Card>)}
            {d.outgoing.map((r) => <Card key={r.id}><Row><Avatar avatarId={r.to.avatarId} size={42} /><Text style={{ color: theme.text, flex: 1 }}>{r.to.username}</Text><Text style={{ color: theme.muted }}>{t('friends.outgoing')}</Text></Row></Card>)}
          </View>}
        </QueryView>
      )}

      {tab === 'add' && (
        <>
          <Input placeholder={t('friends.search')} value={query} onChangeText={setQuery} />
          {debounced.length >= 2 && (
            <QueryView query={search} skeleton={<SkeletonList rows={3} />} isEmpty={(d) => d.length === 0} emptyText={t('friends.noResults')}>
              {(list) => <View style={{ gap: 10 }}>{list.map((u) => <Card key={u.id}><Row><Avatar avatarId={u.avatarId} imageUrl={u.imageUrl} size={42} /><View style={{ flex: 1 }}><Text style={{ color: theme.text, fontWeight: '700' }}>{u.username}</Text><Text style={{ color: theme.muted, fontSize: 12 }}>Lv {u.level}</Text></View><Button title={t('friends.add')} style={{ paddingVertical: 8 }} onPress={() => add.mutate(u.id)} /></Row></Card>)}</View>}
            </QueryView>
          )}
          {debounced.length < 2 && <Empty icon="🔍" message={t('friends.search')} />}
        </>
      )}
    </Screen>
  );
}
