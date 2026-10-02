import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userGuard } from '../common/guards';
import { buyItem, equipItem, listShop } from './service';

export function registerInventoryRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);
  app.get('/shop', { preHandler: guard }, async (req: any) => listShop(db, req.userId));
  app.post('/shop/buy', { preHandler: guard }, async (req: any) => buyItem(db, req.userId, z.object({ itemId: z.string() }).parse(req.body).itemId));
  app.get('/inventory', { preHandler: guard }, async (req: any) => (await listShop(db, req.userId)).filter((i) => i.owned));
  app.post('/inventory/equip', { preHandler: guard }, async (req: any) => {
    const b = z.object({ itemId: z.string(), equipped: z.boolean().default(true) }).parse(req.body);
    return equipItem(db, req.userId, b.itemId, b.equipped);
  });
}
