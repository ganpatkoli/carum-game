import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { api } from '../src/api/client';
import { useT, type Key } from '../src/i18n';
import { Card, QueryView, Row, Screen, SectionTitle, SkeletonList } from '../src/ui/kit';
import { theme } from '../src/ui/theme';

interface Wallet { balance: number; earned: number; spent: number; transactions: { id: string; type: string; amount: number; balanceAfter: number; at: string }[] }

export default function WalletScreen() {
  const t = useT();
  const q = useQuery({ queryKey: ['wallet'], queryFn: () => api<Wallet>('/wallet') });
  return (
    <Screen title={t('wallet.title')}>
      <QueryView query={q} skeleton={<SkeletonList rows={6} />}>
        {(w) => (
          <>
            <Card style={{ alignItems: 'center', gap: 4 }}>
              <Text style={{ color: theme.muted }}>{t('wallet.balance')}</Text>
              <Text style={{ color: theme.gold, fontSize: 40, fontWeight: '900' }}>🪙 {w.balance}</Text>
              <Row style={{ gap: 24 }}><Text style={{ color: theme.green }}>↑ {t('wallet.earned')}: {w.earned}</Text><Text style={{ color: theme.red }}>↓ {t('wallet.spent')}: {w.spent}</Text></Row>
            </Card>
            <SectionTitle>{t('wallet.history')}</SectionTitle>
            {w.transactions.length === 0 ? <Text style={{ color: theme.muted, textAlign: 'center' }}>{t('state.empty')}</Text> : (
              <View style={{ gap: 8 }}>{w.transactions.map((x) => (
                <Card key={x.id} style={{ paddingVertical: 10 }}>
                  <Row><View style={{ flex: 1 }}><Text style={{ color: theme.text, fontWeight: '700' }}>{t(`tx.${x.type}` as Key)}</Text><Text style={{ color: theme.muted, fontSize: 12 }}>{new Date(x.at).toLocaleString()}</Text></View>
                    <View style={{ alignItems: 'flex-end' }}><Text style={{ color: x.amount > 0 ? theme.green : theme.red, fontWeight: '900' }}>{x.amount > 0 ? '+' : ''}{x.amount}</Text><Text style={{ color: theme.muted, fontSize: 12 }}>{x.balanceAfter}</Text></View></Row>
                </Card>))}</View>
            )}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
