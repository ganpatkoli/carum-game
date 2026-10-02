import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerAdPresenter } from '../ads/ads';
import { api } from '../api/client';
import { play } from '../audio/sounds';
import { useT } from '../i18n';
import { getSocket } from '../net/socket';
import { useAuth } from '../store/auth';
import { Button, Row } from './kit';
import { toast } from './toast';
import { theme } from './theme';

const REWARDED_SECONDS = 16; // the server requires the ad to have been "watched" for at least 15 s

/** Mock ad surface used in development / Expo Go (swap the provider in ads.ts for AdMob in production). */
export function AdHost() {
  const t = useT();
  const [ad, setAd] = useState<null | { kind: 'interstitial' | 'rewarded'; resolve: (watched: boolean) => void }>(null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    registerAdPresenter((kind) => new Promise<boolean>((resolve) => { setLeft(kind === 'rewarded' ? REWARDED_SECONDS : 3); setAd({ kind, resolve }); }));
    return () => registerAdPresenter(null);
  }, []);
  useEffect(() => {
    if (!ad) return;
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, [ad]);
  const close = (watched: boolean) => { ad?.resolve(watched); setAd(null); };
  return (
    <Modal visible={!!ad} animationType="fade" onRequestClose={() => close(false)}>
      <View style={{ flex: 1, backgroundColor: '#0b0b0f', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <Text style={{ color: theme.muted }}>{t('ad.label')}</Text>
        <Text style={{ fontSize: 64 }}>📺</Text>
        <Text style={{ color: '#fff', fontSize: 18 }}>{t('ad.watching')} {left > 0 ? `${left}s` : ''}</Text>
        {left === 0 && <Button title={t('ad.skip')} onPress={() => close(true)} />}
        {ad?.kind === 'rewarded' && left > 0 && <Button title={t('common.cancel')} kind="ghost" onPress={() => close(false)} />}
      </View>
    </Modal>
  );
}

interface Invite { id: string; title: string; body: string; code: string }

/** Realtime in-app notifications: toast + sound, and a tappable popup for game invites. */
export function NotificationHost() {
  const t = useT();
  const qc = useQueryClient();
  const status = useAuth((s) => s.status);
  const insets = useSafeAreaInsets();
  const [invite, setInvite] = useState<Invite | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== 'signedIn') return;
    const s = getSocket();
    const onNotif = (n: { id: string; kind: string; title: string; body: string; data?: { code?: string } }) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (n.kind === 'game_invite' && n.data?.code) {
        play('notification');
        setInvite({ id: n.id, title: n.title, body: n.body, code: n.data.code });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setInvite(null), 15000);
      } else { play('notification', 0.6); toast(`${n.title}: ${n.body}`); }
    };
    s.on('notification', onNotif);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const code = (r.notification.request.content.data as any)?.code;
      if (code) router.push(`/room/join?code=${code}`);
    });
    return () => { s.off('notification', onNotif); sub.remove(); };
  }, [status, qc]);

  if (!invite) return null;
  const accept = async () => {
    const code = invite.code; setInvite(null);
    try { await api('/rooms/join', { json: { code } }); router.push(`/room/${code}`); } catch { toast(t('room.notFound'), 'error'); }
  };
  return (
    <Animated.View entering={SlideInUp} exiting={SlideOutUp} style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, backgroundColor: theme.card2, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: theme.gold, zIndex: 1000 }}>
      <Text style={{ color: theme.text, fontWeight: '800' }}>🎮 {invite.title}</Text>
      <Text style={{ color: theme.muted }}>{invite.body}</Text>
      <Row><Button title={t('friends.accept')} onPress={accept} style={{ flex: 1 }} /><Button title={t('friends.reject')} kind="secondary" onPress={() => setInvite(null)} style={{ flex: 1 }} /></Row>
    </Animated.View>
  );
}
