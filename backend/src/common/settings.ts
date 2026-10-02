import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { DEFAULT_RULES, type RuleConfig } from '@carrom/game-core';

/**
 * Every admin-tunable value lives in `AppSetting` (key → JSON). Each key has a zod schema and a default,
 * so a missing/invalid row can never break the game.
 */
export const SETTINGS = {
  rules: {
    schema: z.object({
      queenEnabled: z.boolean(), queenCoverRequired: z.boolean(), queenPoints: z.number().int().min(0).max(20),
      coinPoints: z.number().int().min(0).max(20), foulReturnCount: z.number().int().min(0).max(5),
      strikerPocketedIsFoul: z.boolean(), wrongFirstContactIsFoul: z.boolean(),
      maxConsecutiveFouls: z.number().int().min(0).max(10), multiFoulPenaltyPoints: z.number().int().min(0).max(20),
      boardPointsToWinner: z.boolean(),
    }),
    default: DEFAULT_RULES as RuleConfig,
  },
  daily_rewards: { schema: z.array(z.number().int().min(0).max(100000)).length(7), default: [100, 150, 200, 250, 300, 400, 1000] },
  leaderboard_periods: {
    schema: z.object({ global: z.boolean(), weekly: z.boolean(), monthly: z.boolean(), friends: z.boolean(), country: z.boolean(), local: z.boolean() }),
    default: { global: true, weekly: true, monthly: true, friends: true, country: true, local: false },
  },
  ads: {
    schema: z.object({
      enabled: z.boolean(), bannerEnabled: z.boolean(), interstitialEnabled: z.boolean(), rewardedEnabled: z.boolean(),
      interstitialEveryNMatches: z.number().int().min(1).max(50), rewardedCoins: z.number().int().min(0).max(10000),
      rewardedCooldownSec: z.number().int().min(0).max(86400), rewardedDailyCap: z.number().int().min(0).max(100),
    }),
    default: { enabled: true, bannerEnabled: true, interstitialEnabled: true, rewardedEnabled: true, interstitialEveryNMatches: 3, rewardedCoins: 50, rewardedCooldownSec: 300, rewardedDailyCap: 10 },
  },
  branding: {
    schema: z.object({ name: z.string().min(1).max(40), tagline: z.string().max(80), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), logoUrl: z.string().max(500).optional() }),
    default: { name: 'CARROM ARENA', tagline: 'Play. Strike. Win.', primaryColor: '#f2b705', logoUrl: '' },
  },
  game: {
    schema: z.object({
      turnTimeSec: z.number().int().min(10).max(180), reconnectWindowSec: z.number().int().min(5).max(300),
      entryOptions: z.array(z.number().int().min(0)).min(1).max(8), botFillAfterSec: z.number().int().min(3).max(120),
      emoteCooldownSec: z.number().min(0).max(30), signupBonus: z.number().int().min(0).max(100000),
      defaultDurationSec: z.number().int().min(0).max(3600),
      winXp: z.number().int().min(0), lossXp: z.number().int().min(0), drawXp: z.number().int().min(0),
      /** coin payouts for free (no entry fee) human-vs-human matches; bots never pay out */
      winCoins: z.number().int().min(0).max(100000), lossCoins: z.number().int().min(0).max(100000),
    }),
    default: { turnTimeSec: 45, reconnectWindowSec: 30, entryOptions: [0, 50, 100, 500], botFillAfterSec: 15, emoteCooldownSec: 3, signupBonus: 500, defaultDurationSec: 0, winXp: 50, lossXp: 20, drawXp: 25, winCoins: 25, lossCoins: 5 },
  },
  iap_products: {
    schema: z.array(z.object({ id: z.string(), title: z.string(), coins: z.number().int().min(0), itemId: z.string().optional(), priceLabel: z.string(), removeAds: z.boolean().optional() })),
    default: [
      { id: 'coins_small', title: '500 Coins', coins: 500, priceLabel: '₹49' },
      { id: 'coins_medium', title: '1500 Coins', coins: 1500, priceLabel: '₹129' },
      { id: 'coins_large', title: '5000 Coins', coins: 5000, priceLabel: '₹399' },
      { id: 'remove_ads', title: 'Remove Ads', coins: 0, priceLabel: '₹199', removeAds: true },
    ],
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;

const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 5000;

export async function getSetting<K extends SettingKey>(db: PrismaClient, key: K): Promise<SettingValue<K>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as SettingValue<K>;
  const row = await db.appSetting.findUnique({ where: { key } });
  const def = SETTINGS[key].default;
  let value: unknown = def;
  if (row) {
    // merge so newly-added fields fall back to defaults for older stored rows
    const merged = Array.isArray(def) ? row.value : { ...(def as object), ...(row.value as object) };
    const parsed = (SETTINGS[key].schema as z.ZodTypeAny).safeParse(merged);
    if (parsed.success) value = parsed.data;
  }
  cache.set(key, { at: Date.now(), value });
  return value as SettingValue<K>;
}

export async function setSetting(db: PrismaClient, key: SettingKey, value: unknown, updatedBy?: string) {
  const parsed = (SETTINGS[key].schema as z.ZodTypeAny).parse(value);
  await db.appSetting.upsert({ where: { key }, update: { value: parsed, updatedBy }, create: { key, value: parsed, updatedBy } });
  cache.delete(key);
  return parsed;
}

export function clearSettingsCache() { cache.clear(); }
