import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import fs from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { registerAdminRoutes } from './admin/routes';
import { registerAuthRoutes } from './auth/routes';
import { installErrorHandler } from './common/http';
import { UPLOAD_DIR } from './common/uploads';
import { registerFriendRoutes } from './friends/routes';
import { registerInventoryRoutes } from './inventory/routes';
import { registerLeaderboardRoutes } from './leaderboards/routes';
import { registerProgressRoutes } from './missions/routes';
import { registerMonetizationRoutes } from './monetization/routes';
import { registerNotificationRoutes } from './notifications/routes';
import { registerReportRoutes } from './reports/routes';
import { registerRoomRoutes } from './rooms/routes';
import { registerSupportRoutes } from './support/routes';
import { registerUserRoutes } from './users/routes';

export function buildApp(db: PrismaClient) {
  const app = Fastify({ logger: process.env.NODE_ENV === 'production', trustProxy: process.env.TRUST_PROXY === 'true' });
  app.register(cors, { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true });
  // generous global ceiling; sensitive routes set their own tighter limits
  app.register(rateLimit, { global: true, max: process.env.NODE_ENV === 'test' ? 100000 : 300, timeWindow: '1 minute' });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/uploads/' });
  installErrorHandler(app);

  app.get('/health', async () => ({ ok: true }));
  app.get('/ready', async (_req, reply) => {
    try { await db.$queryRaw`SELECT 1`; return { ok: true }; } catch { return reply.status(503).send({ ok: false }); }
  });

  registerAuthRoutes(app, db);
  registerUserRoutes(app, db);
  registerFriendRoutes(app, db);
  registerRoomRoutes(app, db);
  registerProgressRoutes(app, db);
  registerInventoryRoutes(app, db);
  registerMonetizationRoutes(app, db);
  registerReportRoutes(app, db);
  registerSupportRoutes(app, db);
  registerNotificationRoutes(app, db);
  registerLeaderboardRoutes(app, db);
  registerAdminRoutes(app, db);
  return app;
}
