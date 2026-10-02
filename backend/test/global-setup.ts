import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { applyConstraints } from '../prisma/constraints';
import { seedContent } from '../src/common/seed';
import { testDatabaseUrl } from '../vitest.config';

export default async function setup() {
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.slice(1);
  if (!/_test$|test/i.test(name)) throw new Error(`refusing to run tests against non-test database "${name}"`);

  // create the test database if it does not exist yet
  const admin = new URL(url); admin.pathname = '/postgres';
  const root = new PrismaClient({ datasources: { db: { url: admin.toString() } } });
  const exists = await root.$queryRawUnsafe<{ n: number }[]>(`SELECT 1 AS n FROM pg_database WHERE datname = '${name.replace(/'/g, "''")}'`);
  if (!exists.length) await root.$executeRawUnsafe(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  await root.$disconnect();

  execSync('npx prisma db push --skip-generate --accept-data-loss', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
  const db = new PrismaClient({ datasources: { db: { url } } });
  await applyConstraints(db);
  // clean slate: wipe everything except nothing — seed re-creates the content tables
  const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await seedContent(db);
  await db.$disconnect();
}
