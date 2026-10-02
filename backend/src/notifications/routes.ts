import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userGuard } from '../common/guards';

export function registerNotificationRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);
  app.get('/notifications', { preHandler: guard }, async (req: any) => {
    const q = z.object({ limit: z.coerce.number().min(1).max(100).default(30), before: z.string().optional() }).parse(req.query);
    const rows = await db.notification.findMany({ where: { userId: req.userId, ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}) }, orderBy: { createdAt: 'desc' }, take: q.limit });
    const unread = await db.notification.count({ where: { userId: req.userId, readAt: null } });
    return { unread, items: rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, data: n.data, read: !!n.readAt, createdAt: n.createdAt })) };
  });
  app.post('/notifications/read', { preHandler: guard }, async (req: any) => {
    const b = z.object({ ids: z.array(z.string().uuid()).optional() }).parse(req.body ?? {});
    const r = await db.notification.updateMany({ where: { userId: req.userId, readAt: null, ...(b.ids ? { id: { in: b.ids } } : {}) }, data: { readAt: new Date() } });
    return { updated: r.count };
  });
}
