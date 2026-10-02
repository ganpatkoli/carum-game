import { Redis } from 'ioredis';
import { buildApp } from './app';
import { config } from './common/config';
import { prisma } from './common/db';
import { startJobs } from './jobs/jobs';
import { attachGameServer } from './websocket/socket';

if (process.env.NODE_ENV === 'production') {
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_ADMIN_SECRET', 'DATABASE_URL']) {
    if (!process.env[k] || /change-me|dev-/.test(process.env[k]!)) throw new Error(`${k} must be set to a strong secret in production`);
  }
}

const app = buildApp(prisma);
await app.ready();
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 }) : undefined;
redis?.on('error', (e) => console.error('redis', e.message));
const game = attachGameServer(app.server, prisma, redis);
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`Carrom Arena API + realtime on :${config.port}`);

const stopJobs = startJobs(prisma, { redis: redis as any, activeMatchIds: () => new Set(game.sessions.keys()) });

const shutdown = async () => { stopJobs(); game.stop(); await app.close(); await prisma.$disconnect(); redis?.disconnect(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
