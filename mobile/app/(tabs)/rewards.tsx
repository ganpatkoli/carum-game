import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { watchRewardedAd } from '../../src/ads/ads';
import { api, ApiError, errorMessage } from '../../src/api/client';
import { play } from '../../src/audio/sounds';
import { useT } from '../../src/i18n';
import { useAuth } from '../../src/store/auth';
import { useConfig } from '../../src/store/config';
import { Button, Card, QueryView, Row, Screen, SectionTitle, SkeletonList } from '../../src/ui/kit';
import { haptic } from '../../src/ui/haptics';
import { useDaily, useMissions } from '../../src/ui/queries';
import { toast } from '../../src/ui/toast';
import { theme } from '../../src/ui/theme';

export default function Rewards() {
  const t = useT();
  const qc = useQueryClient();
  const ads = useConfig((s) => s.config.ads);
  const daily = useDaily();
  const missions = useMissions();
  const [burst, setBurst] = useState<number | null>(null);
  const afterReward = (coins: number) => { play('reward'); haptic('success'); setBurst(coins); setTimeout(() => setBurst(null), 1800); void useAuth.getState().refreshMe(); qc.invalidateQueries({ queryKey: ['wallet'] }); };

  const claimDaily = useMutation({ mutationFn: () => api<{ day: number; amount: number }>('/rewards/daily/claim', { method: 'POST', json: {} }), onSuccess: (r) => { afterReward(r.amount); daily.refetch(); }, onError: (e) => toast(errorMessage(e, t('net.error')), 'error') });
  const claimMission = useMutation({ mutationFn: (id: string) => api<{ rewardCoins: number }>(`/missions/${id}/claim`, { method: 'POST', json: {} }), onSuccess: (r) => { afterReward(r.rewardCoins); missions.refetch(); }, onError: (e) => toast(errorMessage(e, t('net.error')), 'error') });
  const ad = useMutation({
    mutationFn: watchRewardedAd,
    onSuccess: (r) => { if (r) afterReward(r.coins); },
    onError: (e) => toast(e instanceof ApiError && e.status === 429 ? t('rewards.adCooldown') : e instanceof ApiError && e.status === 403 ? t('rewards.adUnavailable') : errorMessage(e, t('net.error')), 'error'),
  });

  return (
    <Screen title={t('rewards.title')} noBack>
      {burst !== null && <Animated.View entering={ZoomIn} style={{ alignSelf: 'center', backgroundColor: theme.gold, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10 }}><Text style={{ color: '#2b1a00', fontWeight: '900', fontSize: 22 }}>🪙 {t('rewards.got', { n: burst })}</Text></Animated.View>}

      <SectionTitle>{t('rewards.daily')}</SectionTitle>
      <QueryView query={daily} skeleton={<SkeletonList rows={2} height={80} />}>
        {(d) => (
          <Card style={{ gap: 12 }}>
            <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              {d.rewards.map((amount, i) => {
                const day = i + 1; const done = d.claimedToday ? day <= d.streak : day < d.nextDay; const today = !d.claimedToday && day === d.nextDay;
                return (
                  <View key={day} style={{ width: '22%', minWidth: 70, alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: today ? theme.gold : done ? '#1f3a24' : theme.card2, borderWidth: 1, borderColor: today ? '#fff' : theme.border }}>
                    <Text style={{ color: today ? '#2b1a00' : theme.muted, fontSize: 11 }}>{t('rewards.day', { n: day })}</Text>
                    <Text style={{ fontSize: 20 }}>{done ? '✅' : day === 7 ? '🎁' : '🪙'}</Text>
                    <Text style={{ color: today ? '#2b1a00' : theme.text, fontWeight: '800' }}>{amount}</Text>
                  </View>
                );
              })}
            </Row>
            <Button title={d.canClaim ? t('rewards.claim') : t('rewards.comeBack')} onPress={() => claimDaily.mutate()} disabled={!d.canClaim} loading={claimDaily.isPending} />
          </Card>
        )}
      </QueryView>

      {ads.enabled && ads.rewardedEnabled && ads.rewardedCoins > 0 && <Button title={`📺 ${t('rewards.watchAd', { n: ads.rewardedCoins })}`} kind="secondary" onPress={() => ad.mutate()} loading={ad.isPending} />}

      <SectionTitle right={<Pressable onPress={() => router.push('/achievements')}><Text style={{ color: theme.gold }}>{t('rewards.achievements')} ›</Text></Pressable>}>{t('rewards.missions')}</SectionTitle>
      <QueryView query={missions} skeleton={<SkeletonList rows={4} height={64} />}>
        {(list) => <View style={{ gap: 10 }}>{list.map((m) => (
          <Card key={m.id} style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: theme.text, fontWeight: '700', flex: 1 }}>{m.title}</Text><Text style={{ color: theme.gold, fontWeight: '800' }}>+{m.rewardCoins} 🪙</Text></Row>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.card2, overflow: 'hidden' }}><View style={{ width: `${(Math.min(m.progress, m.target) / m.target) * 100}%`, height: 8, backgroundColor: m.claimed ? theme.muted : theme.green }} /></View>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{m.progress}/{m.target}</Text>
              {m.claimed ? <Text style={{ color: theme.muted }}>{t('rewards.claimed')}</Text> : <Button title={t('rewards.claim')} onPress={() => claimMission.mutate(m.id)} disabled={!m.claimable} style={{ paddingVertical: 6 }} />}
            </Row>
          </Card>))}</View>}
      </QueryView>
      <Row><Button title={`🪙 ${t('wallet.title')}`} kind="secondary" style={{ flex: 1 }} onPress={() => router.push('/wallet')} /><Button title={`🛍 ${t('shop.title')}`} kind="secondary" style={{ flex: 1 }} onPress={() => router.push('/shop')} /></Row>
    </Screen>
  );
}
