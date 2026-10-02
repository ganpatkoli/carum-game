import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userGuard } from '../common/guards';
import { leaderboard } from './service';
import { syncOffline, offlineMatchSchema } from '../sync/service';

export function registerLeaderboardRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);
  app.get('/leaderboard', { preHandler: guard }, async (req: any) => {
    const q = z.object({ type: z.enum(['global', 'weekly', 'monthly', 'friends', 'country', 'local']).default('global'), limit: z.coerce.number().min(1).max(100).default(50) }).parse(req.query);
    return leaderboard(db, req.userId, q.type, q.limit);
  });
  app.post('/sync/offline', { preHandler: guard }, async (req: any) =>
    syncOffline(db, req.userId, z.object({ matches: z.array(offlineMatchSchema).max(20) }).parse(req.body).matches));
}
