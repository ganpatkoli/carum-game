import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from '../common/http';

export interface SocialIdentity { sub: string; email?: string; name?: string }
export interface SocialVerifiers {
  google(idToken: string): Promise<SocialIdentity>;
  apple(identityToken: string): Promise<SocialIdentity>;
}

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const csv = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Real verification against Google / Apple. Audience lists come from env (GOOGLE_CLIENT_IDS, APPLE_CLIENT_IDS). */
export const socialVerifiers: SocialVerifiers = {
  async google(idToken) {
    const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!res.ok) throw new HttpError(401, 'invalid google token');
    const p: any = await res.json();
    const aud = csv(process.env.GOOGLE_CLIENT_IDS);
    if (!aud.length || !aud.includes(p.aud)) throw new HttpError(401, 'google client not allowed');
    if (p.email && p.email_verified !== 'true' && p.email_verified !== true) throw new HttpError(401, 'google email not verified');
    return { sub: String(p.sub), email: p.email, name: p.name };
  },
  async apple(identityToken) {
    const aud = csv(process.env.APPLE_CLIENT_IDS);
    if (!aud.length) throw new HttpError(401, 'apple sign-in is not configured');
    try {
      const { payload } = await jwtVerify(identityToken, APPLE_JWKS, { issuer: 'https://appleid.apple.com', audience: aud });
      return { sub: String(payload.sub), email: payload.email as string | undefined };
    } catch { throw new HttpError(401, 'invalid apple token'); }
  },
};
