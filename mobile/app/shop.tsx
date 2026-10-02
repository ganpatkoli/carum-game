import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { buyProduct, iapAvailable } from '../src/iap/iap';
import { api, errorMessage } from '../src/api/client';
import { play } from '../src/audio/sounds';
import type { ShopItem } from '../src/game/cosmetics';
import { useT, type Key } from '../src/i18n';
import { useAuth } from '../src/store/auth';
import { useConfig } from '../src/store/config';
import { Button, Card, Pill, QueryView, Row, Screen, SectionTitle, Segmented, SkeletonList } from '../src/ui/kit';
import { toast } from '../src/ui/toast';
import { theme } from '../src/ui/theme';

const CATS = ['STRIKER', 'BOARD', 'AVATAR', 'FRAME', 'EFFECT', 'EMOTE'] as const;
const RARITY: Record<string, string> = { COMMON: '#9aa0ac', RARE: '#4aa8ff', EPIC: '#c77dff', LEGENDARY: '#ffd24a' };

export default function Shop() {
  const t = useT();
  const qc = useQueryClient();
  const me = useAuth((s) => s.me);
  const products = useConfig((s) => s.config.products);
  const [cat, setCat] = useState<(typeof CATS)[number]>('STRIKER');
  const q = useQuery({ queryKey: ['shop'], queryFn: () => api<ShopItem[]>('/shop') });
  const done = () => { qc.invalidateQueries({ queryKey: ['shop'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); void useAuth.getState().refreshMe(); };

  const buy = useMutation({ mutationFn: (id: string) => api('/shop/buy', { json: { itemId: id } }), onSuccess: () => { play('reward'); toast(t('shop.bought'), 'success'); done(); }, onError: (e) => toast(errorMessage(e, t('net.error')), 'error') });
  const equip = useMutation({ mutationFn: (v: { id: string; on: boolean }) => api('/inventory/equip', { json: { itemId: v.id, equipped: v.on } }), onSuccess: done, onError: (e) => toast(errorMessage(e, t('net.error')), 'error') });
  const iap = useMutation({
    mutationFn: (id: string) => buyProduct(id),
    onSuccess: (r) => { if (r) { play('reward'); toast(t('shop.bought'), 'success'); done(); } },
    onError: (e) => toast(errorMessage(e, t('shop.notAvailable')), 'error'),
  });
  const confirmBuy = (i: ShopItem) => Alert.alert(i.name, t('shop.confirm', { name: i.name, price: i.price }), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('shop.buy'), onPress: () => buy.mutate(i.id) }]);

  return (
    <Screen title={t('shop.title')} right={<Pill color={theme.card2} textColor={theme.gold}>🪙 {me?.balance ?? 0}</Pill>}>
      <SectionTitle>{t('shop.coinPacks')}</SectionTitle>
      {products.length === 0 || !iapAvailable() ? <Text style={{ color: theme.muted }}>{t('shop.notAvailable')}</Text> : (
        <Row style={{ flexWrap: 'wrap' }}>{products.map((p) => (
          <Card key={p.id} onPress={() => iap.mutate(p.id)} style={{ flexBasis: '47%', flexGrow: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 26 }}>{p.removeAds ? '🚫' : '🪙'}</Text>
            <Text style={{ color: theme.text, fontWeight: '800', textAlign: 'center' }}>{p.removeAds ? t('shop.removeAds') : p.title}</Text>
            <Text style={{ color: theme.gold, fontWeight: '900' }}>{p.priceLabel}</Text>
          </Card>))}</Row>
      )}
      <SectionTitle>{t('shop.items')}</SectionTitle>
      <Segmented value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: t(`cat.${c}` as Key) }))} />
      <QueryView query={q} skeleton={<SkeletonList rows={5} height={72} />}>
        {(items) => <View style={{ gap: 10 }}>{items.filter((i) => i.category === cat).map((i) => (
          <Card key={i.id} style={{ borderColor: RARITY[i.rarity] ?? theme.border }}>
            <Row>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: (i.meta?.color as string) ?? theme.card2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff3' }}><Text style={{ fontSize: 20 }}>{i.category === 'BOARD' ? '🟫' : i.category === 'EMOTE' ? '😀' : i.category === 'AVATAR' ? '🙂' : '✨'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '800' }}>{i.name}</Text>
                <Text style={{ color: RARITY[i.rarity], fontSize: 12, fontWeight: '700' }}>{t(`rarity.${i.rarity}` as Key)}</Text>
              </View>
              {i.owned
                ? <Button title={i.equipped ? t('shop.equipped') : t('shop.equip')} kind={i.equipped ? 'secondary' : 'primary'} style={{ paddingVertical: 8 }} onPress={() => equip.mutate({ id: i.id, on: !i.equipped })} />
                : <Button title={`🪙 ${i.price}`} style={{ paddingVertical: 8 }} onPress={() => confirmBuy(i)} disabled={(me?.balance ?? 0) < i.price} />}
            </Row>
          </Card>))}</View>}
      </QueryView>
    </Screen>
  );
}
