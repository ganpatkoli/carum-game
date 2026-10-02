import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { userGuard } from '../common/guards';
import { claimDaily } from '../wallet/rewards.service';
import { dailyStatus } from '../wallet/rewards.service';
import { claimMission, listAchievements, listMissions } from './progress';

export function registerProgressRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);
  app.get('/missions', { preHandler: guard }, async (req: any) => listMissions(db, req.userId));
  app.post('/missions/:id/claim', { preHandler: guard }, async (req: any) => claimMission(db, req.userId, String(req.params.id)));
  app.get('/achievements', { preHandler: guard }, async (req: any) => listAchievements(db, req.userId));
  app.get('/rewards/daily', { preHandler: guard }, async (req: any) => dailyStatus(db, req.userId));
  app.post('/rewards/daily/claim', { preHandler: guard }, async (req: any) => claimDaily(db, req.userId));
}
