import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userGuard } from '../common/guards';
import { acceptRequest, blockUser, listFriends, rejectRequest, removeFriend, sendRequest } from './service';

const uuid = z.string().uuid();

export function registerFriendRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);

  app.get('/friends', { preHandler: guard }, async (req: any) => listFriends(db, req.userId));

  app.get('/friends/requests', { preHandler: guard }, async (req: any) => {
    const [incoming, outgoing] = await Promise.all([
      db.friendRequest.findMany({ where: { toId: req.userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } }),
      db.friendRequest.findMany({ where: { fromId: req.userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } }),
    ]);
    const ids = [...incoming.map((r) => r.fromId), ...outgoing.map((r) => r.toId)];
    const profiles = await db.profile.findMany({ where: { userId: { in: ids } } });
    const who = (id: string) => { const p = profiles.find((x) => x.userId === id); return { id, username: p?.username, avatarId: p?.avatarId }; };
    return { incoming: incoming.map((r) => ({ id: r.id, from: who(r.fromId), at: r.createdAt })), outgoing: outgoing.map((r) => ({ id: r.id, to: who(r.toId), at: r.createdAt })) };
  });

  app.post('/friends/requests', { preHandler: guard }, async (req: any) => {
    const b = z.object({ toUserId: uuid.optional(), username: z.string().optional() }).refine((v) => v.toUserId || v.username).parse(req.body);
    let to = b.toUserId;
    if (!to) to = (await db.profile.findFirst({ where: { username: { equals: b.username!, mode: 'insensitive' } } }))?.userId;
    if (!to) return { status: 'NOT_FOUND' };
    return sendRequest(db, req.userId, to);
  });
  app.post('/friends/requests/:id/accept', { preHandler: guard }, async (req: any) => { await acceptRequest(db, uuid.parse(req.params.id), req.userId); return { ok: true }; });
  app.post('/friends/requests/:id/reject', { preHandler: guard }, async (req: any) => { await rejectRequest(db, uuid.parse(req.params.id), req.userId); return { ok: true }; });
  app.delete('/friends/:id', { preHandler: guard }, async (req: any) => { await removeFriend(db, req.userId, uuid.parse(req.params.id)); return { ok: true }; });

  app.get('/blocks', { preHandler: guard }, async (req: any) => {
    const rows = await db.blockedUser.findMany({ where: { userId: req.userId } });
    const profiles = await db.profile.findMany({ where: { userId: { in: rows.map((r) => r.blockedId) } } });
    return profiles.map((p) => ({ id: p.userId, username: p.username, avatarId: p.avatarId }));
  });
  app.post('/blocks', { preHandler: guard }, async (req: any) => { await blockUser(db, req.userId, z.object({ userId: uuid }).parse(req.body).userId); return { ok: true }; });
  app.delete('/blocks/:id', { preHandler: guard }, async (req: any) => { await db.blockedUser.deleteMany({ where: { userId: req.userId, blockedId: uuid.parse(req.params.id) } }); return { ok: true }; });
}
