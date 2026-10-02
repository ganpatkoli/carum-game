import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { api, errorMessage } from '../src/api/client';
import { useT } from '../src/i18n';
import { useAuth } from '../src/store/auth';
import { Avatar, Button, Card, Input, Row, Screen } from '../src/ui/kit';
import { toast } from '../src/ui/toast';
import { theme } from '../src/ui/theme';

const USER_RE = /^[a-zA-Z0-9_]{3,20}$/;

export default function EditProfile() {
  const t = useT();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const me = useAuth((s) => s.me);
  const p = me?.profile;
  const [name, setName] = useState(p?.name ?? '');
  const [username, setUsername] = useState(p?.username ?? '');
  const [avatar, setAvatar] = useState(p?.avatarId ?? 'avatar_01');
  const [country, setCountry] = useState(p?.country ?? '');
  const [image, setImage] = useState<string | null>(p?.imageUrl ?? null);
  const [busy, setBusy] = useState(false);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.4, base64: true });
    if (r.canceled || !r.assets[0]?.base64) return;
    const a = r.assets[0];
    try {
      const out = await api<{ imageUrl: string }>('/me/image', { json: { dataUrl: `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` } });
      setImage(out.imageUrl); toast(t('profile.saved'), 'success');
    } catch (e) { toast(errorMessage(e, t('net.error')), 'error'); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: name.trim(), avatarId: avatar };
      if (username !== p?.username) body.username = username;
      if (country.length === 2) body.country = country.toUpperCase();
      await api('/me', { method: 'PATCH', json: body });
      await useAuth.getState().refreshMe();
      toast(t('profile.saved'), 'success');
      if (first) router.replace('/'); else router.back();
    } catch (e) { toast(errorMessage(e, t('net.error')), 'error'); } finally { setBusy(false); }
  };

  return (
    <Screen title={t('profile.edit')}>
      <Card style={{ alignItems: 'center', gap: 12 }}>
        <Avatar avatarId={avatar} imageUrl={image} size={96} ring={theme.gold} />
        <Button title={t('profile.changePhoto')} kind="secondary" onPress={pickImage} />
        <Text style={{ color: theme.muted }}>{t('profile.avatar')}</Text>
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }}>{['01', '02', '03', '04', '05', '06'].map((n) => <Pressable key={n} onPress={() => { setAvatar(`avatar_${n}`); setImage(null); }}><Avatar avatarId={`avatar_${n}`} size={50} ring={avatar === `avatar_${n}` && !image ? theme.gold : undefined} /></Pressable>)}</Row>
      </Card>
      <Input label={t('profile.name')} value={name} onChangeText={setName} autoCapitalize="words" />
      <Input label={t('profile.username')} value={username} onChangeText={setUsername} maxLength={20} error={username && !USER_RE.test(username) ? t('reg.username.rule') : null} />
      <Input label={t('reg.profile.country')} value={country} onChangeText={(v) => setCountry(v.slice(0, 2))} autoCapitalize="characters" maxLength={2} />
      <Button title={t('common.save')} onPress={save} loading={busy} disabled={!name.trim() || !USER_RE.test(username)} />
    </Screen>
  );
}
