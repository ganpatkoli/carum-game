import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useT, type Key } from '../../src/i18n';
import { theme } from '../../src/ui/theme';

export default function Play() {
  const t = useT();
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20, paddingTop: 60, gap: 12 }}>
      <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>{t('play.vsAi')}</Text>
      {(['easy', 'medium', 'hard', 'expert'] as const).map((d) => (
        <Pressable key={d} onPress={() => router.push(`/game?difficulty=${d}`)} style={{ backgroundColor: theme.card, padding: 18, borderRadius: 14 }}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>{t(`play.${d}` as Key)}</Text>
        </Pressable>
      ))}
    </View>
  );
}
