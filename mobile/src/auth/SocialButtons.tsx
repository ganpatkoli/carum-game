import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { api, errorMessage, type Tokens } from '../api/client';
import { useT } from '../i18n';
import { useAuth } from '../store/auth';
import { Button } from '../ui/kit';
import { toast } from '../ui/toast';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_IDS = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};
const googleConfigured = Boolean(GOOGLE_IDS.webClientId || GOOGLE_IDS.iosClientId || GOOGLE_IDS.androidClientId);

async function finish(res: Tokens & { isNew?: boolean }) {
  await useAuth.getState().signInWithTokens(res);
  const me = useAuth.getState().me;
  router.replace(res.isNew || me?.profile.profileComplete === false ? '/edit-profile?first=1' : '/');
}

/** Google (all platforms) and Apple (iOS). Needs client ids in env; otherwise the buttons explain what is missing. */
export function SocialButtons() {
  const t = useT();
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({ ...GOOGLE_IDS, clientId: GOOGLE_IDS.webClientId ?? 'unset' });
  const [appleOk, setAppleOk] = useState(false);

  useEffect(() => { if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleOk).catch(() => {}); }, []);

  useEffect(() => {
    if (response?.type !== 'success') { if (response) setBusy(null); return; }
    const idToken = response.params?.id_token;
    if (!idToken) { setBusy(null); return; }
    api<Tokens & { isNew: boolean }>('/auth/google', { json: { idToken } })
      .then(finish).catch((e) => toast(errorMessage(e, t('net.error')), 'error')).finally(() => setBusy(null));
  }, [response, t]);

  const apple = async () => {
    setBusy('apple');
    try {
      const cred = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL] });
      if (!cred.identityToken) throw new Error('no token');
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
      await finish(await api('/auth/apple', { json: { identityToken: cred.identityToken, name } }));
    } catch (e: any) { if (e?.code !== 'ERR_REQUEST_CANCELED') toast(errorMessage(e, t('net.error')), 'error'); } finally { setBusy(null); }
  };

  return (
    <View style={{ gap: 10 }}>
      <Button title={t('auth.google')} kind="secondary" icon="G" loading={busy === 'google'} disabled={!request}
        onPress={() => { if (!googleConfigured) return toast('Google sign-in is not configured (set EXPO_PUBLIC_GOOGLE_*_CLIENT_ID)', 'error'); setBusy('google'); void promptAsync(); }} />
      {Platform.OS === 'ios' && appleOk && <Button title={t('auth.apple')} kind="secondary" icon="" loading={busy === 'apple'} onPress={apple} />}
    </View>
  );
}
