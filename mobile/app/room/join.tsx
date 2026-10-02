import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { api, errorMessage } from '../../src/api/client';
import { useT } from '../../src/i18n';
import { Button, Input, Screen } from '../../src/ui/kit';
import { toast } from '../../src/ui/toast';

export default function JoinRoom() {
  const t = useT();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? '');
  const [busy, setBusy] = useState(false);
  const valid = /^(CARROM-?)?\d{6}$/i.test(code.trim());

  const join = async () => {
    setBusy(true);
    try {
      const room = await api<{ code: string }>('/rooms/join', { json: { code } });
      router.replace(`/room/${room.code}`);
    } catch (e) { toast(errorMessage(e, t('room.notFound')), 'error'); } finally { setBusy(false); }
  };

  return (
    <Screen title={t('room.join')}>
      <Input label={t('room.enterCode')} value={code} onChangeText={setCode} placeholder="CARROM-123456" autoCapitalize="characters" keyboardType="default" maxLength={13} error={code && !valid ? t('room.invalid') : null} />
      <Button title={t('room.join')} onPress={join} loading={busy} disabled={!valid} />
    </Screen>
  );
}
