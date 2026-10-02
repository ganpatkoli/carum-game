import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';
import { config } from '../common/config';
import { HttpError } from '../common/http';
import { getSetting } from '../common/settings';
import { applyWalletTx, createWallet } from '../wallet/wallet.service';
import type { SocialIdentity } from './social';

export { HttpError };

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface Tokens { accessToken: string; refreshToken: string }

export function signAccess(userId: string) {
  return jwt.sign({ sub: userId }, config.accessSecret, { expiresIn: config.accessTtl as any });
}
export function verifyAccess(token: string): string {
  const p = jwt.verify(token, config.accessSecret) as jwt.JwtPayload;
  if (!p.sub || p.aud === 'admin') throw new Error('bad token');
  return p.sub;
}

export async function issueTokens(db: PrismaClient, userId: string, meta: { ip?: string; deviceId?: string } = {}): Promise<Tokens> {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  await db.session.create({
    data: {
      userId, refreshTokenHash: sha(refreshToken), ip: meta.ip, deviceId: meta.deviceId,
      expiresAt: new Date(Date.now() + config.refreshTtlDays * 86_400_000),
    },
  });
  return { accessToken: signAccess(userId), refreshToken };
}

export interface RegisterInput {
  name: string; username: string; email?: string; phone?: string; password: string; avatarId?: string; country?: string; language?: string;
}

async function onboard(db: PrismaClient, userId: string) {
  await createWallet(db, userId);
  const bonus = (await getSetting(db, 'game')).signupBonus;
  if (bonus > 0) await applyWalletTx(db, { userId, type: 'BONUS', amount: bonus, idempotencyKey: `signup:${userId}`, note: 'Welcome bonus' });
}

export async function register(db: PrismaClient, input: RegisterInput, meta: { ip?: string } = {}) {
  if (!input.email && !input.phone) throw new HttpError(400, 'email or phone required');
  const passwordHash = await bcrypt.hash(input.password, 11);
  try {
    const user = await db.user.create({
      data: {
        email: input.email?.toLowerCase(), phone: input.phone, passwordHash,
        profile: { create: { name: input.name, username: input.username, avatarId: input.avatarId ?? 'avatar_01', country: input.country, language: input.language ?? 'en' } },
        rating: { create: {} },
      },
    });
    await onboard(db, user.id);
    return { userId: user.id, ...(await issueTokens(db, user.id, meta)) };
  } catch (e: any) {
    if (e?.code === 'P2002') throw new HttpError(409, 'email, phone or username already taken');
    throw e;
  }
}

export async function login(db: PrismaClient, identifier: string, password: string, meta: { ip?: string } = {}) {
  const id = identifier.includes('@') ? identifier.trim().toLowerCase() : identifier.replace(/[\s-]/g, '');
  const user = await db.user.findFirst({ where: { OR: [{ email: id }, { phone: id }] } });
  // compare against a dummy hash when the user is missing so timing does not reveal account existence
  const hash = user?.passwordHash ?? '$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) throw new HttpError(401, 'invalid credentials');
  if (user.isBanned) throw new HttpError(403, 'account suspended');
  return { userId: user.id, ...(await issueTokens(db, user.id, meta)) };
}

/** Find-or-create by provider id (then by verified email). New social users get a placeholder profile to complete. */
export async function socialLogin(db: PrismaClient, provider: 'google' | 'apple', ident: SocialIdentity, meta: { ip?: string } = {}) {
  const col = provider === 'google' ? 'googleId' : 'appleId';
  let user = await db.user.findFirst({ where: { [col]: ident.sub } });
  let isNew = false;
  if (!user && ident.email) {
    const byEmail = await db.user.findUnique({ where: { email: ident.email.toLowerCase() } });
    if (byEmail) user = await db.user.update({ where: { id: byEmail.id }, data: { [col]: ident.sub } });
  }
  if (!user) {
    isNew = true;
    for (let attempt = 0; attempt < 5 && !user; attempt++) {
      try {
        user = await db.user.create({
          data: {
            [col]: ident.sub, email: ident.email?.toLowerCase(),
            profile: { create: { name: ident.name ?? 'Player', username: 'player_' + crypto.randomBytes(3).toString('hex'), profileComplete: false } },
            rating: { create: {} },
          },
        });
      } catch (e: any) { if (e?.code !== 'P2002') throw e; }
    }
    if (!user) throw new HttpError(500, 'could not create account');
    await onboard(db, user.id);
  }
  if (user.isBanned) throw new HttpError(403, 'account suspended');
  return { userId: user.id, isNew, ...(await issueTokens(db, user.id, meta)) };
}

/** Rotating refresh tokens: a used token is revoked; reuse of a revoked token kills all sessions. */
export async function refresh(db: PrismaClient, refreshToken: string) {
  const s = await db.session.findUnique({ where: { refreshTokenHash: sha(refreshToken) } });
  if (!s) throw new HttpError(401, 'invalid refresh token');
  if (s.revokedAt) {
    // only a token that was already exchanged for a new one counts as theft; logout / password change just end the session
    if (s.rotated) await db.session.updateMany({ where: { userId: s.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw new HttpError(401, s.rotated ? 'refresh token reuse detected' : 'session ended');
  }
  if (s.expiresAt < new Date()) throw new HttpError(401, 'refresh token expired');
  await db.session.update({ where: { id: s.id }, data: { revokedAt: new Date(), rotated: true } });
  return { userId: s.userId, ...(await issueTokens(db, s.userId, { ip: s.ip ?? undefined, deviceId: s.deviceId ?? undefined })) };
}

export async function logout(db: PrismaClient, refreshToken: string) {
  await db.session.updateMany({ where: { refreshTokenHash: sha(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function setPassword(db: PrismaClient, userId: string, newPassword: string, keepRefreshToken?: string) {
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 11) } });
  // password change signs out every other device
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(keepRefreshToken ? { refreshTokenHash: { not: sha(keepRefreshToken) } } : {}) },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(db: PrismaClient, userId: string, current: string, next: string, keepRefreshToken?: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.passwordHash || !(await bcrypt.compare(current, u.passwordHash))) throw new HttpError(403, 'current password is incorrect');
  await setPassword(db, userId, next, keepRefreshToken);
}
