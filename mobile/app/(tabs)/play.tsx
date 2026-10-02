import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useT, type Key } from '../../src/i18n';
import { useAuth } from '../../src/store/auth';
import { useConfig } from '../../src/store/config';
import { Button, Card, Row, Screen, SectionTitle, Segmented } from '../../src/ui/kit';
import { toast } from '../../src/ui/toast';
import { theme } from '../../src/ui/theme';

const Mode = ({ icon, title, sub, onPress }: { icon: string; title: string; sub: string; onPress: () => void }) => (
  <Card onPress={onPress}><Row><Text style={{ fontSize: 32 }}>{icon}</Text><View style={{ flex: 1 }}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{title}</Text><Text style={{ color: theme.muted }}>{sub}</Text></View><Text style={{ color: theme.muted, fontSize: 22 }}>›</Text></Row></Card>
);

export default function Play() {
  const t = useT();
  const balance = useAuth((s) => s.me?.balance ?? 0);
  const entries = useConfig((s) => s.config.game.entryOptions);
  const [entry, setEntry] = useState('0');
  const [ai, setAi] = useState(false);
  const cost = Number(entry);

  return (
    <Screen title={t('play.title')} noBack>
      <Card style={{ gap: 10 }}>
        <Row><Text style={{ fontSize: 28 }}>⚡</Text><View style={{ flex: 1 }}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{t('play.quick')}</Text><Text style={{ color: theme.muted }}>{t('play.quickSub')}</Text></View></Row>
        <Text style={{ color: theme.muted, fontSize: 13 }}>{t('play.entry')}</Text>
        <Segmented value={entry} onChange={setEntry} options={entries.map((n) => ({ value: String(n), label: n === 0 ? t('play.free') : `🪙 ${n}` }))} />
        {cost > 0 && <Text style={{ color: theme.gold, fontSize: 12 }}>{balance < cost ? t('play.notEnough') : t('play.pot', { n: cost * 2 })}</Text>}
        <Button title={t('home.quickPlay')} onPress={() => (balance < cost ? toast(t('play.notEnough'), 'error') : router.push(`/matchmaking?entry=${cost}`))} />
      </Card>
      <Mode icon="🤝" title={t('play.friend')} sub={t('play.friendSub')} onPress={() => router.push('/friends')} />
      <Mode icon="🔑" title={t('play.room')} sub={t('play.roomSub')} onPress={() => router.push('/room/create')} />
      <Row><Button title={t('room.join')} kind="secondary" style={{ flex: 1 }} onPress={() => router.push('/room/join')} /></Row>
      <Mode icon="🤖" title={t('play.ai')} sub={t('play.aiSub')} onPress={() => setAi((v) => !v)} />
      {ai && (
        <Card style={{ gap: 10 }}>
          <SectionTitle>{t('play.ai')}</SectionTitle>
          {(['easy', 'medium', 'hard', 'expert'] as const).map((d) => <Button key={d} title={t(`play.${d}` as Key)} kind="secondary" onPress={() => router.push(`/game?difficulty=${d}`)} />)}
          <Text style={{ color: theme.muted, fontSize: 12 }}>{t('play.practiceNote')}</Text>
        </Card>
      )}
    </Screen>
  );
}
