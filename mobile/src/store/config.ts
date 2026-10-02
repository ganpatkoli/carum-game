import { create } from 'zustand';
import { api } from '../api/client';

export interface AppConfig {
  branding: { name: string; tagline: string; primaryColor: string; logoUrl?: string };
  dailyRewards: number[];
  ads: { enabled: boolean; bannerEnabled: boolean; interstitialEnabled: boolean; rewardedEnabled: boolean; interstitialEveryNMatches: number; rewardedCoins: number; rewardedCooldownSec: number; rewardedDailyCap: number };
  products: { id: string; title: string; coins: number; itemId?: string; priceLabel: string; removeAds?: boolean }[];
  leaderboardPeriods: Record<'global' | 'weekly' | 'monthly' | 'friends' | 'country' | 'local', boolean>;
  game: { entryOptions: number[]; turnTimeSec: number; defaultDurationSec: number };
  rules: { queenEnabled: boolean; queenCoverRequired: boolean };
  languages: string[];
}

/** Built-in fallback so the app (and offline practice) works before /config has ever been fetched. */
export const DEFAULT_CONFIG: AppConfig = {
  branding: { name: 'CARROM ARENA', tagline: 'Play. Strike. Win.', primaryColor: '#f2b705' },
  dailyRewards: [100, 150, 200, 250, 300, 400, 1000],
  ads: { enabled: true, bannerEnabled: true, interstitialEnabled: true, rewardedEnabled: true, interstitialEveryNMatches: 3, rewardedCoins: 50, rewardedCooldownSec: 300, rewardedDailyCap: 10 },
  products: [],
  leaderboardPeriods: { global: true, weekly: true, monthly: true, friends: true, country: true, local: false },
  game: { entryOptions: [0, 50, 100, 500], turnTimeSec: 45, defaultDurationSec: 0 },
  rules: { queenEnabled: true, queenCoverRequired: true },
  languages: ['en', 'hi'],
};

export const useConfig = create<{ config: AppConfig; load: () => Promise<void> }>((set) => ({
  config: DEFAULT_CONFIG,
  async load() { try { set({ config: { ...DEFAULT_CONFIG, ...(await api<AppConfig>('/config')) } }); } catch { /* keep defaults */ } },
}));
