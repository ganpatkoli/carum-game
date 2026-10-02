import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from '../common/http';
import { changePassword, login, logout, refresh, register, setPassword, socialLogin } from './auth.service';
import { checkOtp, normalizeTarget, readVerifiedToken, requestOtp, signVerifiedToken } from './otp';
import { socialVerifiers } from './social';
import { userGuard } from '../common/guards';

const strict = { config: { rateLimit: { max: process.env.NODE_ENV === 'test' ? 1000 : 10, timeWindow: '1 minute' } } };
const password = z.string().min(8).max(128);
const isProd = () => process.env.NODE_ENV === 'production';

export function registerAuthRoutes(app: FastifyInstance, db: PrismaClient) {
  const guard = userGuard(db);

  // --- registration: phone OTP → username/email/password/avatar ---
  app.post('/auth/otp/request', strict, async (req) => {
    const b = z.object({ target: z.string().min(5).max(120), purpose: z.enum(['register', 'reset']) }).parse(req.body);
    if (b.purpose === 'register') {
      const t = normalizeTarget(b.target);
      const taken = await db.user.findFirst({ where: { OR: [{ phone: t }, { email: t }] } });
      if (taken) throw new HttpError(409, 'already registered');
    }
    const { code } = await requestOtp(db, b.target, b.purpose);
    return { sent: true, ...(isProd() ? {} : { devCode: code }) };
  });

  app.post('/auth/otp/verify', strict, async (req) => {
    const b = z.object({ target: z.string(), purpose: z.enum(['register', 'reset']), code: z.string().length(6) }).parse(req.body);
    await checkOtp(db, b.target, b.purpose, b.code);
    return { verifiedToken: signVerifiedToken(b.target, b.purpose) };
  });

  app.get('/auth/username-available', async (req) => {
    const { u } = z.object({ u: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/) }).parse(req.query);
    return { available: !(await db.profile.findFirst({ where: { username: { equals: u, mode: 'insensitive' } } })) };
  });

  app.post('/auth/register', strict, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(60), username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/),
      email: z.string().email().optional(), phone: z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
      password, avatarId: z.string().optional(), country: z.string().length(2).optional(), language: z.string().max(5).optional(),
      /** proof that `phone` was verified through /auth/otp/verify */
      verifiedToken: z.string().optional(),
    }).parse(req.body);
    // a phone number may only be attached to an account if its owner proved control of it
    if (body.phone) {
      if (!body.verifiedToken && process.env.REQUIRE_PHONE_OTP !== 'false') throw new HttpError(400, 'phone verification required');
      if (body.verifiedToken) readVerifiedToken(body.verifiedToken, body.phone, 'register');
    }
    const { verifiedToken: _v, ...input } = body;
    return reply.status(201).send(await register(db, input, { ip: req.ip }));
  });

  app.post('/auth/login', strict, async (req) => {
    const b = z.object({ identifier: z.string(), password: z.string() }).parse(req.body);
    return login(db, b.identifier, b.password, { ip: req.ip });
  });

  app.post('/auth/google', strict, async (req) => {
    const { idToken } = z.object({ idToken: z.string() }).parse(req.body);
    return socialLogin(db, 'google', await socialVerifiers.google(idToken), { ip: req.ip });
  });
  app.post('/auth/apple', strict, async (req) => {
    const { identityToken, name } = z.object({ identityToken: z.string(), name: z.string().optional() }).parse(req.body);
    const ident = await socialVerifiers.apple(identityToken);
    return socialLogin(db, 'apple', { ...ident, name: ident.name ?? name }, { ip: req.ip });
  });

  app.post('/auth/refresh', async (req) => refresh(db, z.object({ refreshToken: z.string() }).parse(req.body).refreshToken));
  app.post('/auth/logout', async (req) => { await logout(db, z.object({ refreshToken: z.string() }).parse(req.body).refreshToken); return { ok: true }; });

  // --- forgot password ---
  app.post('/auth/password/forgot', strict, async (req) => {
    const { identifier } = z.object({ identifier: z.string() }).parse(req.body);
    const t = normalizeTarget(identifier);
    const user = await db.user.findFirst({ where: { OR: [{ phone: t }, { email: t }] } });
    // always answer the same way so this endpoint cannot be used to discover accounts
    if (user) { try { const { code } = await requestOtp(db, t, 'reset'); return { sent: true, ...(isProd() ? {} : { devCode: code }) }; } catch (e) { if (!(e instanceof HttpError)) throw e; } }
    return { sent: true };
  });
  app.post('/auth/password/reset', strict, async (req) => {
    const b = z.object({ identifier: z.string(), code: z.string().length(6), newPassword: password }).parse(req.body);
    await checkOtp(db, b.identifier, 'reset', b.code);
    const t = normalizeTarget(b.identifier);
    const user = await db.user.findFirst({ where: { OR: [{ phone: t }, { email: t }] } });
    if (!user) throw new HttpError(400, 'invalid or expired code');
    await setPassword(db, user.id, b.newPassword);
    return { ok: true };
  });

  app.post('/auth/password/change', { preHandler: guard }, async (req: any) => {
    const b = z.object({ currentPassword: z.string(), newPassword: password, refreshToken: z.string().optional() }).parse(req.body);
    await changePassword(db, req.userId, b.currentPassword, b.newPassword, b.refreshToken);
    return { ok: true };
  });
}
