import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';
import { config } from '../common/config';
import { HttpError } from '../common/http';

/** Pluggable delivery. Production wires Twilio (SMS) / Resend (email) by env; dev logs the code. */
export interface OtpSender { send(target: string, code: string): Promise<void> }

export const consoleSender: OtpSender = { async send(target, code) { console.log(`[otp] ${target}: ${code}`); } };

export function envSender(): OtpSender {
  const { TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, RESEND_API_KEY, MAIL_FROM } = process.env;
  return {
    async send(target, code) {
      if (target.includes('@')) {
        if (!RESEND_API_KEY) return consoleSender.send(target, code);
        await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: MAIL_FROM ?? 'no-reply@carromarena.app', to: target, subject: 'Your Carrom Arena code', text: `Your code is ${code}. It expires in 5 minutes.` }),
        });
      } else {
        if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) return consoleSender.send(target, code);
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: target, From: TWILIO_FROM, Body: `Carrom Arena code: ${code}` }),
        });
      }
    },
  };
}

let sender: OtpSender = envSender();
export const setOtpSender = (s: OtpSender) => { sender = s; };

const hash = (code: string, target: string) => crypto.createHmac('sha256', config.accessSecret).update(`${target}:${code}`).digest('hex');
const OTP_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

export const normalizeTarget = (t: string) => (t.includes('@') ? t.trim().toLowerCase() : t.replace(/[\s-]/g, ''));

export async function requestOtp(db: PrismaClient, rawTarget: string, purpose: 'register' | 'reset') {
  const target = normalizeTarget(rawTarget);
  const recent = await db.otpCode.count({ where: { target, purpose, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent >= 1) throw new HttpError(429, 'please wait a minute before requesting another code');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await db.otpCode.create({ data: { target, purpose, codeHash: hash(code, target), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
  await sender.send(target, code);
  return { code }; // routes only expose `code` outside production
}

/** Consumes the newest valid code. Wrong guesses burn attempts; too many invalidates the code. */
export async function checkOtp(db: PrismaClient, rawTarget: string, purpose: 'register' | 'reset', code: string) {
  const target = normalizeTarget(rawTarget);
  const row = await db.otpCode.findFirst({ where: { target, purpose, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  if (!row || row.attempts >= MAX_ATTEMPTS) throw new HttpError(400, 'invalid or expired code');
  const ok = crypto.timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(hash(code, target)));
  if (!ok) {
    await db.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, 'invalid or expired code');
  }
  await db.otpCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
}

/** Short-lived proof that `target` was verified, used by the register / reset step. */
export function signVerifiedToken(target: string, purpose: string) {
  return jwt.sign({ t: normalizeTarget(target), p: purpose }, config.accessSecret, { expiresIn: '15m' });
}
export function readVerifiedToken(token: string, target: string, purpose: string) {
  try {
    const p = jwt.verify(token, config.accessSecret) as { t: string; p: string };
    if (p.t !== normalizeTarget(target) || p.p !== purpose) throw new Error('mismatch');
  } catch { throw new HttpError(400, 'verification expired, please verify again'); }
}
