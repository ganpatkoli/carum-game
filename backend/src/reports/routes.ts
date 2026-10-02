import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userGuard } from '../common/guards';
import { HttpError } from '../common/http';

export function registerReportRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);
  app.post('/reports', { preHandler: guard }, async (req: any, reply) => {
    const b = z.object({
      targetId: z.string().uuid(), type: z.enum(['CHEATING', 'ABUSE', 'OFFENSIVE', 'SPAM', 'INAPPROPRIATE_USERNAME', 'OTHER']),
      details: z.string().max(1000).optional(), matchId: z.string().uuid().optional(),
    }).parse(req.body);
    if (b.targetId === req.userId) throw new HttpError(400, 'you cannot report yourself');
    if (!(await db.user.findUnique({ where: { id: b.targetId } }))) throw new HttpError(404, 'user not found');
    const dayAgo = new Date(Date.now() - 86_400_000);
    if (await db.report.findFirst({ where: { reporterId: req.userId, targetId: b.targetId, type: b.type, createdAt: { gte: dayAgo } } })) throw new HttpError(429, 'you already reported this player recently');
    const r = await db.report.create({ data: { reporterId: req.userId, targetId: b.targetId, type: b.type, details: b.details, matchId: b.matchId } });
    // several independent cheating reports flag the match for admin review
    if (b.type === 'CHEATING' && b.matchId) {
      const distinct = await db.report.groupBy({ by: ['reporterId'], where: { targetId: b.targetId, type: 'CHEATING', createdAt: { gte: dayAgo } } });
      if (distinct.length >= 3) await db.match.updateMany({ where: { id: b.matchId }, data: { suspicious: true } });
    }
    return reply.status(201).send({ id: r.id, status: r.status });
  });
  app.get('/reports/mine', { preHandler: guard }, async (req: any) =>
    (await db.report.findMany({ where: { reporterId: req.userId }, orderBy: { createdAt: 'desc' }, take: 50 })).map((r) => ({ id: r.id, type: r.type, status: r.status, createdAt: r.createdAt })));
}
