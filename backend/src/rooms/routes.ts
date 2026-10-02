import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userGuard } from '../common/guards';
import { HttpError } from '../common/http';
import { areFriends } from '../friends/service';
import { notify } from '../notifications/notify';
import { createRoom, joinRoom, leaveRoom, parseCode, roomView } from './service';

export function registerRoomRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);
  app.post('/rooms', { preHandler: guard }, async (req: any, reply) => reply.status(201).send(await createRoom(db, req.userId, req.body)));
  app.post('/rooms/join', { preHandler: guard }, async (req: any) => joinRoom(db, req.userId, z.object({ code: z.string() }).parse(req.body).code));
  app.get('/rooms/:code', { preHandler: guard }, async (req: any) => roomView(db, parseCode(req.params.code)));
  app.post('/rooms/:code/leave', { preHandler: guard }, async (req: any) => { await leaveRoom(db, req.userId, parseCode(req.params.code)); return { ok: true }; });

  /** Play with a friend: creates a private room and sends the friend an invite. */
  app.post('/rooms/invite', { preHandler: guard }, async (req: any) => {
    const b = z.object({ friendId: z.string().uuid(), options: z.any().optional() }).parse(req.body);
    if (!(await areFriends(db, req.userId, b.friendId))) throw new HttpError(403, 'not friends');
    const room = await createRoom(db, req.userId, { maxPlayers: 2, ...(b.options ?? {}) });
    const me = await db.profile.findUnique({ where: { userId: req.userId } });
    await notify(db, b.friendId, { kind: 'game_invite', title: 'Game invite', body: `${me?.username} invited you to play`, data: { code: room.code, fromId: req.userId } });
    return room;
  });
}
