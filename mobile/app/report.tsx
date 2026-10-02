import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ApiError, api, errorMessage } from '../src/api/client';
import { useT, type Key } from '../src/i18n';
import { Button, Card, Input, Screen, Segmented } from '../src/ui/kit';
import { toast } from '../src/ui/toast';

const TYPES = ['CHEATING', 'ABUSE', 'OFFENSIVE', 'SPAM', 'INAPPROPRIATE_USERNAME', 'OTHER'] as const;

export default function Report() {
  const t = useT();
  const { userId, matchId } = useLocalSearchParams<{ userId: string; matchId?: string }>();
  const [type, setType] = useState<(typeof TYPES)[number]>('CHEATING');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/reports', { json: { targetId: userId, type, details: details.trim() || undefined, matchId: matchId || undefined } });
      toast(t('report.sent'), 'success'); router.back();
    } catch (e) { toast(e instanceof ApiError && e.status === 429 ? t('report.already') : errorMessage(e, t('net.error')), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Screen title={t('report.title')}>
      <Card style={{ gap: 12 }}>
        <Segmented value={type} onChange={setType} options={TYPES.map((x) => ({ value: x, label: t(`report.${x}` as Key) }))} />
        <Input label={t('report.details')} value={details} onChangeText={setDetails} multiline maxLength={1000} style={{ minHeight: 90, textAlignVertical: 'top' }} />
      </Card>
      <Button title={t('common.send')} onPress={submit} loading={busy} />
    </Screen>
  );
}
