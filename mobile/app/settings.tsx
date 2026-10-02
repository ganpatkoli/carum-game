import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Switch, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../src/api/client';
import { LANGUAGES, useLang, useT, type Key } from '../src/i18n';
import { useAuth } from '../src/store/auth';
import { useSettings } from '../src/store/settings';
import { Button, Card, Row, Screen, SectionTitle, Segmented } from '../src/ui/kit';
import { toast } from '../src/ui/toast';
import { theme } from '../src/ui/theme';

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}><Text style={{ color: theme.text, flex: 1 }}>{label}</Text><Switch value={value} onValueChange={onChange} trackColor={{ true: theme.gold, false: theme.card2 }} accessibilityLabel={label} /></Row>
);
const Link = ({ label, to }: { label: string; to: string }) => <Card onPress={() => router.push(to as any)} style={{ paddingVertical: 12 }}><Row><Text style={{ color: theme.text, flex: 1, fontWeight: '700' }}>{label}</Text><Text style={{ color: theme.muted }}>›</Text></Row></Card>;

export default function Settings() {
  const t = useT();
  const qc = useQueryClient();
  const s = useSettings();
  const { lang, setLang } = useLang();
  const me = useAuth((x) => x.me);
  const prefs = me?.profile.notifPrefs ?? {};
  const privacy = me?.profile.privacy ?? {};

  const patch = async (body: Record<string, unknown>) => {
    try { await api('/me', { method: 'PATCH', json: body }); await useAuth.getState().refreshMe(); }
    catch (e) { toast(errorMessage(e, t('net.error')), 'error'); }
  };
  const setNotif = (k: string, v: boolean) => patch({ notifPrefs: { [k]: v } });
  const setPriv = (k: string, v: unknown) => patch({ privacy: { [k]: v } });
  const changeLang = (l: (typeof LANGUAGES)[number]['code']) => { setLang(l); void patch({ language: l }); };
  const logout = () => Alert.alert(t('settings.logout'), undefined, [{ text: t('common.cancel'), style: 'cancel' }, { text: t('settings.logout'), style: 'destructive', onPress: async () => { await useAuth.getState().logout(); qc.clear(); router.replace('/login'); } }]);

  return (
    <Screen title={t('settings.title')}>
      <Card><Toggle label={t('settings.sound')} value={s.sound} onChange={() => s.toggle('sound')} /><Toggle label={t('settings.music')} value={s.music} onChange={() => s.toggle('music')} /><Toggle label={t('settings.vibration')} value={s.vibration} onChange={() => s.toggle('vibration')} /></Card>

      <SectionTitle>{t('settings.language')}</SectionTitle>
      <Segmented value={lang} onChange={changeLang} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />

      <SectionTitle>{t('settings.notifications')}</SectionTitle>
      <Card>
        <Toggle label={t('settings.push')} value={prefs.push !== false} onChange={(v) => setNotif('push', v)} />
        <Toggle label={t('friends.title')} value={prefs.friend_request !== false} onChange={(v) => setNotif('friend_request', v)} />
        <Toggle label={t('room.join')} value={prefs.game_invite !== false} onChange={(v) => setNotif('game_invite', v)} />
        <Toggle label={t('home.event')} value={prefs.event !== false} onChange={(v) => setNotif('event', v)} />
      </Card>

      <SectionTitle>{t('settings.privacy')}</SectionTitle>
      <Card>
        <Toggle label={t('settings.hideStats')} value={!!privacy.hideStats} onChange={(v) => setPriv('hideStats', v)} />
        <Toggle label={t('settings.hideOnline')} value={!!privacy.hideOnline} onChange={(v) => setPriv('hideOnline', v)} />
        <Toggle label={t('settings.friendRequests')} value={privacy.friendRequests !== 'nobody'} onChange={(v) => setPriv('friendRequests', v ? 'everyone' : 'nobody')} />
      </Card>

      <SectionTitle>{t('settings.account')}</SectionTitle>
      <Link label={t('profile.edit')} to="/edit-profile" />
      <Link label={t('settings.changePassword')} to="/change-password" />
      <Link label={t('settings.blocked')} to="/blocked" />
      <Link label={t('settings.help')} to="/support" />
      <Link label={t('settings.terms')} to="/legal?doc=terms" />
      <Link label={t('settings.privacyPolicy')} to="/legal?doc=privacy" />
      <Link label={t('settings.about')} to="/legal?doc=about" />
      <Button title={t('settings.logout')} kind="danger" onPress={logout} />
      <View><Text style={{ color: theme.muted, textAlign: 'center' }}>{t('settings.version', { v: Constants.expoConfig?.version ?? '0.1.0' })}</Text></View>
    </Screen>
  );
}
