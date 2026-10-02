import { router } from 'expo-router';
import { useState } from 'react';
import { api, errorMessage, getRefreshToken } from '../src/api/client';
import { useT } from '../src/i18n';
import { Button, Input, Screen } from '../src/ui/kit';
import { toast } from '../src/ui/toast';

export default function ChangePassword() {
  const t = useT();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api('/auth/password/change', { json: { currentPassword: cur, newPassword: next, refreshToken: getRefreshToken() } }); toast(t('settings.passwordChanged'), 'success'); router.back(); }
    catch (e) { toast(errorMessage(e, t('net.error')), 'error'); } finally { setBusy(false); }
  };
  return (
    <Screen title={t('settings.changePassword')}>
      <Input label={t('settings.currentPassword')} value={cur} onChangeText={setCur} secureTextEntry />
      <Input label={t('settings.newPassword')} value={next} onChangeText={setNext} secureTextEntry error={next && next.length < 8 ? t('reg.password.hint') : null} />
      <Button title={t('common.save')} onPress={save} loading={busy} disabled={!cur || next.length < 8} />
    </Screen>
  );
}
