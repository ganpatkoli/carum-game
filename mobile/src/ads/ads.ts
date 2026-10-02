import { api } from '../api/client';

/**
 * Ad provider abstraction. The default is a no-network mock so the flows work in development and Expo Go.
 * For production, implement this interface with `react-native-google-mobile-ads` (AdMob), call
 * `setAdProvider(...)` at startup, and use AdMob server-side verification via `adHooks.verifyCompletion` on the backend.
 * Ads are only ever shown from menu screens, never during a live game.
 */
export interface AdProvider {
  showInterstitial(): Promise<void>;
  /** resolves true if the user watched the ad to the end */
  showRewarded(): Promise<boolean>;
}

type Presenter = (kind: 'interstitial' | 'rewarded') => Promise<boolean>;
let presenter: Presenter | null = null;
/** The mock provider renders through a modal registered by <AdHost/>. */
export const registerAdPresenter = (p: Presenter | null) => { presenter = p; };

export const mockProvider: AdProvider = {
  async showInterstitial() { await presenter?.('interstitial'); },
  async showRewarded() { return (await presenter?.('rewarded')) ?? false; },
};

let provider: AdProvider = mockProvider;
export const setAdProvider = (p: AdProvider) => { provider = p; };

let matchesSinceAd = 0;

/** Called after a finished match (results screen closed), never mid-game. */
export async function maybeShowInterstitial(cfg: { enabled: boolean; interstitialEnabled: boolean; interstitialEveryNMatches: number }, adsRemoved: boolean) {
  if (!cfg.enabled || !cfg.interstitialEnabled || adsRemoved) return;
  matchesSinceAd++;
  if (matchesSinceAd < cfg.interstitialEveryNMatches) return;
  matchesSinceAd = 0;
  try { await provider.showInterstitial(); } catch { /* ads must never break the app */ }
}

/** Full rewarded flow: server ticket → show ad → claim. Returns the coins granted or null if skipped. */
export async function watchRewardedAd(): Promise<{ coins: number; balance: number } | null> {
  const { ticket } = await api<{ ticket: string }>('/ads/rewarded/start', { json: {} });
  const watched = await provider.showRewarded();
  if (!watched) return null;
  return api('/ads/rewarded/claim', { json: { ticket } });
}
