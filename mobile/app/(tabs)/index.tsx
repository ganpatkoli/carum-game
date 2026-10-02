import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { api } from '../../src/api/client';
import { useT } from '../../src/i18n';
import { useAuth } from '../../src/store/auth';
import { useConfig } from '../../src/store/config';
import { Avatar, Card, Empty, QueryView, Row, SectionTitle, SkeletonList, Pill } from '../../src/ui/kit';
import { useDaily, useLeaderboard, useMissions, useUnread } from '../../src/ui/queries';
import { theme } from '../../src/ui/theme';

interface RecentMatch { matchId: string; result: 'win' | 'loss' | 'draw'; score: number; opponentScore: number; ratingChange: number; ranked: boolean; opponents: { username: string; avatarId: string }[] }

const ModeCard = ({ icon, label, onPress, accent }: { icon: string; label: string; onPress: () => void; accent?: boolean }) => (
  <Card onPress={onPress} style={{ flexBasis: '47%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 20, backgroundColor: accent ? theme.gold : theme.card }}>
    <Text style={{ fontSize: 30 }}>{icon}</Text>
    <Text style={{ color: accent ? '#2b1a00' : theme.text, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
  </Card>
);

export default function Home() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.me);
  const brand = useConfig((s) => s.config.branding);
  const unread = useUnread();
  const missions = useMissions();
  const daily = useDaily();
  const lb = useLeaderboard('global', 3);
  const recent = useQuery({ queryKey: ['recent'], queryFn: () => api<RecentMatch[]>('/me/matches?limit=5') });
  const refreshing = missions.isRefetching || lb.isRefetching || recent.isRefetching;
  const refresh = () => { useAuth.getState().refreshMe(); missions.refetch(); daily.refetch(); lb.refetch(); recent.refetch(); unread.refetch(); };
  const p = me?.profile;
  const nextMission = missions.data?.find((m) => !m.claimed && m.progress < m.target) ?? missions.data?.find((m) => m.claimable);

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.gold} />}>
      <Animated.View entering={FadeInDown.duration(300)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.push('/profile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Avatar avatarId={p?.avatarId} imageUrl={p?.imageUrl} size={52} ring={theme.gold} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }} numberOfLines={1}>{p ? t('home.hello', { name: p.username }) : '…'}</Text>
              <Text style={{ color: theme.muted }}>{t('home.level', { n: p?.level ?? 1 })}</Text>
            </View>
          </Pressable>
          <Pill color={theme.card2} textColor={theme.gold}>🪙 {me?.balance ?? 0}</Pill>
          <Pressable accessibilityLabel={t('notif.title')} onPress={() => router.push('/notifications')} style={{ padding: 8 }}>
            <Text style={{ fontSize: 24 }}>🔔</Text>
            {(unread.data?.unread ?? 0) > 0 && <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: theme.red, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread.data!.unread}</Text></View>}
          </Pressable>
        </Row>
        {p && <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.card2, marginTop: 10, overflow: 'hidden' }}><View style={{ width: `${Math.min(100, (p.xpIntoLevel / Math.max(1, p.xpForNext)) * 100)}%`, height: 6, backgroundColor: theme.gold }} /></View>}
      </Animated.View>

      {p && !p.profileComplete && <Card onPress={() => router.push('/edit-profile?first=1')} style={{ borderColor: theme.gold }}><Text style={{ color: theme.gold, fontWeight: '700' }}>{t('profile.completeBanner')} ›</Text></Card>}

      <Row style={{ flexWrap: 'wrap' }}>
        <ModeCard accent icon="⚡" label={t('home.quickPlay')} onPress={() => router.push('/play')} />
        <ModeCard icon="🤝" label={t('home.friends')} onPress={() => router.push('/friends')} />
        <ModeCard icon="🔑" label={t('home.privateRoom')} onPress={() => router.push('/room/create')} />
        <ModeCard icon="🎯" label={t('home.practice')} onPress={() => router.push('/game?difficulty=easy')} />
      </Row>

      <Card onPress={() => router.push('/rewards')} style={{ gap: 8 }}>
        <SectionTitle right={<Text style={{ color: theme.gold }}>{t('home.streak')}: {t('home.days', { n: daily.data?.streak ?? 0 })} 🔥</Text>}>{t('home.dailyMission')}</SectionTitle>
        {missions.isLoading ? <SkeletonList rows={1} height={40} /> : nextMission ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: theme.text }}>{nextMission.title}</Text><Text style={{ color: theme.gold }}>+{nextMission.rewardCoins} 🪙</Text></Row>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.card2, overflow: 'hidden' }}><View style={{ width: `${(nextMission.progress / nextMission.target) * 100}%`, height: 8, backgroundColor: theme.green }} /></View>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{nextMission.progress}/{nextMission.target}</Text>
          </>
        ) : <Text style={{ color: theme.muted }}>{missions.isError ? t('state.error') : '✅'}</Text>}
      </Card>

      <Card style={{ backgroundColor: '#3a2410', borderColor: theme.gold, gap: 4 }} onPress={() => router.push('/leaderboard')}>
        <Text style={{ color: brand.primaryColor, fontWeight: '900', fontSize: 18 }}>🏆 {t('home.banner')}</Text>
        <Text style={{ color: theme.text }}>{t('home.bannerSub')}</Text>
      </Card>

      <View style={{ gap: 8 }}>
        <SectionTitle right={<Pressable onPress={() => router.push('/leaderboard')}><Text style={{ color: theme.gold }}>{t('home.seeAll')}</Text></Pressable>}>{t('home.leaderboard')}</SectionTitle>
        <QueryView query={lb} skeleton={<SkeletonList rows={3} height={48} />} isEmpty={(d) => d.rows.length === 0}>
          {(d) => <View style={{ gap: 8 }}>{d.rows.map((r) => (
            <Card key={r.userId} onPress={() => router.push(`/user/${r.userId}`)} style={{ paddingVertical: 10 }}>
              <Row><Text style={{ color: theme.gold, width: 28, fontWeight: '900' }}>#{r.rank}</Text><Avatar avatarId={r.avatarId} imageUrl={r.imageUrl} size={34} /><Text style={{ color: theme.text, flex: 1, fontWeight: '700' }} numberOfLines={1}>{r.username}</Text><Text style={{ color: theme.muted }}>★ {r.rating}</Text></Row>
            </Card>))}</View>}
        </QueryView>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('home.recent')}</SectionTitle>
        <QueryView query={recent} skeleton={<SkeletonList rows={2} height={52} />} isEmpty={(d) => d.length === 0} emptyText={t('home.noRecent')}>
          {(d) => <View style={{ gap: 8 }}>{d.map((m) => (
            <Card key={m.matchId} style={{ paddingVertical: 10 }}>
              <Row>
                <Text style={{ width: 54, fontWeight: '900', color: m.result === 'win' ? theme.green : m.result === 'loss' ? theme.red : theme.muted }}>{m.result === 'win' ? t('game.win') : m.result === 'loss' ? t('game.lose') : t('game.draw')}</Text>
                <Text style={{ color: theme.text, flex: 1 }} numberOfLines={1}>vs {m.opponents.map((o) => o.username).join(' & ') || '—'}</Text>
                <Text style={{ color: theme.muted }}>{m.score}–{m.opponentScore}</Text>
                {m.ranked && m.ratingChange !== 0 && <Text style={{ color: m.ratingChange > 0 ? theme.green : theme.red, fontWeight: '700' }}>{m.ratingChange > 0 ? '+' : ''}{m.ratingChange}</Text>}
              </Row>
            </Card>))}</View>}
        </QueryView>
      </View>

      <Card style={{ gap: 4 }}>
        <Text style={{ color: theme.text, fontWeight: '800' }}>✨ {t('home.event')}</Text>
        <Text style={{ color: theme.muted }}>{t('home.eventSub')}</Text>
      </Card>
      <Empty message="" icon="" />
    </ScrollView>
  );
}
