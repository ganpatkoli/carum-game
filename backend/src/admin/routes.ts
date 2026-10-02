import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from '../common/http';
import { SETTING_KEYS, SETTINGS, getSetting, setSetting, type SettingKey } from '../common/settings';
import { notify } from '../notifications/notify';
import { applyWalletTx } from '../wallet/wallet.service';
import { adminGuard, adminLogin, analytics, audit, banUser, createAdmin } from './service';
import { can, visibleModules, type Module } from './rbac';

const SETTING_MODULE: Record<SettingKey, Module> = {
  rules: 'rules', daily_rewards: 'rewards', leaderboard_periods: 'leaderboards', ads: 'ads', branding: 'branding', game: 'game_settings', iap_products: 'purchases',
};
const uuid = z.string().uuid();
const page = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
const skip = (p: { page: number; pageSize: number }) => ({ skip: (p.page - 1) * p.pageSize, take: p.pageSize });

export function registerAdminRoutes(app: FastifyInstance, db: PrismaClient) {
  const g = (m: Module, a: 'read' | 'write' = 'read') => ({ preHandler: adminGuard(db, m, a) });
  const loginLimit = { config: { rateLimit: { max: process.env.NODE_ENV === 'test' ? 1000 : 8, timeWindow: '1 minute' } } };

  app.post('/admin/auth/login', loginLimit, async (req) => {
    const b = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    return adminLogin(db, b.email, b.password);
  });
  app.get('/admin/me', { preHandler: adminGuard(db, 'dashboard') }, async (req: any) => ({ ...req.admin, modules: visibleModules(req.admin.role) }));

  app.get('/admin/analytics', g('analytics'), async () => analytics(db));

  // ---- users ----
  app.get('/admin/users', g('users'), async (req) => {
    const q = page.extend({ q: z.string().optional(), banned: z.enum(['true', 'false']).optional() }).parse(req.query);
    const where: any = { isBot: false, ...(q.banned ? { isBanned: q.banned === 'true' } : {}) };
    if (q.q) where.OR = [{ email: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { playerId: q.q.toUpperCase() }, { profile: { username: { contains: q.q, mode: 'insensitive' } } }];
    const [total, rows] = await Promise.all([db.user.count({ where }), db.user.findMany({ where, orderBy: { createdAt: 'desc' }, include: { profile: true, wallet: true, rating: true }, ...skip(q) })]);
    return { total, items: rows.map((u) => ({ id: u.id, playerId: u.playerId, email: u.email, phone: u.phone, username: u.profile?.username, level: u.profile?.level, rating: u.rating?.rating, balance: Number(u.wallet?.balance ?? 0), isBanned: u.isBanned, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt })) };
  });
  app.get('/admin/users/:id', g('users'), async (req: any) => {
    const id = uuid.parse(req.params.id);
    const u = await db.user.findUnique({ where: { id }, include: { profile: true, wallet: true, rating: true } });
    if (!u) throw new HttpError(404, 'user not found');
    const [txs, matches, reportsAgainst] = await Promise.all([
      db.walletTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      db.matchPlayer.findMany({ where: { userId: id }, orderBy: { matchId: 'desc' }, take: 10 }),
      db.report.count({ where: { targetId: id } }),
    ]);
    const canSeeWallet = can(req.admin.role, 'wallet', 'read');
    return {
      id: u.id, playerId: u.playerId, email: u.email, phone: u.phone, isBanned: u.isBanned, createdAt: u.createdAt, profile: u.profile, rating: u.rating, reportsAgainst,
      wallet: canSeeWallet ? { balance: Number(u.wallet?.balance ?? 0), earned: Number(u.wallet?.totalEarned ?? 0), spent: Number(u.wallet?.totalSpent ?? 0) } : null,
      transactions: canSeeWallet ? txs.map((t) => ({ id: t.id, type: t.type, amount: Number(t.amount), balanceAfter: Number(t.balanceAfter), note: t.note, createdAt: t.createdAt })) : [],
      matches,
    };
  });
  app.post('/admin/users/:id/ban', g('users', 'write'), async (req: any) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ banned: z.boolean(), reason: z.string().max(500).optional() }).parse(req.body);
    await banUser(db, id, b.banned);
    await audit(db, req.admin.id, b.banned ? 'user.ban' : 'user.unban', id, { reason: b.reason });
    return { ok: true };
  });
  app.post('/admin/users/:id/wallet-adjust', g('wallet', 'write'), async (req: any) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ amount: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= 1_000_000), note: z.string().min(3).max(300), idempotencyKey: z.string().min(8).max(100) }).parse(req.body);
    const tx = await applyWalletTx(db, { userId: id, type: 'ADMIN_ADJUSTMENT', amount: b.amount, idempotencyKey: `admin:${b.idempotencyKey}`, refType: 'admin', refId: req.admin.id, note: b.note });
    await audit(db, req.admin.id, 'wallet.adjust', id, { amount: b.amount, note: b.note });
    return { balance: Number(tx.balanceAfter) };
  });

  // ---- matches / anti-cheat review ----
  app.get('/admin/matches', g('matches'), async (req) => {
    const q = page.extend({ suspicious: z.enum(['true', 'false']).optional(), reviewed: z.enum(['true', 'false']).optional() }).parse(req.query);
    const where: any = { ...(q.suspicious ? { suspicious: q.suspicious === 'true' } : {}), ...(q.reviewed ? { reviewed: q.reviewed === 'true' } : {}) };
    const [total, items] = await Promise.all([db.match.count({ where }), db.match.findMany({ where, orderBy: { createdAt: 'desc' }, include: { players: true, result: true }, ...skip(q) })]);
    return { total, items };
  });
  app.get('/admin/matches/:id', g('matches'), async (req: any) => {
    const id = uuid.parse(req.params.id);
    const m = await db.match.findUnique({ where: { id }, include: { players: true, result: true, events: { orderBy: { id: 'asc' }, take: 1000 } } });
    if (!m) throw new HttpError(404, 'match not found');
    const profiles = await db.profile.findMany({ where: { userId: { in: m.players.map((p) => p.userId) } } });
    return { ...m, events: m.events.map((e) => ({ ...e, id: Number(e.id) })), players: m.players.map((p) => ({ ...p, username: profiles.find((x) => x.userId === p.userId)?.username })) };
  });
  app.post('/admin/matches/:id/review', g('suspicious_matches', 'write'), async (req: any) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ suspicious: z.boolean(), note: z.string().max(500).optional() }).parse(req.body);
    await db.match.update({ where: { id }, data: { suspicious: b.suspicious, reviewed: true } });
    await audit(db, req.admin.id, 'match.review', id, b);
    return { ok: true };
  });

  // ---- reports ----
  app.get('/admin/reports', g('reports'), async (req) => {
    const q = page.extend({ status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED']).optional() }).parse(req.query);
    const where = q.status ? { status: q.status } : {};
    const [total, items] = await Promise.all([db.report.count({ where }), db.report.findMany({ where, orderBy: { createdAt: 'desc' }, ...skip(q) })]);
    return { total, items };
  });
  app.patch('/admin/reports/:id', g('reports', 'write'), async (req: any) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED']), resolution: z.string().max(1000).optional(), banTarget: z.boolean().optional() }).parse(req.body);
    const r = await db.report.findUnique({ where: { id } });
    if (!r) throw new HttpError(404, 'report not found');
    // banning is a user-management action, not every reviewer's call
    if (b.banTarget) {
      if (!can(req.admin.role, 'users', 'write')) throw new HttpError(403, 'forbidden');
      await banUser(db, r.targetId, true);
    }
    await db.report.update({ where: { id }, data: { status: b.status, resolution: b.resolution } });
    await audit(db, req.admin.id, 'report.update', id, b);
    if (b.status === 'RESOLVED') await notify(db, r.reporterId, { kind: 'report', title: 'Report reviewed', body: 'Thanks — we reviewed your report and took action.', push: false });
    return { ok: true };
  });

  // ---- support ----
  app.get('/admin/support', g('support'), async (req) => {
    const q = page.extend({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(), assignedTo: uuid.optional() }).parse(req.query);
    const where: any = { ...(q.status ? { status: q.status } : {}), ...(q.assignedTo ? { assignedTo: q.assignedTo } : {}) };
    const [total, items] = await Promise.all([db.supportTicket.count({ where }), db.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, ...skip(q) })]);
    return { total, items };
  });
  app.get('/admin/support/:id', g('support'), async (req: any) => {
    const t = await db.supportTicket.findUnique({ where: { id: uuid.parse(req.params.id) }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!t) throw new HttpError(404, 'ticket not found');
    return t;
  });
  app.post('/admin/support/:id/reply', g('support', 'write'), async (req: any) => {
    const b = z.object({ body: z.string().min(1).max(3000), internal: z.boolean().default(false) }).parse(req.body);
    const t = await db.supportTicket.findUnique({ where: { id: uuid.parse(req.params.id) } });
    if (!t) throw new HttpError(404, 'ticket not found');
    await db.supportMessage.create({ data: { ticketId: t.id, authorId: req.admin.id, body: b.body, internal: b.internal } });
    if (!b.internal) {
      if (t.status === 'OPEN') await db.supportTicket.update({ where: { id: t.id }, data: { status: 'IN_PROGRESS' } });
      await notify(db, t.userId, { kind: 'support', title: 'Support replied', body: b.body.slice(0, 120), data: { ticketId: t.id } });
    }
    return { ok: true };
  });
  app.patch('/admin/support/:id', g('support', 'write'), async (req: any) => {
    const b = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(), assignedTo: uuid.nullable().optional() }).parse(req.body);
    if (b.assignedTo && !(await db.adminUser.findUnique({ where: { id: b.assignedTo } }))) throw new HttpError(400, 'assignee is not an admin');
    await db.supportTicket.update({ where: { id: uuid.parse(req.params.id) }, data: b });
    await audit(db, req.admin.id, 'support.update', req.params.id, b);
    return { ok: true };
  });

  // ---- settings (rules, foul penalties, queen rules, rewards, ads, branding, leaderboard periods, products, game) ----
  app.get('/admin/settings', { preHandler: adminGuard(db, 'dashboard') }, async (req: any) => {
    const out: Record<string, unknown> = {};
    for (const k of SETTING_KEYS) if (can(req.admin.role, SETTING_MODULE[k], 'read')) out[k] = await getSetting(db, k);
    return out;
  });
  app.put('/admin/settings/:key', { preHandler: adminGuard(db, 'dashboard') }, async (req: any) => {
    const key = z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]).parse(req.params.key);
    if (!can(req.admin.role, SETTING_MODULE[key], 'write')) throw new HttpError(403, 'forbidden');
    const value = await setSetting(db, key, req.body, req.admin.id);
    await audit(db, req.admin.id, 'settings.update', key, { value });
    return value;
  });
  app.get('/admin/settings-schema', { preHandler: adminGuard(db, 'dashboard') }, async () => Object.fromEntries(SETTING_KEYS.map((k) => [k, SETTINGS[k].default])));

  // ---- content CRUD ----
  const crud = (path: string, module: Module, model: 'mission' | 'achievement' | 'inventoryItem', schema: z.ZodObject<any>) => {
    const m = (db as any)[model];
    app.get(`/admin/${path}`, g(module), async () => m.findMany({ orderBy: { id: 'asc' } }));
    app.post(`/admin/${path}`, g(module, 'write'), async (req: any, reply) => {
      const data = schema.parse(req.body);
      if (await m.findUnique({ where: { id: data.id } })) throw new HttpError(409, 'id already exists');
      const row = await m.create({ data });
      await audit(db, req.admin.id, `${path}.create`, data.id);
      return reply.status(201).send(row);
    });
    app.put(`/admin/${path}/:id`, g(module, 'write'), async (req: any) => {
      const { id: _ignored, ...data } = schema.partial().parse({ ...req.body, id: req.params.id });
      const row = await m.update({ where: { id: req.params.id }, data }).catch(() => { throw new HttpError(404, 'not found'); });
      await audit(db, req.admin.id, `${path}.update`, req.params.id, data);
      return row;
    });
    // never hard-delete: items/missions may be referenced by history; deactivate instead
    app.delete(`/admin/${path}/:id`, g(module, 'write'), async (req: any) => {
      await m.update({ where: { id: req.params.id }, data: { active: false } }).catch(() => { throw new HttpError(404, 'not found'); });
      await audit(db, req.admin.id, `${path}.deactivate`, req.params.id);
      return { ok: true };
    });
  };
  const idStr = z.string().regex(/^[A-Za-z0-9_]{2,40}$/);
  crud('missions', 'missions', 'mission', z.object({ id: idStr, title: z.string().min(1).max(100), metric: z.enum(['matches_played', 'matches_won', 'coins_pocketed', 'friend_matches', 'queen_covers', 'fouls']), target: z.number().int().min(1).max(1000), rewardCoins: z.number().int().min(0).max(100000), active: z.boolean().default(true) }));
  crud('achievements', 'achievements', 'achievement', z.object({ id: idStr, title: z.string().min(1).max(100), metric: z.enum(['wins_total', 'matches_total', 'win_streak', 'perfect_game', 'queen_covers_total']), target: z.number().int().min(1).max(100000), rewardCoins: z.number().int().min(0).max(100000), active: z.boolean().default(true) }));
  crud('items', 'inventory', 'inventoryItem', z.object({ id: idStr, category: z.enum(['STRIKER', 'BOARD', 'AVATAR', 'FRAME', 'EFFECT', 'EMOTE']), name: z.string().min(1).max(60), imageUrl: z.string().max(500).nullable().optional(), price: z.number().int().min(0).max(1_000_000), rarity: z.enum(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']).default('COMMON'), active: z.boolean().default(true), meta: z.record(z.any()).default({}) }));

  // ---- transactions / notifications / admins / audit ----
  app.get('/admin/transactions', g('transactions'), async (req) => {
    const q = page.extend({ userId: uuid.optional(), type: z.string().optional() }).parse(req.query);
    const where: any = { ...(q.userId ? { userId: q.userId } : {}), ...(q.type ? { type: q.type } : {}) };
    const [total, rows] = await Promise.all([db.walletTransaction.count({ where }), db.walletTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, ...skip(q) })]);
    return { total, items: rows.map((t) => ({ id: t.id, userId: t.userId, type: t.type, amount: Number(t.amount), balanceAfter: Number(t.balanceAfter), note: t.note, createdAt: t.createdAt })) };
  });

  app.post('/admin/notifications/broadcast', g('notifications', 'write'), async (req: any) => {
    const b = z.object({ title: z.string().min(1).max(80), body: z.string().min(1).max(300), kind: z.string().max(30).default('event'), userIds: z.array(uuid).max(5000).optional() }).parse(req.body);
    const users = await db.user.findMany({ where: { isBanned: false, isBot: false, ...(b.userIds ? { id: { in: b.userIds } } : {}) }, select: { id: true } });
    for (let i = 0; i < users.length; i += 500) {
      await db.notification.createMany({ data: users.slice(i, i + 500).map((u) => ({ userId: u.id, kind: b.kind, title: b.title, body: b.body })) });
    }
    await audit(db, req.admin.id, 'notifications.broadcast', undefined, { title: b.title, recipients: users.length });
    return { recipients: users.length };
  });

  app.get('/admin/admins', g('admins'), async () => (await db.adminUser.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => ({ id: a.id, email: a.email, role: a.role, createdAt: a.createdAt })));
  app.post('/admin/admins', g('admins', 'write'), async (req: any, reply) => {
    const b = z.object({ email: z.string().email(), password: z.string().min(10).max(128), role: z.enum(['SUPER_ADMIN', 'ADMIN', 'GAME_MANAGER', 'SUPPORT_MANAGER', 'FINANCE_MANAGER']) }).parse(req.body);
    try { const a = await createAdmin(db, b.email, b.password, b.role); await audit(db, req.admin.id, 'admin.create', a.email, { role: b.role }); return reply.status(201).send({ id: a.id, email: a.email, role: a.role }); }
    catch (e: any) { if (e?.code === 'P2002') throw new HttpError(409, 'email already exists'); throw e; }
  });
  app.patch('/admin/admins/:id', g('admins', 'write'), async (req: any) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ role: z.enum(['SUPER_ADMIN', 'ADMIN', 'GAME_MANAGER', 'SUPPORT_MANAGER', 'FINANCE_MANAGER']) }).parse(req.body);
    const target = await db.adminUser.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, 'admin not found');
    if (target.role === 'SUPER_ADMIN' && b.role !== 'SUPER_ADMIN' && (await db.adminUser.count({ where: { role: 'SUPER_ADMIN' } })) <= 1) throw new HttpError(409, 'at least one super admin is required');
    await db.adminUser.update({ where: { id }, data: { role: b.role } });
    await audit(db, req.admin.id, 'admin.role', target.email, { role: b.role });
    return { ok: true };
  });
  app.delete('/admin/admins/:id', g('admins', 'write'), async (req: any) => {
    const id = uuid.parse(req.params.id);
    if (id === req.admin.id) throw new HttpError(400, 'you cannot delete yourself');
    const target = await db.adminUser.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, 'admin not found');
    if (target.role === 'SUPER_ADMIN' && (await db.adminUser.count({ where: { role: 'SUPER_ADMIN' } })) <= 1) throw new HttpError(409, 'at least one super admin is required');
    await db.adminUser.delete({ where: { id } });
    await audit(db, req.admin.id, 'admin.delete', target.email);
    return { ok: true };
  });
  app.get('/admin/audit', g('audit_logs'), async (req) => {
    const q = page.parse(req.query);
    const [total, rows] = await Promise.all([db.auditLog.count(), db.auditLog.findMany({ orderBy: { id: 'desc' }, ...skip(q) })]);
    return { total, items: rows.map((r) => ({ ...r, id: Number(r.id) })) };
  });
}
