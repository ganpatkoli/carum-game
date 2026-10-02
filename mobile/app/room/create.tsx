import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api, errorMessage } from '../../src/api/client';
import { useT } from '../../src/i18n';
import { useConfig } from '../../src/store/config';
import { Button, Card, Row, Screen, SectionTitle, Segmented } from '../../src/ui/kit';
import { toast } from '../../src/ui/toast';
import { theme } from '../../src/ui/theme';
import { boardThemes } from '../../src/ui/theme';

/** Create a private room: 2 or 4 players, length, entry coins, board and rules. */
export default function CreateRoom() {
  const t = useT();
  const cfg = useConfig((s) => s.config);
  const [players, setPlayers] = useState<'2' | '4'>('2');
  const [duration, setDuration] = useState('0');
  const [entry, setEntry] = useState(String(0));
  const [board, setBoard] = useState('classic');
  const [queenCover, setQueenCover] = useState(cfg.rules.queenCoverRequired);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const room = await api<{ code: string }>('/rooms', { json: { maxPlayers: Number(players), entryCoins: Number(entry), boardTheme: board, durationSec: Number(duration) || undefined, rules: { queenCoverRequired: queenCover } } });
      router.replace(`/room/${room.code}`);
    } catch (e) { toast(errorMessage(e, t('net.error')), 'error'); } finally { setBusy(false); }
  };

  return (
    <Screen title={t('room.create')}>
      <Card style={{ gap: 12 }}>
        <SectionTitle>{t('room.players')}</SectionTitle>
        <Segmented value={players} onChange={setPlayers} options={[{ value: '2', label: t('room.p2') }, { value: '4', label: t('room.p4') }]} />
        <SectionTitle>{t('room.duration')}</SectionTitle>
        <Segmented value={duration} onChange={setDuration} options={[{ value: '0', label: t('room.noLimit') }, ...[3, 5, 10].map((m) => ({ value: String(m * 60), label: t('room.minutes', { n: m }) }))]} />
        <SectionTitle>{t('room.entry')}</SectionTitle>
        <Segmented value={entry} onChange={setEntry} options={[0, 50, 100, 500, 1000].map((n) => ({ value: String(n), label: n === 0 ? t('play.free') : String(n) }))} />
        <SectionTitle>{t('room.board')}</SectionTitle>
        <Segmented value={board} onChange={setBoard} options={Object.keys(boardThemes).map((b) => ({ value: b, label: b }))} />
        <SectionTitle>{t('room.rules')}</SectionTitle>
        <Segmented value={queenCover ? 'y' : 'n'} onChange={(v) => setQueenCover(v === 'y')} options={[{ value: 'y', label: t('room.queenCover') }, { value: 'n', label: '—' }]} />
      </Card>
      <Row style={{ justifyContent: 'center' }}><Text style={{ color: theme.muted }}>{Number(entry) > 0 ? t('play.pot', { n: Number(entry) * Number(players) }) : ''}</Text></Row>
      <Button title={t('room.create')} onPress={create} loading={busy} />
      <View />
    </Screen>
  );
}
