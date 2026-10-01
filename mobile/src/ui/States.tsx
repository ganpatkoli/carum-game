import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useT } from '../i18n';
import { theme } from './theme';

export function Loading() {
  const t = useT();
  return <View style={{ padding: 32, alignItems: 'center', gap: 8 }}><ActivityIndicator color={theme.gold} /><Text style={{ color: theme.muted }}>{t('state.loading')}</Text></View>;
}
export function Empty({ message }: { message?: string }) {
  const t = useT();
  return <View style={{ padding: 32, alignItems: 'center' }}><Text style={{ color: theme.muted }}>{message ?? t('state.empty')}</Text></View>;
}
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
      <Text style={{ color: theme.text }}>{t('state.error')}</Text>
      <Pressable onPress={onRetry} style={{ backgroundColor: theme.gold, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}>
        <Text style={{ fontWeight: '700' }}>{t('state.retry')}</Text>
      </Pressable>
    </View>
  );
}
