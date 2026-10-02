import type { PrismaClient } from '@prisma/client';
import { SETTINGS, SETTING_KEYS } from './settings';

const missions = [
  { id: 'play_1', title: 'Play 1 match', metric: 'matches_played', target: 1, rewardCoins: 50 },
  { id: 'win_1', title: 'Win 1 match', metric: 'matches_won', target: 1, rewardCoins: 100 },
  { id: 'pocket_5', title: 'Pocket 5 coins', metric: 'coins_pocketed', target: 5, rewardCoins: 60 },
  { id: 'friend_1', title: 'Play with a friend', metric: 'friend_matches', target: 1, rewardCoins: 80 },
  { id: 'win_3', title: 'Win 3 matches', metric: 'matches_won', target: 3, rewardCoins: 250 },
  { id: 'play_5', title: 'Complete 5 matches', metric: 'matches_played', target: 5, rewardCoins: 150 },
];
const achievements = [
  { id: 'FIRST_WIN', title: 'First Win', metric: 'wins_total', target: 1, rewardCoins: 100 },
  { id: '10_WINS', title: '10 Wins', metric: 'wins_total', target: 10, rewardCoins: 250 },
  { id: '50_WINS', title: '50 Wins', metric: 'wins_total', target: 50, rewardCoins: 750 },
  { id: '100_WINS', title: '100 Wins', metric: 'wins_total', target: 100, rewardCoins: 1500 },
  { id: 'PERFECT_GAME', title: 'Perfect Game', metric: 'perfect_game', target: 1, rewardCoins: 500 },
  { id: 'QUEEN_MASTER', title: 'Queen Master', metric: 'queen_covers_total', target: 10, rewardCoins: 400 },
  { id: 'WIN_STREAK_5', title: 'Win Streak 5', metric: 'win_streak', target: 5, rewardCoins: 300 },
  { id: 'WIN_STREAK_10', title: 'Win Streak 10', metric: 'win_streak', target: 10, rewardCoins: 800 },
  { id: 'PLAY_100_MATCHES', title: 'Play 100 Matches', metric: 'matches_total', target: 100, rewardCoins: 500 },
];
const items: { id: string; category: any; name: string; price: number; rarity: any; meta?: object }[] = [
  { id: 'striker_classic', category: 'STRIKER', name: 'Classic', price: 0, rarity: 'COMMON', meta: { color: '#ffe27a' } },
  { id: 'striker_gold', category: 'STRIKER', name: 'Gold', price: 800, rarity: 'RARE', meta: { color: '#ffd24a' } },
  { id: 'striker_silver', category: 'STRIKER', name: 'Silver', price: 600, rarity: 'RARE', meta: { color: '#d9dde2' } },
  { id: 'striker_neon', category: 'STRIKER', name: 'Neon', price: 1500, rarity: 'EPIC', meta: { color: '#39ff14' } },
  { id: 'striker_diamond', category: 'STRIKER', name: 'Diamond', price: 4000, rarity: 'LEGENDARY', meta: { color: '#7fe3ff' } },
  { id: 'striker_fire', category: 'STRIKER', name: 'Fire', price: 2500, rarity: 'EPIC', meta: { color: '#ff5a1f' } },
  { id: 'striker_premium', category: 'STRIKER', name: 'Premium', price: 6000, rarity: 'LEGENDARY', meta: { color: '#c77dff' } },
  { id: 'board_classic', category: 'BOARD', name: 'Classic Wooden', price: 0, rarity: 'COMMON', meta: { theme: 'classic' } },
  { id: 'board_royal', category: 'BOARD', name: 'Royal', price: 1200, rarity: 'RARE', meta: { theme: 'royal' } },
  { id: 'board_neon', category: 'BOARD', name: 'Neon', price: 2000, rarity: 'EPIC', meta: { theme: 'neon' } },
  { id: 'board_premium', category: 'BOARD', name: 'Premium', price: 3000, rarity: 'EPIC', meta: { theme: 'premium' } },
  { id: 'board_dark', category: 'BOARD', name: 'Dark', price: 1000, rarity: 'RARE', meta: { theme: 'dark' } },
  { id: 'board_tournament', category: 'BOARD', name: 'Tournament', price: 5000, rarity: 'LEGENDARY', meta: { theme: 'tournament' } },
  ...['01', '02', '03', '04', '05', '06'].map((n, i) => ({ id: `avatar_${n}`, category: 'AVATAR', name: `Avatar ${n}`, price: i < 3 ? 0 : 400, rarity: 'COMMON' as const })),
  { id: 'frame_gold', category: 'FRAME', name: 'Gold Frame', price: 700, rarity: 'RARE' },
  { id: 'frame_fire', category: 'FRAME', name: 'Fire Frame', price: 1800, rarity: 'EPIC' },
  { id: 'effect_sparkle', category: 'EFFECT', name: 'Sparkle Pocket', price: 900, rarity: 'RARE' },
  { id: 'effect_flame', category: 'EFFECT', name: 'Flame Trail', price: 2200, rarity: 'EPIC' },
  ...(['thumbs_up', 'laugh', 'fire', 'gg', 'nice', 'oops'] as const).map((e) => ({ id: `emote_${e}`, category: 'EMOTE', name: e, price: 0, rarity: 'COMMON' as const })),
];

/** Idempotent: inserts default content and settings, never overwrites what an admin already changed. */
export async function seedContent(db: PrismaClient) {

  for (const m of missions) await db.mission.upsert({ where: { id: m.id }, update: {}, create: m });
  for (const a of achievements) await db.achievement.upsert({ where: { id: a.id }, update: {}, create: a });
  for (const i of items) await db.inventoryItem.upsert({ where: { id: i.id }, update: {}, create: { ...i, meta: i.meta ?? {} } });
  for (const k of SETTING_KEYS) await db.appSetting.upsert({ where: { key: k }, update: {}, create: { key: k, value: SETTINGS[k].default as any } });
}
