import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { API_URL, api, errorMessage } from '../../src/api/client';
import { useT, type Key } from '../../src/i18n';
import { Button, Card, Input, Pill, QueryView, Row, Screen, SkeletonList } from '../../src/ui/kit';
import { toast } from '../../src/ui/toast';
import { theme } from '../../src/ui/theme';

interface Detail { id: string; category: string; status: string; description: string; screenshotUrl: string | null; messages: { id: string; fromSupport: boolean; body: string; createdAt: string }[] }

export default function TicketDetail() {
  const t = useT();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reply, setReply] = useState('');
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => api<Detail>(`/support/tickets/${id}`), refetchInterval: 20_000 });
  const send = useMutation({ mutationFn: () => api(`/support/tickets/${id}/messages`, { json: { body: reply.trim() } }), onSuccess: () => { setReply(''); qc.invalidateQueries({ queryKey: ['ticket', id] }); }, onError: (e) => toast(errorMessage(e, t('net.error')), 'error') });
  return (
    <Screen title={t('support.title')}>
      <QueryView query={q} skeleton={<SkeletonList rows={3} height={80} />}>
        {(d) => (
          <>
            <Card style={{ gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: theme.text, fontWeight: '800' }}>{t(`support.cat.${d.category}` as Key)}</Text><Pill>{t(`support.status.${d.status}` as Key)}</Pill></Row>
              <Text style={{ color: theme.text }}>{d.description}</Text>
              {d.screenshotUrl && <Image source={{ uri: API_URL + d.screenshotUrl }} style={{ width: 160, height: 160, borderRadius: 12 }} />}
            </Card>
            <View style={{ gap: 8 }}>{d.messages.map((m) => (
              <View key={m.id} style={{ alignSelf: m.fromSupport ? 'flex-start' : 'flex-end', maxWidth: '85%', backgroundColor: m.fromSupport ? theme.card2 : '#3a2410', borderRadius: 14, padding: 10 }}>
                {m.fromSupport && <Text style={{ color: theme.gold, fontSize: 11, fontWeight: '800' }}>{t('support.fromSupport')}</Text>}
                <Text style={{ color: theme.text }}>{m.body}</Text>
              </View>))}</View>
            {d.status !== 'CLOSED' && <><Input placeholder={t('support.reply')} value={reply} onChangeText={setReply} multiline /><Button title={t('common.send')} onPress={() => send.mutate()} loading={send.isPending} disabled={!reply.trim()} /></>}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
