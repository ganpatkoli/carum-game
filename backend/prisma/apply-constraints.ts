import { PrismaClient } from '@prisma/client';
import { applyConstraints } from './constraints';

const db = new PrismaClient();
applyConstraints(db).then(() => console.log('database constraints applied')).finally(() => db.$disconnect());
