import { Redis } from 'ioredis';
import { config } from './common/config';
import { prisma } from './common/db';
import { buildApp } from './app';
import { attachGameServer } from './websocket/socket';

const app = buildApp(prisma);
await app.ready();
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 }) : undefined;
redis?.on('error', () => {});
attachGameServer(app.server, prisma, redis as any, { entryCoins: 50 });
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`Carrom Arena API + realtime on :${config.port}`);
