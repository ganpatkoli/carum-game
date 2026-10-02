import { api } from '../api/client';

/**
 * In-app purchase abstraction. Digital goods must go through Google Play Billing / Apple IAP.
 * Production: implement `IapProvider` with `expo-iap` or RevenueCat, return the store receipt/purchase token,
 * and implement the matching verifier on the backend (`purchaseVerifiers.google/apple`).
 * The 'dev' provider only works against non-production servers.
 */
export interface IapProvider { name: 'google' | 'apple' | 'dev'; purchase(productId: string): Promise<{ receipt: string } | null> }

export const devProvider: IapProvider = {
  name: 'dev',
  async purchase(productId) { return { receipt: `${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }; },
};

let provider: IapProvider | null = __DEV__ ? devProvider : null;
export const setIapProvider = (p: IapProvider | null) => { provider = p; };
export const iapAvailable = () => provider !== null;

export async function buyProduct(productId: string) {
  if (!provider) throw new Error('billing not configured');
  const res = await provider.purchase(productId);
  if (!res) return null;
  return api<{ alreadyProcessed: boolean; coins?: number; itemId?: string | null; removeAds?: boolean; balance?: number | null }>('/store/redeem', { json: { provider: provider.name, productId, receipt: res.receipt } });
}
