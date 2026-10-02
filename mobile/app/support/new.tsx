import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Text } from 'react-native';
import { api, errorMessage } from '../../src/api/client';
import { useT, type Key } from '../../src/i18n';
import { Button, Card, Input, Screen, Segmented } from '../../src/ui/kit';
import { toast } from '../../src/ui/toast';
import { theme } from '../../src/ui/theme';

const CATS = ['ACCOUNT', 'PAYMENT', 'GAMEPLAY', 'BUG', 'REPORT_APPEAL', 'OTHER'] as const;

export default function NewTicket() {
  const t = useT();
  const [category, setCategory] = useState<(typeof CATS)[number]>('BUG');
  const [description, setDescription] = useState('');
  const [shot, setShot] = useState<{ uri: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const attach = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4, base64: true });
    const a = r.assets?.[0];
    if (!r.canceled && a?.base64) setShot({ uri: a.uri, dataUrl: `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` });
  };
  const submit = async () => {
    setBusy(true);
    try { await api('/support/tickets', { json: { category, description: description.trim(), screenshot: shot?.dataUrl } }); toast(t('support.sent'), 'success'); router.back(); }
    catch (e) { toast(errorMessage(e, t('net.error')), 'error'); } finally { setBusy(false); }
  };
  return (
    <Screen title={t('support.new')}>
      <Card style={{ gap: 12 }}>
        <Text style={{ color: theme.muted }}>{t('support.category')}</Text>
        <Segmented value={category} onChange={setCategory} options={CATS.map((c) => ({ value: c, label: t(`support.cat.${c}` as Key) }))} />
        <Input label={t('support.description')} value={description} onChangeText={setDescription} multiline maxLength={3000} style={{ minHeight: 120, textAlignVertical: 'top' }} error={description && description.trim().length < 10 ? t('support.tooShort') : null} />
        <Button title={t('support.attach')} kind="secondary" onPress={attach} />
        {shot && <Image source={{ uri: shot.uri }} style={{ width: 120, height: 120, borderRadius: 12 }} />}
      </Card>
      <Button title={t('support.submit')} onPress={submit} loading={busy} disabled={description.trim().length < 10} />
    </Screen>
  );
}
