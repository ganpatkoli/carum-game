import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { config } from '../common/config';
import { HttpError } from '../common/http';
import { getSetting } from '../common/settings';
import { grantItem } from '../inventory/service';
import { applyWalletTx } from '../wallet/wallet.service';

const MIN_WATCH_MS = 15_000;
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

export async function adsRemoved(db: PrismaClient, userId: string) {
  return !!(await db.purchase.findFirst({ where: { userId, productId: 'remove_ads' } }));
}

async function rewardedStatus(db: PrismaClient, userId: string) {
  const ads = await getSetting(db, 'ads');
  if (!ads.enabled || !ads.rewardedEnabled || ads.rewardedCoins <= 0) throw new HttpError(403, 'rewarded ads are disabled');
  const [last, today] = await Promise.all([
    db.walletTransaction.findFirst({ where: { userId, type: 'AD_REWARD' }, orderBy: { createdAt: 'desc' } }),
    db.walletTransaction.count({ where: { userId, type: 'AD_REWARD', createdAt: { gte: dayStart() } } }),
  ]);
  const waitMs = last ? last.createdAt.getTime() + ads.rewardedCooldownSec * 1000 - Date.now() : 0;
  if (today >= ads.rewardedDailyCap) throw new HttpError(429, 'daily rewarded ad limit reached');
  if (waitMs > 0) throw new HttpError(429, `next rewarded ad in ${Math.ceil(waitMs / 1000)}s`);
  return ads;
}

/** Step 1: client is about to show a rewarded ad. We hand out a signed, single-use ticket. */
export async function startRewarded(db: PrismaClient, userId: string) {
  const ads = await rewardedStatus(db, userId);
  const ticket = jwt.sign({ sub: userId, k: 'ad', jti: crypto.randomUUID() }, config.accessSecret, { expiresIn: '10m' });
  return { ticket, rewardCoins: ads.rewardedCoins };
}

/** Step 2: after the ad completes. Pluggable `verifyCompletion` is where AdMob server-side verification belongs. */
export const adHooks = { verifyCompletion: async (_userId: string, _ticketId: string) => true };

export async function claimRewarded(db: PrismaClient, userId: string, ticket: string) {
  let p: jwt.JwtPayload;
  try { p = jwt.verify(ticket, config.accessSecret) as jwt.JwtPayload; } catch { throw new HttpError(400, 'invalid ticket'); }
  if (p.sub !== userId || p.k !== 'ad' || !p.jti || !p.iat) throw new HttpError(400, 'invalid ticket');
  if (Date.now() - p.iat * 1000 < MIN_WATCH_MS) throw new HttpError(400, 'ad was not watched');
  if (!(await adHooks.verifyCompletion(userId, p.jti))) throw new HttpError(400, 'ad not verified');
  const ads = await rewardedStatus(db, userId);
  const tx = await applyWalletTx(db, { userId, type: 'AD_REWARD', amount: ads.rewardedCoins, idempotencyKey: `ad:${p.jti}`, refType: 'ad', refId: p.jti });
  return { coins: ads.rewardedCoins, balance: Number(tx.balanceAfter) };
}

export interface PurchaseVerifier { verify(args: { productId: string; receipt: string; userId: string }): Promise<{ transactionId: string }> }

const notConfigured = (name: string): PurchaseVerifier => ({ async verify() { throw new HttpError(501, `${name} billing verification is not configured`); } });

/**
 * Receipt validation per store. `google` / `apple` must be implemented against the Play Developer API /
 * App Store Server API with your credentials (platform billing is required for digital goods);
 * `dev` is only available outside production and exists for local testing.
 */
export const purchaseVerifiers: Record<string, PurchaseVerifier> = {
  google: notConfigured('Google Play'),
  apple: notConfigured('App Store'),
  dev: {
    async verify({ receipt }) {
      if (process.env.NODE_ENV === 'production') throw new HttpError(403, 'dev billing is disabled');
      return { transactionId: `dev:${receipt}` };
    },
  },
};

export async function redeemPurchase(db: PrismaClient, userId: string, provider: string, productId: string, receipt: string) {
  const verifier = purchaseVerifiers[provider];
  if (!verifier) throw new HttpError(400, 'unknown billing provider');
  const product = (await getSetting(db, 'iap_products')).find((p) => p.id === productId);
  if (!product) throw new HttpError(404, 'unknown product');
  const { transactionId } = await verifier.verify({ productId, receipt, userId });
  const existing = await db.purchase.findUnique({ where: { providerTxnId: transactionId } });
  if (existing) {
    if (existing.userId !== userId) throw new HttpError(409, 'receipt already used');
    return { alreadyProcessed: true };
  }
  try {
    await db.purchase.create({ data: { userId, productId, provider, providerTxnId: transactionId, coins: product.coins, itemId: product.itemId } });
  } catch (e: any) { if (e?.code === 'P2002') return { alreadyProcessed: true }; throw e; }
  let balance: number | null = null;
  if (product.coins > 0) balance = Number((await applyWalletTx(db, { userId, type: 'PURCHASE', amount: product.coins, idempotencyKey: `iap:${transactionId}`, refType: 'purchase', refId: productId })).balanceAfter);
  if (product.itemId) await grantItem(db, userId, product.itemId);
  return { alreadyProcessed: false, coins: product.coins, itemId: product.itemId ?? null, removeAds: !!product.removeAds, balance };
}
