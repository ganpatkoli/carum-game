import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from '../common/http';
import { SETTINGS } from '../common/settings';
import { isBlockedEitherWay } from '../friends/service';

export const roomOptionsSchema = z.object({
  maxPlayers: z.union([z.literal(2), z.literal(4)]).default(2),
  entryCoins: z.number().int().min(0).max(10_000).default(0),
  boardTheme: z.string().max(40).default('classic'),
  durationSec: z.number().int().min(0).max(3600).optional(),
  rules: (SETTINGS.rules.schema as z.ZodObject<any>).partial().optional(),
});
export type RoomOptions = z.infer<typeof roomOptionsSchema>;

const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
export const formatCode = (digits: string) => `CARROM-${digits}`;
export const parseCode = (raw: string) => {
  const m = /^(?:CARROM-?)?(\d{6})$/i.exec(raw.trim());
  if (!m) throw new HttpError(400, 'invalid room code');
  return formatCode(m[1]);
};

export async function roomView(db: PrismaClient, code: string) {
  const room = await db.room.findUnique({ where: { code }, include: { players: true } });
  if (!room) throw new HttpError(404, 'room not found');
  const profiles = await db.profile.findMany({ where: { userId: { in: room.players.map((p) => p.userId) } } });
  return {
    id: room.id, code: room.code, hostId: room.hostId, status: room.status, maxPlayers: room.maxPlayers, entryCoins: room.entryCoins,
    boardTheme: room.boardTheme, durationSec: room.durationSec, rules: room.rules,
    players: room.players.map((p) => {
      const pr = profiles.find((x) => x.userId === p.userId);
      return { userId: p.userId, ready: p.ready, username: pr?.username, avatarId: pr?.avatarId };
    }),
  };
}

async function assertCanAfford(db: PrismaClient, userId: string, coins: number) {
  if (coins <= 0) return;
  const w = await db.wallet.findUnique({ where: { userId } });
  if (!w || Number(w.balance) < coins) throw new HttpError(402, 'not enough coins for this room');
}

export async function createRoom(db: PrismaClient, hostId: string, raw: unknown) {
  const o = roomOptionsSchema.parse(raw ?? {});
  await assertCanAfford(db, hostId, o.entryCoins);
  // leaving stale open rooms behind would let one user hold many codes
  await db.room.updateMany({ where: { hostId, status: { in: ['OPEN', 'FULL'] } }, data: { status: 'CLOSED' } });
  for (let i = 0; i < 8; i++) {
    try {
      const room = await db.room.create({
        data: {
          code: formatCode(newCode()), hostId, maxPlayers: o.maxPlayers, entryCoins: o.entryCoins, boardTheme: o.boardTheme,
          durationSec: o.durationSec, rules: (o.rules ?? {}) as object, players: { create: { userId: hostId } },
        },
      });
      return roomView(db, room.code);
    } catch (e: any) { if (e?.code !== 'P2002') throw e; }
  }
  throw new HttpError(500, 'could not allocate a room code');
}

export async function joinRoom(db: PrismaClient, userId: string, rawCode: string) {
  const code = parseCode(rawCode);
  const room = await db.room.findUnique({ where: { code }, include: { players: true } });
  if (!room || room.status === 'CLOSED') throw new HttpError(404, 'room not found');
  if (room.players.some((p) => p.userId === userId)) return roomView(db, code);
  if (room.status !== 'OPEN' || room.players.length >= room.maxPlayers) throw new HttpError(409, 'room is full or already started');
  if (await isBlockedEitherWay(db, userId, room.hostId)) throw new HttpError(403, 'unavailable');
  await assertCanAfford(db, userId, room.entryCoins);
  await db.roomPlayer.create({ data: { roomId: room.id, userId } });
  if (room.players.length + 1 >= room.maxPlayers) await db.room.update({ where: { id: room.id }, data: { status: 'FULL' } });
  return roomView(db, code);
}

export async function leaveRoom(db: PrismaClient, userId: string, code: string) {
  const room = await db.room.findUnique({ where: { code }, include: { players: true } });
  if (!room || room.status === 'STARTED') return;
  await db.roomPlayer.deleteMany({ where: { roomId: room.id, userId } });
  const left = room.players.filter((p) => p.userId !== userId);
  if (left.length === 0 || room.hostId === userId) {
    // host leaving closes the room
    await db.room.update({ where: { id: room.id }, data: { status: 'CLOSED' } });
  } else {
    await db.room.update({ where: { id: room.id }, data: { status: 'OPEN' } });
  }
}

export async function setReady(db: PrismaClient, userId: string, code: string, ready: boolean) {
  const room = await db.room.findUnique({ where: { code } });
  if (!room) throw new HttpError(404, 'room not found');
  await db.roomPlayer.updateMany({ where: { roomId: room.id, userId }, data: { ready } });
  return roomView(db, code);
}
