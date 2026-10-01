import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { useT } from '../../src/i18n';
import { theme } from '../../src/ui/theme';

export default function Rewards() {
  const t = useT();
  const qc = useQueryClient();
  const claim = useMutation({ mutationFn: () => api<{ day: number; amount: number }>('/rewards/daily/claim', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }) });
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20, paddingTop: 60, gap: 16 }}>
      <Pressable onPress={() => claim.mutate()} disabled={claim.isPending} style={{ backgroundColor: theme.gold, padding: 18, borderRadius: 14, alignItems: 'center' }}>
        <Text style={{ fontWeight: '800' }}>{t('rewards.claim')}</Text>
      </Pressable>
      {claim.isSuccess && <Text style={{ color: theme.text }}>Day {claim.data.day}: +{claim.data.amount} 🪙</Text>}
      {claim.isError && <Text style={{ color: theme.red }}>{(claim.error as Error).message}</Text>}
    </View>
  );
}
