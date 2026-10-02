import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useT } from '../../src/i18n';
import { useAuth } from '../../src/store/auth';
import { Avatar, Button, Card, Pill, Row, Screen, SectionTitle, Skeleton } from '../../src/ui/kit';
import { theme } from '../../src/ui/theme';

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <View style={{ flexBasis: '30%', flexGrow: 1, backgroundColor: theme.card2, borderRadius: 12, padding: 10, alignItems: 'center' }}>
    <Text style={{ color: theme.text, fontWeight: '900', fontSize: 18 }}>{value}</Text>
    <Text style={{ color: theme.muted, fontSize: 11, textAlign: 'center' }}>{label}</Text>
  </View>
);
const Link = ({ icon, label, to }: { icon: string; label: string; to: string }) => (
  <Card onPress={() => router.push(to as any)} style={{ paddingVertical: 12 }}><Row><Text style={{ fontSize: 20 }}>{icon}</Text><Text style={{ color: theme.text, flex: 1, fontWeight: '700' }}>{label}</Text><Text style={{ color: theme.muted }}>›</Text></Row></Card>
);

export default function Profile() {
  const t = useT();
  const me = useAuth((s) => s.me);
  if (!me) return <Screen title={t('tab.profile')} noBack><Skeleton height={120} radius={16} /><Skeleton height={200} radius={16} /></Screen>;
  const p = me.profile;
  return (
    <Screen title={t('tab.profile')} noBack right={<Button title="⚙" kind="ghost" onPress={() => router.push('/settings')} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />}>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <Avatar avatarId={p.avatarId} imageUrl={p.imageUrl} size={88} ring={theme.gold} />
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>{p.name}</Text>
        <Text style={{ color: theme.muted }}>@{p.username} · {t('profile.playerId')} {me.playerId}</Text>
        <Row><Pill color={theme.gold} textColor="#2b1a00">{t('home.level', { n: p.level })}</Pill><Pill>★ {me.rating.rating}</Pill><Pill>#{me.ranking}</Pill></Row>
        <View style={{ height: 8, alignSelf: 'stretch', borderRadius: 4, backgroundColor: theme.card2, overflow: 'hidden', marginTop: 4 }}><View style={{ width: `${Math.min(100, (p.xpIntoLevel / Math.max(1, p.xpForNext)) * 100)}%`, height: 8, backgroundColor: theme.gold }} /></View>
        <Text style={{ color: theme.muted, fontSize: 12 }}>{p.xpIntoLevel}/{p.xpForNext} {t('game.xp')}</Text>
        <Button title={t('profile.edit')} kind="secondary" onPress={() => router.push('/edit-profile')} />
      </Card>

      <SectionTitle>{t('profile.stats')}</SectionTitle>
      <Row style={{ flexWrap: 'wrap' }}>
        <Stat label={t('profile.played')} value={p.matchesPlayed} /><Stat label={t('profile.won')} value={p.matchesWon} /><Stat label={t('profile.lost')} value={p.matchesLost} />
        <Stat label={t('profile.draws')} value={p.draws} /><Stat label={t('profile.winRate')} value={`${p.winRate}%`} /><Stat label={t('profile.bestScore')} value={p.bestScore} />
        <Stat label={t('profile.streak')} value={p.currentStreak} /><Stat label={t('profile.longest')} value={p.longestStreak} /><Stat label={t('profile.ranking')} value={`#${me.ranking}`} />
        <Stat label={t('profile.earned')} value={me.wallet.earned} /><Stat label={t('profile.spent')} value={me.wallet.spent} /><Stat label={t('profile.rating')} value={`${me.rating.highest} ↑`} />
      </Row>

      <Link icon="🏅" label={`${t('profile.achievements')} (${me.achievementsUnlocked})`} to="/achievements" />
      <Link icon="🛍" label={t('shop.title')} to="/shop" />
      <Link icon="🪙" label={t('wallet.title')} to="/wallet" />
      <Link icon="🤝" label={t('friends.title')} to="/friends" />
      <Link icon="🔔" label={t('notif.title')} to="/notifications" />
      <Link icon="💬" label={t('settings.help')} to="/support" />
      <Link icon="⚙️" label={t('settings.title')} to="/settings" />
    </Screen>
  );
}
