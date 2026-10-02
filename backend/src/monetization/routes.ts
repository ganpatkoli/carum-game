import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userGuard } from '../common/guards';
import { getSetting } from '../common/settings';
import { adsRemoved, claimRewarded, redeemPurchase, startRewarded } from './service';

export function registerMonetizationRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);
  app.get('/ads/config', { preHandler: guard }, async (req: any) => {
    const ads = await getSetting(db, 'ads');
    const removed = await adsRemoved(db, req.userId);
    // purchasing "remove ads" disables banners/interstitials, rewarded ads stay (they are opt-in)
    return { ...ads, bannerEnabled: ads.bannerEnabled && !removed, interstitialEnabled: ads.interstitialEnabled && !removed, adsRemoved: removed };
  });
  app.post('/ads/rewarded/start', { preHandler: guard }, async (req: any) => startRewarded(db, req.userId));
  app.post('/ads/rewarded/claim', { preHandler: guard }, async (req: any) => claimRewarded(db, req.userId, z.object({ ticket: z.string() }).parse(req.body).ticket));

  app.get('/store/products', { preHandler: guard }, async () => getSetting(db, 'iap_products'));
  app.post('/store/redeem', { preHandler: guard }, async (req: any) => {
    const b = z.object({ provider: z.enum(['google', 'apple', 'dev']), productId: z.string(), receipt: z.string().min(1).max(8000) }).parse(req.body);
    return redeemPurchase(db, req.userId, b.provider, b.productId, b.receipt);
  });
}
