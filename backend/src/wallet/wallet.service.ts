import { Prisma, type PrismaClient, type TxType, type WalletTransaction } from '@prisma/client';

export class InsufficientFundsError extends Error {
  constructor() { super('insufficient funds'); }
}

export interface TxInput {
  userId: string;
  type: TxType;
  /** signed: positive = credit, negative = debit. Never zero. */
  amount: number;
  /** same key => same result; makes retries and duplicate webhooks safe */
  idempotencyKey: string;
  refType?: string;
  refId?: string;
  note?: string;
}

/**
 * The only code path that changes a balance. Inside one DB transaction it
 * atomically updates the wallet (guarded against going negative) and appends an
 * immutable ledger row. Replays of the same idempotency key return the original row.
 */
export async function applyWalletTx(db: PrismaClient, input: TxInput): Promise<WalletTransaction> {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) throw new Error('amount must be a non-zero integer');
  const existing = await db.walletTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return assertSame(existing, input);

  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ balance: bigint }[]>`
        UPDATE "Wallet"
        SET balance = balance + ${input.amount},
            "totalEarned" = "totalEarned" + ${Math.max(input.amount, 0)},
            "totalSpent"  = "totalSpent"  + ${Math.max(-input.amount, 0)},
            "updatedAt" = now()
        WHERE "userId" = ${input.userId}::uuid AND balance + ${input.amount} >= 0
        RETURNING balance`;
      if (rows.length === 0) {
        const w = await tx.wallet.findUnique({ where: { userId: input.userId } });
        if (!w) throw new Error('wallet not found');
        throw new InsufficientFundsError();
      }
      return tx.walletTransaction.create({
        data: {
          userId: input.userId, type: input.type, amount: BigInt(input.amount), balanceAfter: rows[0].balance,
          idempotencyKey: input.idempotencyKey, refType: input.refType, refId: input.refId, note: input.note,
        },
      });
    });
  } catch (e) {
    // lost a race on the unique key: the other request already committed
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const row = await db.walletTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (row) return assertSame(row, input);
    }
    throw e;
  }
}

function assertSame(row: WalletTransaction, input: TxInput) {
  if (row.userId !== input.userId || Number(row.amount) !== input.amount || row.type !== input.type)
    throw new Error('idempotency key reused with different parameters');
  return row;
}

export async function createWallet(db: PrismaClient, userId: string) {
  return db.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
}
