import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useT, type Key } from '../../src/i18n';
import { useConfig } from '../../src/store/config';
import { Avatar, Card, Empty, QueryView, Row, Screen, Segmented, SkeletonList } from '../../src/ui/kit';
import { useLeaderboard, type LbRow } from '../../src/ui/queries';
import { theme } from '../../src/ui/theme';

const MEDAL = ['🥇', '🥈', '🥉'];

function RowItem({ r, period, highlight }: { r: LbRow; period: boolean; highlight?: boolean }) {
  const t = useT();
  return (
    <Pressable onPress={() => router.push(`/user/${r.userId}`)}>
      <Card style={{ paddingVertical: 10, borderColor: highlight ? theme.gold : theme.border }}>
        <Row>
          <Text style={{ width: 34, color: theme.gold, fontWeight: '900', fontSize: r.rank <= 3 ? 20 : 15 }}>{r.rank <= 3 ? MEDAL[r.rank - 1] : `#${r.rank}`}</Text>
          <Avatar avatarId={r.avatarId} imageUrl={r.imageUrl} size={38} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '800' }} numberOfLines={1}>{r.username}</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Lv {r.level} · {r.xp} {t('game.xp')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: theme.text, fontWeight: '800' }}>★ {r.rating}</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{period ? r.periodWins ?? 0 : r.wins} {t('lb.wins')}</Text>
          </View>
        </Row>
      </Card>
    </Pressable>
  );
}

export default function Leaderboard() {
  const t = useT();
  const periods = useConfig((s) => s.config.leaderboardPeriods);
  const boards = (['global', 'weekly', 'monthly', 'friends', 'country', 'local'] as const).filter((b) => periods[b]);
  const [board, setBoard] = useState<string>('global');
  const q = useLeaderboard(board, 50);
  const isPeriod = board === 'weekly' || board === 'monthly';

  return (
    <Screen title={t('tab.leaderboard')} noBack scroll={false} padded={false}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><Segmented value={board} onChange={setBoard} options={boards.map((b) => ({ value: b, label: t(`lb.${b}` as Key) }))} /></View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={theme.gold} />}>
        <QueryView query={q} skeleton={<SkeletonList rows={8} height={60} />} isEmpty={(d) => d.rows.length === 0} emptyText={board === 'country' || board === 'local' ? t('lb.noCountry') : t('state.empty')}>
          {(d) => (
            <>
              {d.me && <Card style={{ backgroundColor: '#3a2410', borderColor: theme.gold }}><Text style={{ color: theme.gold, fontWeight: '800' }}>{t('lb.you')}: #{d.me.rank}</Text></Card>}
              {d.rows.map((r) => <RowItem key={r.userId} r={r} period={isPeriod} highlight={r.userId === d.me?.userId} />)}
            </>
          )}
        </QueryView>
        <Empty message="" icon="" />
      </ScrollView>
    </Screen>
  );
}
