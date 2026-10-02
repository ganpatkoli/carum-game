import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userGuard } from '../common/guards';
import { HttpError } from '../common/http';
import { levelForXp, xpForLevel } from '../common/progress';
import { saveImageDataUrl } from '../common/uploads';
import { getSetting } from '../common/settings';
import { realtime } from '../notifications/notify';

export async function buildMe(db: PrismaClient, userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true, rating: true, wallet: true } });
  const p = u.profile!;
  const [rank, equipped, achievements] = await Promise.all([
    db.rating.count({ where: { rating: { gt: u.rating?.rating ?? 1200 } } }),
    db.userInventory.findMany({ where: { userId, equipped: true } }),
    db.userAchievement.count({ where: { userId } }),
  ]);
  const lvl = levelForXp(p.xp);
  return {
    id: u.id, playerId: u.playerId, email: u.email, phone: u.phone,
    profile: { ...p, level: lvl, xpIntoLevel: p.xp - xpForLevel(lvl), xpForNext: xpForLevel(lvl + 1) - xpForLevel(lvl), winRate: p.matchesPlayed ? Math.round((p.matchesWon / p.matchesPlayed) * 100) : 0 },
    rating: { rating: u.rating?.rating ?? 1200, previous: u.rating?.previous ?? 1200, lastChange: u.rating?.lastChange ?? 0, highest: u.rating?.highest ?? 1200, lowest: u.rating?.lowest ?? 1200 },
    ranking: rank + 1,
    wallet: { balance: Number(u.wallet?.balance ?? 0), earned: Number(u.wallet?.totalEarned ?? 0), spent: Number(u.wallet?.totalSpent ?? 0) },
    balance: Number(u.wallet?.balance ?? 0),
    equipped: equipped.map((e) => e.itemId),
    achievementsUnlocked: achievements,
  };
}

const privacySchema = z.object({ hideStats: z.boolean().optional(), hideOnline: z.boolean().optional(), friendRequests: z.enum(['everyone', 'nobody']).optional() });
const notifSchema = z.object({ push: z.boolean().optional(), friend_request: z.boolean().optional(), game_invite: z.boolean().optional(), daily_reward: z.boolean().optional(), event: z.boolean().optional(), leaderboard: z.boolean().optional() });

export function registerUserRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);

  app.get('/me', { preHandler: guard }, async (req: any) => buildMe(db, req.userId));

  app.patch('/me', { preHandler: guard }, async (req: any) => {
    const b = z.object({
      name: z.string().min(1).max(60).optional(), username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/).optional(),
      avatarId: z.string().max(40).optional(), country: z.string().length(2).optional(), language: z.string().max(5).optional(),
      privacy: privacySchema.optional(), notifPrefs: notifSchema.optional(),
    }).parse(req.body);
    const cur = await db.profile.findUniqueOrThrow({ where: { userId: req.userId } });
    const data: Record<string, unknown> = { ...b };
    if (b.privacy) data.privacy = { ...(cur.privacy as object), ...b.privacy };
    if (b.notifPrefs) data.notifPrefs = { ...(cur.notifPrefs as object), ...b.notifPrefs };
    if (b.username || b.name) data.profileComplete = true;
    try { await db.profile.update({ where: { userId: req.userId }, data }); }
    catch (e: any) { if (e?.code === 'P2002') throw new HttpError(409, 'username already taken'); throw e; }
    return buildMe(db, req.userId);
  });

  app.post('/me/image', { preHandler: guard, bodyLimit: 3_000_000 }, async (req: any) => {
    const { dataUrl } = z.object({ dataUrl: z.string() }).parse(req.body);
    const imageUrl = saveImageDataUrl(dataUrl, 'avatars');
    await db.profile.update({ where: { userId: req.userId }, data: { imageUrl } });
    return { imageUrl };
  });

  app.post('/me/devices', { preHandler: guard }, async (req: any) => {
    const b = z.object({ deviceKey: z.string().max(120), platform: z.enum(['android', 'ios', 'web']), pushToken: z.string().max(300).optional() }).parse(req.body);
    await db.device.upsert({
      where: { userId_deviceKey: { userId: req.userId, deviceKey: b.deviceKey } },
      update: { platform: b.platform, pushToken: b.pushToken, lastSeen: new Date() },
      create: { userId: req.userId, deviceKey: b.deviceKey, platform: b.platform, pushToken: b.pushToken },
    });
    return { ok: true };
  });

  app.get('/users/search', { preHandler: guard }, async (req: any) => {
    const { q } = z.object({ q: z.string().min(2).max(30) }).parse(req.query);
    const blocked = await db.blockedUser.findMany({ where: { OR: [{ userId: req.userId }, { blockedId: req.userId }] } });
    const hide = new Set(blocked.flatMap((b) => [b.userId, b.blockedId]));
    hide.add(req.userId);
    const rows = await db.profile.findMany({
      where: { OR: [{ username: { startsWith: q, mode: 'insensitive' } }, { user: { playerId: q.toUpperCase() } }], userId: { notIn: [...hide] }, user: { isBot: false } },
      take: 20, orderBy: { username: 'asc' },
    });
    return rows.map((r) => ({ id: r.userId, username: r.username, avatarId: r.avatarId, imageUrl: r.imageUrl, level: levelForXp(r.xp) }));
  });

  app.get('/users/:id/public', { preHandler: guard }, async (req: any) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const blocked = await db.blockedUser.findFirst({ where: { userId: id, blockedId: req.userId } });
    if (blocked) throw new HttpError(404, 'not found');
    const p = await db.profile.findUnique({ where: { userId: id }, include: { user: { include: { rating: true } } } });
    if (!p) throw new HttpError(404, 'not found');
    const priv = (p.privacy ?? {}) as { hideStats?: boolean; hideOnline?: boolean };
    return {
      id, username: p.username, name: p.name, avatarId: p.avatarId, imageUrl: p.imageUrl, level: levelForXp(p.xp), country: p.country,
      online: priv.hideOnline ? false : realtime.isOnline(id),
      stats: priv.hideStats ? null : { rating: p.user.rating?.rating, played: p.matchesPlayed, won: p.matchesWon, lost: p.matchesLost, draws: p.draws, bestStreak: p.longestStreak },
    };
  });

  /** Public app config: branding, daily reward table, ad rules, products, leaderboard periods, board themes. */
  app.get('/config', async () => {
    const [branding, daily, ads, products, periods, game, rules] = await Promise.all([
      getSetting(db, 'branding'), getSetting(db, 'daily_rewards'), getSetting(db, 'ads'), getSetting(db, 'iap_products'),
      getSetting(db, 'leaderboard_periods'), getSetting(db, 'game'), getSetting(db, 'rules'),
    ]);
    return { branding, dailyRewards: daily, ads, products, leaderboardPeriods: periods, game: { entryOptions: game.entryOptions, turnTimeSec: game.turnTimeSec, defaultDurationSec: game.defaultDurationSec }, rules, languages: ['en', 'hi'] };
  });
}
