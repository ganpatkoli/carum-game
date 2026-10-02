import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedContent } from '../src/common/seed';

const db = new PrismaClient();

async function main() {
  await seedContent(db);
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
    await db.adminUser.upsert({ where: { email: email.toLowerCase() }, update: {}, create: { email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 11), role: 'SUPER_ADMIN' } });
    console.log(`super admin ready: ${email}`);
  } else console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin user created');
  console.log('seed complete');
}
main().finally(() => db.$disconnect());
