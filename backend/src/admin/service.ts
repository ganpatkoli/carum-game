import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AdminRole, PrismaClient } from '@prisma/client';
import { config } from '../common/config';
import { HttpError } from '../common/http';
import { can, type Action, type Module } from './rbac';

export interface AdminCtx { id: string; email: string; role: AdminRole }

export function signAdmin(a: AdminCtx) {
  return jwt.sign({ sub: a.id, role: a.role }, config.adminSecret, { expiresIn: '8h', audience: 'admin' });
}

export async function adminLogin(db: PrismaClient, email: string, password: string) {
  const a = await db.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ok = await bcrypt.compare(password, a?.passwordHash ?? '$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
  if (!a || !ok) throw new HttpError(401, 'invalid credentials');
  await audit(db, a.id, 'admin.login', a.email);
  return { token: signAdmin(a), admin: { id: a.id, email: a.email, role: a.role } };
}

/** Re-reads the admin row every request so a demoted/removed admin loses access immediately. */
export function adminGuard(db: PrismaClient, module: Module, action: Action = 'read') {
  return async (req: any) => {
    let sub: string;
    try {
      const p = jwt.verify(String(req.headers.authorization ?? '').replace(/^Bearer /, ''), config.adminSecret, { audience: 'admin' }) as jwt.JwtPayload;
      sub = String(p.sub);
    } catch { throw new HttpError(401, 'unauthorized'); }
    const a = await db.adminUser.findUnique({ where: { id: sub } });
    if (!a) throw new HttpError(401, 'unauthorized');
    if (!can(a.role, module, action)) throw new HttpError(403, 'forbidden');
    req.admin = { id: a.id, email: a.email, role: a.role } satisfies AdminCtx;
  };
}

export async function audit(db: PrismaClient, actorId: string | null, action: string, target?: string, meta: Record<string, unknown> = {}) {
  await db.auditLog.create({ data: { actorId, action, target, meta: meta as object } });
}

export async function createAdmin(db: PrismaClient, email: string, password: string, role: AdminRole) {
  return db.adminUser.create({ data: { email: email.trim().toLowerCase(), passwordHash: await bcrypt.hash(password, 11), role } });
}

export async function banUser(db: PrismaClient, userId: string, banned: boolean) {
  await db.user.update({ where: { id: userId }, data: { isBanned: banned } });
  if (banned) await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function analytics(db: PrismaClient) {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const [users, newUsers, active, matches, matchesToday, wallets, openReports, openTickets, suspicious, purchases] = await Promise.all([
    db.user.count({ where: { isBot: false } }), db.user.count({ where: { createdAt: { gte: dayAgo } } }),
    db.user.count({ where: { lastSeenAt: { gte: dayAgo } } }), db.match.count({ where: { status: 'FINISHED' } }),
    db.match.count({ where: { status: 'FINISHED', endedAt: { gte: today } } }),
    db.wallet.aggregate({ _sum: { balance: true, totalEarned: true, totalSpent: true } }),
    db.report.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    db.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    db.match.count({ where: { suspicious: true, reviewed: false } }), db.purchase.count(),
  ]);
  const matchesPerDay = await db.$queryRaw<{ d: string; n: bigint }[]>`
    SELECT to_char(date_trunc('day', "endedAt"), 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "Match"
    WHERE status = 'FINISHED' AND "endedAt" >= now() - interval '14 days' GROUP BY 1 ORDER BY 1`;
  const usersPerDay = await db.$queryRaw<{ d: string; n: bigint }[]>`
    SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "User"
    WHERE "createdAt" >= now() - interval '14 days' GROUP BY 1 ORDER BY 1`;
  return {
    totals: { users, newUsers24h: newUsers, activeUsers24h: active, matches, matchesToday, openReports, openTickets, suspiciousMatches: suspicious, purchases },
    economy: { coinsInCirculation: Number(wallets._sum.balance ?? 0), coinsEarned: Number(wallets._sum.totalEarned ?? 0), coinsSpent: Number(wallets._sum.totalSpent ?? 0) },
    matchesPerDay: matchesPerDay.map((r) => ({ day: r.d, count: Number(r.n) })),
    newUsersPerDay: usersPerDay.map((r) => ({ day: r.d, count: Number(r.n) })),
  };
}
