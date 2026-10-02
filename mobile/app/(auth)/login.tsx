import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ApiError, NetworkError } from '../../src/api/client';
import { SocialButtons } from '../../src/auth/SocialButtons';
import { useT } from '../../src/i18n';
import { useConfig } from '../../src/store/config';
import { useAuth } from '../../src/store/auth';
import { Button, Input, Screen } from '../../src/ui/kit';
import { theme } from '../../src/ui/theme';

export default function Login() {
  const t = useT();
  const brand = useConfig((s) => s.config.branding);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(null);
    try { await useAuth.getState().login(id.trim(), pw); router.replace('/'); }
    catch (e) { setErr(e instanceof NetworkError ? t('net.error') : e instanceof ApiError && e.status === 403 ? e.message : t('auth.invalid')); }
    finally { setBusy(false); }
  };

  return (
    <Screen noBack>
      <View style={{ alignItems: 'center', marginVertical: 24, gap: 4 }}>
        <Text style={{ fontSize: 56 }}>🎯</Text>
        <Text style={{ color: brand.primaryColor, fontSize: 30, fontWeight: '900' }}>{brand.name}</Text>
        <Text style={{ color: theme.muted }}>{brand.tagline}</Text>
      </View>
      <Input label={t('auth.identifier')} value={id} onChangeText={setId} keyboardType="email-address" textContentType="username" autoComplete="username" />
      <Input label={t('auth.password')} value={pw} onChangeText={setPw} secureTextEntry textContentType="password" autoComplete="password" error={err} onSubmitEditing={submit} />
      <Button title={t('auth.login')} onPress={submit} loading={busy} disabled={!id.trim() || pw.length < 1} />
      <Link href="/forgot" style={{ color: theme.gold, textAlign: 'center', padding: 6 }}>{t('auth.forgot')}</Link>
      <Text style={{ color: theme.muted, textAlign: 'center' }}>{t('auth.or')}</Text>
      <SocialButtons />
      <Link href="/register" style={{ color: theme.text, textAlign: 'center', padding: 10 }}>{t('auth.noAccount')}</Link>
    </Screen>
  );
}
