import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userGuard } from '../common/guards';
import { HttpError } from '../common/http';
import { saveImageDataUrl } from '../common/uploads';

export const SUPPORT_CATEGORIES = ['ACCOUNT', 'PAYMENT', 'GAMEPLAY', 'BUG', 'REPORT_APPEAL', 'OTHER'] as const;

export function registerSupportRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);

  app.post('/support/tickets', { preHandler: guard, bodyLimit: 3_000_000 }, async (req: any, reply) => {
    const b = z.object({ category: z.enum(SUPPORT_CATEGORIES), description: z.string().min(10).max(3000), screenshot: z.string().optional() }).parse(req.body);
    const open = await db.supportTicket.count({ where: { userId: req.userId, status: { in: ['OPEN', 'IN_PROGRESS'] } } });
    if (open >= 5) throw new HttpError(429, 'please wait for your open tickets to be resolved');
    const t = await db.supportTicket.create({ data: { userId: req.userId, category: b.category, description: b.description, screenshotUrl: b.screenshot ? saveImageDataUrl(b.screenshot, 'support') : undefined } });
    return reply.status(201).send({ id: t.id, status: t.status });
  });

  app.get('/support/tickets', { preHandler: guard }, async (req: any) =>
    (await db.supportTicket.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 50 })).map((t) => ({ id: t.id, category: t.category, status: t.status, description: t.description, createdAt: t.createdAt })));

  app.get('/support/tickets/:id', { preHandler: guard }, async (req: any) => {
    const t = await db.supportTicket.findFirst({ where: { id: z.string().uuid().parse(req.params.id), userId: req.userId }, include: { messages: { where: { internal: false }, orderBy: { createdAt: 'asc' } } } });
    if (!t) throw new HttpError(404, 'ticket not found');
    return { id: t.id, category: t.category, status: t.status, description: t.description, screenshotUrl: t.screenshotUrl, createdAt: t.createdAt, messages: t.messages.map((m) => ({ id: m.id, fromSupport: m.authorId !== req.userId, body: m.body, createdAt: m.createdAt })) };
  });

  app.post('/support/tickets/:id/messages', { preHandler: guard }, async (req: any) => {
    const body = z.object({ body: z.string().min(1).max(2000) }).parse(req.body).body;
    const t = await db.supportTicket.findFirst({ where: { id: z.string().uuid().parse(req.params.id), userId: req.userId } });
    if (!t) throw new HttpError(404, 'ticket not found');
    if (t.status === 'CLOSED') throw new HttpError(409, 'ticket is closed');
    await db.supportMessage.create({ data: { ticketId: t.id, authorId: req.userId, body } });
    if (t.status === 'RESOLVED') await db.supportTicket.update({ where: { id: t.id }, data: { status: 'OPEN' } });
    return { ok: true };
  });
}
