import type { ItemCategory, PrismaClient } from '@prisma/client';
import { HttpError } from '../common/http';
import { applyWalletTx } from '../wallet/wallet.service';

const MULTI_EQUIP: ItemCategory[] = ['EMOTE'];
const MAX_EMOTES = 6;

export async function listShop(db: PrismaClient, userId: string) {
  const [items, mine] = await Promise.all([db.inventoryItem.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { price: 'asc' }] }), db.userInventory.findMany({ where: { userId } })]);
  return items.map((i) => {
    const row = mine.find((m) => m.itemId === i.id);
    return { id: i.id, category: i.category, name: i.name, imageUrl: i.imageUrl, price: i.price, rarity: i.rarity, meta: i.meta, owned: i.price === 0 || !!row, equipped: !!row?.equipped, status: i.price === 0 || row ? 'OWNED' : 'LOCKED' };
  });
}

export async function buyItem(db: PrismaClient, userId: string, itemId: string) {
  const item = await db.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item || !item.active) throw new HttpError(404, 'item not found');
  if (await db.userInventory.findUnique({ where: { userId_itemId: { userId, itemId } } })) throw new HttpError(409, 'already owned');
  let balance: number | null = null;
  if (item.price > 0) {
    // idempotent per (user,item): a retry after a crash re-uses the same debit and just completes the grant
    const tx = await applyWalletTx(db, { userId, type: 'PURCHASE', amount: -item.price, idempotencyKey: `shop:${userId}:${itemId}`, refType: 'item', refId: itemId });
    balance = Number(tx.balanceAfter);
  }
  await db.userInventory.createMany({ data: [{ userId, itemId }], skipDuplicates: true });
  return { itemId, balance };
}

export async function grantItem(db: PrismaClient, userId: string, itemId: string) {
  await db.userInventory.createMany({ data: [{ userId, itemId }], skipDuplicates: true });
}

export async function equipItem(db: PrismaClient, userId: string, itemId: string, equipped = true) {
  const item = await db.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item || !item.active) throw new HttpError(404, 'item not found');
  const row = await db.userInventory.findUnique({ where: { userId_itemId: { userId, itemId } } });
  if (!row && item.price > 0) throw new HttpError(403, 'item not owned');
  await db.$transaction(async (tx) => {
    if (!row) await tx.userInventory.create({ data: { userId, itemId } });
    if (MULTI_EQUIP.includes(item.category)) {
      if (equipped) {
        const n = await tx.userInventory.count({ where: { userId, equipped: true, itemId: { in: (await tx.inventoryItem.findMany({ where: { category: item.category }, select: { id: true } })).map((x) => x.id) } } });
        if (n >= MAX_EMOTES) throw new HttpError(409, `at most ${MAX_EMOTES} emotes can be equipped`);
      }
    } else if (equipped) {
      const sameCat = (await tx.inventoryItem.findMany({ where: { category: item.category }, select: { id: true } })).map((x) => x.id);
      await tx.userInventory.updateMany({ where: { userId, itemId: { in: sameCat } }, data: { equipped: false } });
    }
    await tx.userInventory.update({ where: { userId_itemId: { userId, itemId } }, data: { equipped } });
  });
  return { itemId, equipped };
}
