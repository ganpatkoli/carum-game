import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';
import { config } from '../common/config';
import { applyWalletTx, createWallet } from '../wallet/wallet.service';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface Tokens { accessToken: string; refreshToken: string }

export function signAccess(userId: string) {
  return jwt.sign({ sub: userId }, config.accessSecret, { expiresIn: config.accessTtl as any });
}
export function verifyAccess(token: string): string {
  const p = jwt.verify(token, config.accessSecret) as jwt.JwtPayload;
  if (!p.sub) throw new Error('bad token');
  return p.sub;
}

async function issueTokens(db: PrismaClient, userId: string, meta: { ip?: string; deviceId?: string } = {}): Promise<Tokens> {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  await db.session.create({
    data: {
      userId, refreshTokenHash: sha(refreshToken), ip: meta.ip, deviceId: meta.deviceId,
      expiresAt: new Date(Date.now() + config.refreshTtlDays * 86_400_000),
    },
  });
  return { accessToken: signAccess(userId), refreshToken };
}

export interface RegisterInput { name: string; username: string; email?: string; phone?: string; password: string; avatarId?: string }

export async function register(db: PrismaClient, input: RegisterInput, meta: { ip?: string } = {}) {
  if (!input.email && !input.phone) throw new HttpError(400, 'email or phone required');
  const passwordHash = await bcrypt.hash(input.password, 11);
  try {
    const user = await db.user.create({
      data: {
        email: input.email?.toLowerCase(), phone: input.phone, passwordHash,
        profile: { create: { name: input.name, username: input.username, avatarId: input.avatarId ?? 'avatar_01' } },
        rating: { create: {} },
      },
    });
    await createWallet(db, user.id);
    await applyWalletTx(db, { userId: user.id, type: 'BONUS', amount: config.signupBonusCoins, idempotencyKey: `signup:${user.id}`, note: 'Welcome bonus' });
    return { userId: user.id, ...(await issueTokens(db, user.id, meta)) };
  } catch (e: any) {
    if (e?.code === 'P2002') throw new HttpError(409, 'email, phone or username already taken');
    throw e;
  }
}

export async function login(db: PrismaClient, identifier: string, password: string, meta: { ip?: string } = {}) {
  const user = await db.user.findFirst({ where: { OR: [{ email: identifier.toLowerCase() }, { phone: identifier }] } });
  // compare against a dummy hash when the user is missing so timing does not reveal account existence
  const hash = user?.passwordHash ?? '$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) throw new HttpError(401, 'invalid credentials');
  if (user.isBanned) throw new HttpError(403, 'account suspended');
  return { userId: user.id, ...(await issueTokens(db, user.id, meta)) };
}

/** Rotating refresh tokens: a used token is revoked; reuse of a revoked token kills all sessions. */
export async function refresh(db: PrismaClient, refreshToken: string) {
  const s = await db.session.findUnique({ where: { refreshTokenHash: sha(refreshToken) } });
  if (!s) throw new HttpError(401, 'invalid refresh token');
  if (s.revokedAt) {
    await db.session.updateMany({ where: { userId: s.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw new HttpError(401, 'refresh token reuse detected');
  }
  if (s.expiresAt < new Date()) throw new HttpError(401, 'refresh token expired');
  await db.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
  return { userId: s.userId, ...(await issueTokens(db, s.userId, { ip: s.ip ?? undefined, deviceId: s.deviceId ?? undefined })) };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
