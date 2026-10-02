import { PrismaClient } from '@prisma/client';
import { seedContent } from '../src/common/seed';

export default async function setup() {
  const db = new PrismaClient();
  await seedContent(db);
  await db.$disconnect();
}
