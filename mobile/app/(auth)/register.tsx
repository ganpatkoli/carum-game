import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, errorMessage, type Tokens } from '../../src/api/client';
import { SocialButtons } from '../../src/auth/SocialButtons';
import { LANGUAGES, useLang, useT } from '../../src/i18n';
import { useAuth } from '../../src/store/auth';
import { Avatar, Button, Input, Row, Screen, Segmented } from '../../src/ui/kit';
import { toast } from '../../src/ui/toast';
import { theme } from '../../src/ui/theme';

const TOTAL = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{8,15}$/;
const USER_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** 8-step registration: name → phone → OTP → email → password → username → avatar → profile. */
export default function Register() {
  const t = useT();
  const { lang, setLang } = useLang();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [username, setUsername] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [avatar, setAvatar] = useState('avatar_01');
  const [country, setCountry] = useState('IN');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => { if (cooldown <= 0) return; const id = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(id); }, [cooldown]);

  // debounced live username availability
  useEffect(() => {
    setAvailable(null);
    if (!USER_RE.test(username)) return;
    const id = setTimeout(() => api<{ available: boolean }>(`/auth/username-available?u=${encodeURIComponent(username)}`).then((r) => setAvailable(r.available)).catch(() => setAvailable(null)), 400);
    return () => clearTimeout(id);
  }, [username]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast(errorMessage(e, t('net.error')), 'error'); } finally { setBusy(false); } };

  const sendOtp = () => run(async () => {
    const r = await api<{ devCode?: string }>('/auth/otp/request', { json: { target: phone.trim(), purpose: 'register' } });
    setDevCode(r.devCode ?? null); setCooldown(60); setStep(3);
  });
  const verifyOtp = () => run(async () => {
    const r = await api<{ verifiedToken: string }>('/auth/otp/verify', { json: { target: phone.trim(), purpose: 'register', code: otp } });
    setVerifiedToken(r.verifiedToken); setStep(4);
  });
  const finish = () => run(async () => {
    const tokens = await api<Tokens>('/auth/register', { json: { name: name.trim(), username, email: email.trim(), phone: phone.trim(), password: pw, avatarId: avatar, country: country.toUpperCase(), language: lang, verifiedToken } });
    await useAuth.getState().signInWithTokens(tokens);
    router.replace('/');
  });

  const back = () => (step > 1 ? setStep(step - 1) : router.back());
  const pwOk = pw.length >= 8 && pw === pw2;

  const body = (() => {
    switch (step) {
      case 1: return (<><Text style={h}>{t('reg.name.title')}</Text><Input label={t('reg.name.label')} value={name} onChangeText={setName} autoCapitalize="words" autoFocus /><Button title={t('common.next')} onPress={() => setStep(2)} disabled={name.trim().length < 1} /><SocialButtons /></>);
      case 2: return (<><Text style={h}>{t('reg.phone.title')}</Text><Input label={t('reg.phone.hint')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+919876543210" autoFocus /><Button title={t('reg.phone.send')} onPress={sendOtp} loading={busy} disabled={!PHONE_RE.test(phone.trim())} /></>);
      case 3: return (<><Text style={h}>{t('reg.otp.title')}</Text><Text style={{ color: theme.muted }}>{t('reg.otp.hint', { target: phone })}</Text>{devCode ? <Text style={{ color: theme.gold }}>{t('reg.otp.devCode', { code: devCode })}</Text> : null}<Input value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} autoFocus style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }} /><Button title={t('common.next')} onPress={verifyOtp} loading={busy} disabled={otp.length !== 6} /><Button title={cooldown > 0 ? `${t('reg.otp.resend')} (${cooldown})` : t('reg.otp.resend')} kind="ghost" onPress={sendOtp} disabled={cooldown > 0 || busy} /></>);
      case 4: return (<><Text style={h}>{t('reg.email.title')}</Text><Input label={t('reg.email.label')} value={email} onChangeText={setEmail} keyboardType="email-address" autoFocus /><Button title={t('common.next')} onPress={() => setStep(5)} disabled={!EMAIL_RE.test(email.trim())} /></>);
      case 5: return (<><Text style={h}>{t('reg.password.title')}</Text><Input label={t('reg.password.hint')} value={pw} onChangeText={setPw} secureTextEntry autoFocus /><Input label={t('reg.password.confirm')} value={pw2} onChangeText={setPw2} secureTextEntry error={pw2 && pw !== pw2 ? t('reg.password.mismatch') : null} /><Button title={t('common.next')} onPress={() => setStep(6)} disabled={!pwOk} /></>);
      case 6: return (<><Text style={h}>{t('reg.username.title')}</Text><Input label={t('reg.username.rule')} value={username} onChangeText={setUsername} maxLength={20} autoFocus error={available === false ? t('reg.username.taken') : null} />{available ? <Text style={{ color: theme.green }}>✓ {t('reg.username.available')}</Text> : null}<Button title={t('common.next')} onPress={() => setStep(7)} disabled={!available} /></>);
      case 7: return (<><Text style={h}>{t('reg.avatar.title')}</Text><Row style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>{['01', '02', '03', '04', '05', '06'].map((n) => (<Pressable key={n} onPress={() => setAvatar(`avatar_${n}`)}><Avatar avatarId={`avatar_${n}`} size={78} ring={avatar === `avatar_${n}` ? theme.gold : undefined} /></Pressable>))}</Row><Button title={t('common.next')} onPress={() => setStep(8)} /></>);
      default: return (<><Text style={h}>{t('reg.profile.title')}</Text><Input label={t('reg.profile.country')} value={country} onChangeText={(v) => setCountry(v.slice(0, 2))} autoCapitalize="characters" maxLength={2} /><Text style={{ color: theme.muted, fontSize: 13 }}>{t('reg.profile.language')}</Text><Segmented value={lang} onChange={setLang} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} /><Button title={t('reg.profile.finish')} onPress={finish} loading={busy} disabled={country.length !== 2} /></>);
    }
  })();

  return (
    <Screen title={t('auth.register')} right={<Text style={{ color: theme.muted }}>{t('auth.step', { n: step, total: TOTAL })}</Text>}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.card2, overflow: 'hidden' }}><View style={{ width: `${(step / TOTAL) * 100}%`, height: 6, backgroundColor: theme.gold }} /></View>
      {step > 1 && <Pressable onPress={back}><Text style={{ color: theme.muted }}>‹ {t('common.back')}</Text></Pressable>}
      <View style={{ gap: 14 }}>{body}</View>
    </Screen>
  );
}

const h = { color: theme.text, fontSize: 22, fontWeight: '800' as const };
