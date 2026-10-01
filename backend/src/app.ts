import cors from '@fastify/cors';
import Fastify from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { HttpError, login, refresh, register, verifyAccess } from './auth/auth.service';
import { claimDaily } from './wallet/rewards.service';

export function buildApp(db: PrismaClient) {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.status(400).send({ error: 'validation', issues: err.issues });
    if (err?.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message });
    console.error(err);
    return reply.status(500).send({ error: 'internal' });
  });

  const auth = async (req: any) => {
    const h = String(req.headers.authorization ?? '');
    try { req.userId = verifyAccess(h.replace(/^Bearer /, '')); } catch { throw new HttpError(401, 'unauthorized'); }
  };

  app.get('/health', async () => ({ ok: true }));

  app.post('/auth/register', async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(60), username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/),
      email: z.string().email().optional(), phone: z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
      password: z.string().min(8).max(128), avatarId: z.string().optional(),
    }).parse(req.body);
    return reply.status(201).send(await register(db, body, { ip: req.ip }));
  });
  app.post('/auth/login', async (req) => {
    const b = z.object({ identifier: z.string(), password: z.string() }).parse(req.body);
    return login(db, b.identifier, b.password, { ip: req.ip });
  });
  app.post('/auth/refresh', async (req) => refresh(db, z.object({ refreshToken: z.string() }).parse(req.body).refreshToken));

  app.get('/me', { preHandler: auth }, async (req: any) => {
    const u = await db.user.findUniqueOrThrow({ where: { id: req.userId }, include: { profile: true, rating: true, wallet: true } });
    return { id: u.id, playerId: u.playerId, profile: u.profile, rating: u.rating?.rating, balance: Number(u.wallet?.balance ?? 0) };
  });

  app.get('/wallet', { preHandler: auth }, async (req: any) => {
    const w = await db.wallet.findUniqueOrThrow({ where: { userId: req.userId } });
    const txs = await db.walletTransaction.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return {
      balance: Number(w.balance), earned: Number(w.totalEarned), spent: Number(w.totalSpent),
      transactions: txs.map((t) => ({ id: t.id, type: t.type, amount: Number(t.amount), balanceAfter: Number(t.balanceAfter), at: t.createdAt })),
    };
  });

  app.post('/rewards/daily/claim', { preHandler: auth }, async (req: any) => claimDaily(db, req.userId));

  app.get('/leaderboard', async (req) => {
    const q = z.object({ limit: z.coerce.number().min(1).max(100).default(50) }).parse(req.query);
    const rows = await db.rating.findMany({ orderBy: { rating: 'desc' }, take: q.limit, include: { user: { include: { profile: true } } } });
    return rows.map((r, i) => ({ rank: i + 1, username: r.user.profile?.username, avatarId: r.user.profile?.avatarId, rating: r.rating, wins: r.user.profile?.matchesWon ?? 0, xp: r.user.profile?.xp ?? 0 }));
  });

  return app;
}
