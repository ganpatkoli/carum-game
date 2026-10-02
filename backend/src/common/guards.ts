import type { PrismaClient } from '@prisma/client';
import { verifyAccess } from '../auth/auth.service';
import { HttpError } from './http';

export function userGuard(db: PrismaClient) {
  return async (req: any) => {
    const h = String(req.headers.authorization ?? '');
    let id: string;
    try { id = verifyAccess(h.replace(/^Bearer /, '')); } catch { throw new HttpError(401, 'unauthorized'); }
    const u = await db.user.findUnique({ where: { id }, select: { isBanned: true } });
    if (!u) throw new HttpError(401, 'unauthorized');
    if (u.isBanned) throw new HttpError(403, 'account suspended');
    req.userId = id;
  };
}
