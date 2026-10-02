import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { useT, type Key } from '../src/i18n';
import { Card, Screen } from '../src/ui/kit';
import { theme } from '../src/ui/theme';

const DOCS: Record<string, { title: Key; body: Key }> = {
  terms: { title: 'settings.terms', body: 'settings.termsBody' },
  privacy: { title: 'settings.privacyPolicy', body: 'settings.privacyBody' },
  about: { title: 'settings.about', body: 'settings.aboutBody' },
};

/** Placeholder legal copy: replace with your real documents (or load from a URL) before store submission. */
export default function Legal() {
  const t = useT();
  const { doc = 'about' } = useLocalSearchParams<{ doc?: string }>();
  const d = DOCS[doc] ?? DOCS.about;
  return (
    <Screen title={t(d.title)}>
      <Card style={{ gap: 12 }}>
        <Text style={{ color: theme.text, lineHeight: 22 }}>{t(d.body)}</Text>
        {doc !== 'about' && <Text style={{ color: theme.muted, fontSize: 12 }}>{t('settings.legalPlaceholder')}</Text>}
      </Card>
    </Screen>
  );
}
