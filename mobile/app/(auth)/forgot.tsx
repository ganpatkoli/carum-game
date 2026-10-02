import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { api, errorMessage } from '../../src/api/client';
import { useT } from '../../src/i18n';
import { Button, Input, Screen } from '../../src/ui/kit';
import { toast } from '../../src/ui/toast';
import { theme } from '../../src/ui/theme';

export default function Forgot() {
  const t = useT();
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try { const r = await api<{ devCode?: string }>('/auth/password/forgot', { json: { identifier: identifier.trim() } }); setDevCode(r.devCode ?? null); setSent(true); }
    catch (e) { toast(errorMessage(e, t('net.error')), 'error'); } finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true);
    try { await api('/auth/password/reset', { json: { identifier: identifier.trim(), code, newPassword: pw } }); toast(t('forgot.done'), 'success'); router.replace('/login'); }
    catch (e) { toast(errorMessage(e, t('net.error')), 'error'); } finally { setBusy(false); }
  };

  return (
    <Screen title={t('forgot.title')}>
      <Input label={t('auth.identifier')} value={identifier} onChangeText={setIdentifier} editable={!sent} keyboardType="email-address" />
      {!sent ? <Button title={t('forgot.send')} onPress={send} loading={busy} disabled={!identifier.trim()} /> : (
        <>
          {devCode ? <Text style={{ color: theme.gold }}>{t('reg.otp.devCode', { code: devCode })}</Text> : null}
          <Input label={t('forgot.code')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          <Input label={t('forgot.new')} value={pw} onChangeText={setPw} secureTextEntry />
          <Button title={t('common.save')} onPress={reset} loading={busy} disabled={code.length !== 6 || pw.length < 8} />
        </>
      )}
    </Screen>
  );
}
