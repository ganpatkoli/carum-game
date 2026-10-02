import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../common/http';
import { levelForXp } from '../common/progress';
import { notify, realtime } from '../notifications/notify';

export async function isBlockedEitherWay(db: PrismaClient, a: string, b: string) {
  return !!(await db.blockedUser.findFirst({ where: { OR: [{ userId: a, blockedId: b }, { userId: b, blockedId: a }] } }));
}

export async function areFriends(db: PrismaClient, a: string, b: string) {
  return !!(await db.friend.findUnique({ where: { userId_friendId: { userId: a, friendId: b } } }));
}

export async function listFriends(db: PrismaClient, userId: string) {
  const rows = await db.friend.findMany({ where: { userId } });
  const profiles = await db.profile.findMany({ where: { userId: { in: rows.map((r) => r.friendId) } }, include: { user: { include: { rating: true } } } });
  return profiles.map((p) => {
    const hide = ((p.privacy ?? {}) as { hideOnline?: boolean }).hideOnline;
    return { id: p.userId, username: p.username, avatarId: p.avatarId, imageUrl: p.imageUrl, level: levelForXp(p.xp), rating: p.user.rating?.rating ?? 1200, online: hide ? false : realtime.isOnline(p.userId) };
  }).sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
}

async function makeFriends(db: PrismaClient, a: string, b: string) {
  await db.$transaction([
    db.friend.createMany({ data: [{ userId: a, friendId: b }, { userId: b, friendId: a }], skipDuplicates: true }),
  ]);
}

export async function sendRequest(db: PrismaClient, from: string, to: string) {
  if (from === to) throw new HttpError(400, 'cannot add yourself');
  const target = await db.profile.findUnique({ where: { userId: to } });
  if (!target) throw new HttpError(404, 'user not found');
  if (await isBlockedEitherWay(db, from, to)) throw new HttpError(403, 'unavailable');
  if (((target.privacy ?? {}) as { friendRequests?: string }).friendRequests === 'nobody') throw new HttpError(403, 'this player is not accepting requests');
  if (await areFriends(db, from, to)) throw new HttpError(409, 'already friends');
  // the other side already asked us: treat this as acceptance
  const reverse = await db.friendRequest.findUnique({ where: { fromId_toId: { fromId: to, toId: from } } });
  if (reverse?.status === 'PENDING') { await acceptRequest(db, reverse.id, from); return { status: 'ACCEPTED' as const }; }
  const existing = await db.friendRequest.findUnique({ where: { fromId_toId: { fromId: from, toId: to } } });
  if (existing?.status === 'PENDING') throw new HttpError(409, 'request already sent');
  const req = existing
    ? await db.friendRequest.update({ where: { id: existing.id }, data: { status: 'PENDING', createdAt: new Date() } })
    : await db.friendRequest.create({ data: { fromId: from, toId: to } });
  const me = await db.profile.findUnique({ where: { userId: from } });
  await notify(db, to, { kind: 'friend_request', title: 'New friend request', body: `${me?.username} wants to be your friend`, data: { requestId: req.id, fromId: from } });
  return { status: 'PENDING' as const, id: req.id };
}

export async function acceptRequest(db: PrismaClient, requestId: string, userId: string) {
  const r = await db.friendRequest.findUnique({ where: { id: requestId } });
  if (!r || r.toId !== userId || r.status !== 'PENDING') throw new HttpError(404, 'request not found');
  if (await isBlockedEitherWay(db, r.fromId, r.toId)) throw new HttpError(403, 'unavailable');
  await db.friendRequest.update({ where: { id: r.id }, data: { status: 'ACCEPTED' } });
  await makeFriends(db, r.fromId, r.toId);
  const me = await db.profile.findUnique({ where: { userId } });
  await notify(db, r.fromId, { kind: 'friend_request', title: 'Friend request accepted', body: `${me?.username} is now your friend`, data: { friendId: userId } });
}

export async function rejectRequest(db: PrismaClient, requestId: string, userId: string) {
  const r = await db.friendRequest.findUnique({ where: { id: requestId } });
  if (!r || r.toId !== userId || r.status !== 'PENDING') throw new HttpError(404, 'request not found');
  await db.friendRequest.update({ where: { id: r.id }, data: { status: 'REJECTED' } });
}

export async function removeFriend(db: PrismaClient, a: string, b: string) {
  await db.friend.deleteMany({ where: { OR: [{ userId: a, friendId: b }, { userId: b, friendId: a }] } });
}

export async function blockUser(db: PrismaClient, userId: string, targetId: string) {
  if (userId === targetId) throw new HttpError(400, 'cannot block yourself');
  await db.blockedUser.createMany({ data: [{ userId, blockedId: targetId }], skipDuplicates: true });
  await removeFriend(db, userId, targetId);
  await db.friendRequest.deleteMany({ where: { OR: [{ fromId: userId, toId: targetId }, { fromId: targetId, toId: userId }] } });
}
