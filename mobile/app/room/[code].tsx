import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { api, errorMessage } from '../../src/api/client';
import { attachMatchListeners, useMatch } from '../../src/game/matchStore';
import { useT } from '../../src/i18n';
import { emitAck, getSocket } from '../../src/net/socket';
import { useAuth } from '../../src/store/auth';
import { Avatar, Button, Card, QueryView, Row, Screen, SectionTitle } from '../../src/ui/kit';
import { toast } from '../../src/ui/toast';
import { theme } from '../../src/ui/theme';

interface Room { code: string; hostId: string; status: string; maxPlayers: number; entryCoins: number; boardTheme: string; durationSec: number | null; players: { userId: string; ready: boolean; username?: string; avatarId?: string }[] }

/** Private-room lobby: share the code, wait for players, ready up, host starts. */
export default function RoomLobby() {
  const t = useT();
  const { code } = useLocalSearchParams<{ code: string }>();
  const me = useAuth((s) => s.me);
  const qc = useQueryClient();
  const phase = useMatch((s) => s.phase);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['room', code], queryFn: () => api<Room>(`/rooms/${code}`), refetchInterval: 4000 });

  useEffect(() => {
    attachMatchListeners();
    const s = getSocket();
    const refresh = () => qc.invalidateQueries({ queryKey: ['room', code] });
    void emitAck('room_join', { code }).catch(() => {});
    s.on('player_joined', refresh); s.on('player_ready', refresh); s.on('player_left', refresh);
    return () => { s.off('player_joined', refresh); s.off('player_ready', refresh); s.off('player_left', refresh); };
  }, [code, qc]);
  useEffect(() => { if (phase === 'playing') router.replace('/online'); }, [phase]);

  const room = q.data;
  const isHost = room?.hostId === me?.id;
  const mine = room?.players.find((p) => p.userId === me?.id);
  const full = room ? room.players.length === room.maxPlayers : false;
  const allReady = room ? room.players.every((p) => p.userId === room.hostId || p.ready) : false;

  const leave = async () => { getSocket().emit('room_leave', { code }); await api(`/rooms/${code}/leave`, { json: {} }).catch(() => {}); router.back(); };
  const start = async () => {
    setBusy(true);
    try {
      const r = await emitAck<{ ok: boolean; reason?: string }>('room_start', { code });
      if (!r.ok) toast(r.reason === 'not_ready' ? t('room.waitingReady') : r.reason === 'not_full' ? t('room.waiting') : t('net.error'), 'error');
    } catch (e) { toast(errorMessage(e, t('net.error')), 'error'); } finally { setBusy(false); }
  };

  return (
    <Screen title={t('room.code')}>
      <QueryView query={q}>
        {(r) => (
          <>
            <Card style={{ alignItems: 'center', gap: 8 }}>
              <Text style={{ color: theme.gold, fontSize: 32, fontWeight: '900', letterSpacing: 2 }} accessibilityLabel={r.code}>{r.code}</Text>
              <Row>
                <Button title={t('common.copy')} kind="secondary" onPress={async () => { await Clipboard.setStringAsync(r.code); toast(t('common.copy'), 'success'); }} />
                <Button title={t('common.share')} kind="secondary" onPress={() => Share.share({ message: t('room.share', { code: r.code }) })} />
              </Row>
              <Text style={{ color: theme.muted }}>{r.entryCoins > 0 ? `🪙 ${r.entryCoins}` : t('play.free')} · {r.durationSec ? t('room.minutes', { n: Math.round(r.durationSec / 60) }) : t('room.noLimit')} · {r.boardTheme}</Text>
            </Card>
            <SectionTitle>{t('room.players')} ({r.players.length}/{r.maxPlayers})</SectionTitle>
            {r.players.map((p) => (
              <Card key={p.userId}>
                <Row>
                  <Avatar avatarId={p.avatarId} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '800' }}>{p.username}{p.userId === me?.id ? ` (${t('common.you')})` : ''}</Text>
                    {p.userId === r.hostId && <Text style={{ color: theme.gold, fontSize: 12 }}>{t('room.host')}</Text>}
                  </View>
                  <Text style={{ color: p.userId === r.hostId || p.ready ? theme.green : theme.muted, fontWeight: '700' }}>{p.userId === r.hostId || p.ready ? t('room.ready') : t('room.notReady')}</Text>
                </Row>
              </Card>
            ))}
            {!full && <Text style={{ color: theme.muted, textAlign: 'center' }}>{t('room.waiting')}</Text>}
            {isHost
              ? <Button title={t('room.start')} onPress={start} loading={busy} disabled={!full || !allReady} />
              : <Button title={mine?.ready ? t('room.notReady') : t('room.ready')} onPress={() => emitAck('room_ready', { code, ready: !mine?.ready })} kind={mine?.ready ? 'secondary' : 'primary'} />}
            <Button title={t('room.leave')} kind="ghost" onPress={leave} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
