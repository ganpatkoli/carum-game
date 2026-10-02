import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError } from './http';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? './uploads');

/** Accepts only real PNG/JPEG data (checked by magic bytes, not by the client's claimed type). */
export function saveImageDataUrl(dataUrl: string, folder: string, maxBytes = 1_500_000): string {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, 'expected a PNG or JPEG data URL');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > maxBytes) throw new HttpError(413, 'image too large');
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (!isPng && !isJpg) throw new HttpError(400, 'file is not a valid image');
  const dir = path.join(UPLOAD_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const name = crypto.randomBytes(12).toString('hex') + (isPng ? '.png' : '.jpg');
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/${folder}/${name}`;
}
