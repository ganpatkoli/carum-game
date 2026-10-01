import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { InsufficientFundsError, applyWalletTx, createWallet } from './wallet.service';

const db = new PrismaClient();
let userId: string;
const key = () => Math.random().toString(36).slice(2);

beforeAll(async () => {
  const u = await db.user.create({ data: { email: `w${key()}@t.dev` } });
  userId = u.id;
  await createWallet(db, userId);
});
afterAll(async () => { await db.$disconnect(); });

describe('wallet ledger (real Postgres)', () => {
  it('credits and debits with a running balance', async () => {
    const a = await applyWalletTx(db, { userId, type: 'BONUS', amount: 500, idempotencyKey: key() });
    expect(a.balanceAfter).toBe(500n);
    const b = await applyWalletTx(db, { userId, type: 'GAME_ENTRY', amount: -200, idempotencyKey: key() });
    expect(b.balanceAfter).toBe(300n);
  });
  it('is idempotent: replaying a key does not double-apply', async () => {
    const k = key();
    const before = (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance;
    const r1 = await applyWalletTx(db, { userId, type: 'DAILY_REWARD', amount: 100, idempotencyKey: k });
    const r2 = await applyWalletTx(db, { userId, type: 'DAILY_REWARD', amount: 100, idempotencyKey: k });
    expect(r2.id).toBe(r1.id);
    expect((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(before + 100n);
  });
  it('is idempotent under concurrent duplicates', async () => {
    const k = key();
    const before = (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance;
    await Promise.all(Array.from({ length: 8 }, () => applyWalletTx(db, { userId, type: 'BONUS', amount: 10, idempotencyKey: k })));
    expect((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(before + 10n);
  });
  it('refuses to overdraw and leaves no ledger row', async () => {
    const k = key();
    await expect(applyWalletTx(db, { userId, type: 'GAME_ENTRY', amount: -10_000_000, idempotencyKey: k })).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await db.walletTransaction.findUnique({ where: { idempotencyKey: k } })).toBeNull();
  });
  it('concurrent debits never push the balance below zero', async () => {
    const w = await db.wallet.findUniqueOrThrow({ where: { userId } });
    const each = Number(w.balance) / 3 + 1;
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => applyWalletTx(db, { userId, type: 'GAME_ENTRY', amount: -Math.floor(each), idempotencyKey: key() })));
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(3);
    expect((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance).toBeGreaterThanOrEqual(0n);
  });
  it('ledger sums to the balance and rows are immutable', async () => {
    const w = await db.wallet.findUniqueOrThrow({ where: { userId } });
    const sum = (await db.walletTransaction.findMany({ where: { userId } })).reduce((s, t) => s + t.amount, 0n);
    expect(sum).toBe(w.balance);
    const t = await db.walletTransaction.findFirstOrThrow({ where: { userId } });
    await expect(db.walletTransaction.update({ where: { id: t.id }, data: { amount: 999n } })).rejects.toThrow();
    await expect(db.walletTransaction.delete({ where: { id: t.id } })).rejects.toThrow();
  });
  it('rejects zero / fractional amounts', async () => {
    await expect(applyWalletTx(db, { userId, type: 'BONUS', amount: 0, idempotencyKey: key() })).rejects.toThrow();
    await expect(applyWalletTx(db, { userId, type: 'BONUS', amount: 1.5, idempotencyKey: key() })).rejects.toThrow();
  });
});
