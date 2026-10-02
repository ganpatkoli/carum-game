import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sentOtps, startTestServer, tag } from './helpers';
import { socialVerifiers } from '../src/auth/social';

let t: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => { t = await startTestServer(); });
afterAll(async () => { await t.stop(); });

const phone = () => '+9198' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');

describe('registration with phone OTP', () => {
  it('requires OTP proof for a phone number, then registers and logs in by phone', async () => {
    const p = phone(); const u = tag();
    expect((await t.http('POST', '/auth/register', { name: 'A', username: `a_${u}`, phone: p, password: 'password123' })).status).toBe(400);

    const r = await t.http('POST', '/auth/otp/request', { target: p, purpose: 'register' });
    expect(r.status).toBe(200);
    const code = sentOtps.filter((o) => o.target === p).at(-1)!.code;
    expect(r.body.devCode).toBe(code);
    // second request within a minute is throttled
    expect((await t.http('POST', '/auth/otp/request', { target: p, purpose: 'register' })).status).toBe(429);

    const bad = await t.http('POST', '/auth/otp/verify', { target: p, purpose: 'register', code: code === '000000' ? '111111' : '000000' });
    expect(bad.status).toBe(400);
    const ok = await t.http('POST', '/auth/otp/verify', { target: p, purpose: 'register', code });
    expect(ok.status).toBe(200);
    // code is single-use
    expect((await t.http('POST', '/auth/otp/verify', { target: p, purpose: 'register', code })).status).toBe(400);

    // proof for a different number is rejected
    expect((await t.http('POST', '/auth/register', { name: 'A', username: `a_${u}`, phone: phone(), password: 'password123', verifiedToken: ok.body.verifiedToken })).status).toBe(400);
    const reg = await t.http('POST', '/auth/register', { name: 'A', username: `a_${u}`, phone: p, email: `a${u}@t.dev`, password: 'password123', verifiedToken: ok.body.verifiedToken, avatarId: 'avatar_03', country: 'IN' });
    expect(reg.status).toBe(201);
    expect((await t.http('POST', '/auth/login', { identifier: p, password: 'password123' })).status).toBe(200);
    // already registered numbers cannot ask for a register code again
    expect((await t.http('POST', '/auth/otp/request', { target: p, purpose: 'register' })).status).toBe(409);
  });

  it('burns a code after 5 wrong guesses', async () => {
    const p = phone();
    await t.http('POST', '/auth/otp/request', { target: p, purpose: 'register' });
    const code = sentOtps.filter((o) => o.target === p).at(-1)!.code;
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) await t.http('POST', '/auth/otp/verify', { target: p, purpose: 'register', code: wrong });
    expect((await t.http('POST', '/auth/otp/verify', { target: p, purpose: 'register', code })).status).toBe(400);
  });

  it('checks username availability case-insensitively', async () => {
    const u = await t.registerUser('Zed');
    expect((await t.http('GET', `/auth/username-available?u=${u.username.toUpperCase()}`)).body.available).toBe(false);
    expect((await t.http('GET', `/auth/username-available?u=free_${tag()}`)).body.available).toBe(true);
    expect((await t.http('GET', '/auth/username-available?u=a')).status).toBe(400);
  });
});

describe('passwords', () => {
  it('forgot → reset password flow; old password stops working; unknown accounts get the same answer', async () => {
    const u = await t.registerUser('Pw');
    const f = await t.http('POST', '/auth/password/forgot', { identifier: u.email });
    expect(f.status).toBe(200);
    const unknown = await t.http('POST', '/auth/password/forgot', { identifier: `nobody${tag()}@t.dev` });
    expect(unknown.body.sent).toBe(true);
    const code = sentOtps.filter((o) => o.target === u.email.toLowerCase()).at(-1)!.code;
    expect((await t.http('POST', '/auth/password/reset', { identifier: u.email, code, newPassword: 'newpassword1' })).status).toBe(200);
    expect((await t.http('POST', '/auth/login', { identifier: u.email, password: 'password123' })).status).toBe(401);
    expect((await t.http('POST', '/auth/login', { identifier: u.email, password: 'newpassword1' })).status).toBe(200);
    // sessions from before the reset are revoked
    expect((await t.http('POST', '/auth/refresh', { refreshToken: u.refreshToken })).status).toBe(401);
  });

  it('change password needs the current one and signs out other devices', async () => {
    const u = await t.registerUser('Chg');
    expect((await t.http('POST', '/auth/password/change', { currentPassword: 'wrongwrong', newPassword: 'another1234' }, u.accessToken)).status).toBe(403);
    const other = await t.http('POST', '/auth/login', { identifier: u.email, password: 'password123' });
    expect((await t.http('POST', '/auth/password/change', { currentPassword: 'password123', newPassword: 'another1234', refreshToken: u.refreshToken }, u.accessToken)).status).toBe(200);
    expect((await t.http('POST', '/auth/refresh', { refreshToken: other.body.refreshToken })).status).toBe(401);
    expect((await t.http('POST', '/auth/refresh', { refreshToken: u.refreshToken })).status).toBe(200);
  });

  it('reusing a rotated refresh token is treated as theft and ends every session', async () => {
    const u = await t.registerUser('Theft');
    const next = (await t.http('POST', '/auth/refresh', { refreshToken: u.refreshToken })).body;
    expect((await t.http('POST', '/auth/refresh', { refreshToken: u.refreshToken })).status).toBe(401);
    expect((await t.http('POST', '/auth/refresh', { refreshToken: next.refreshToken })).status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const u = await t.registerUser('Out');
    await t.http('POST', '/auth/logout', { refreshToken: u.refreshToken });
    expect((await t.http('POST', '/auth/refresh', { refreshToken: u.refreshToken })).status).toBe(401);
  });
});

describe('social sign-in', () => {
  const orig = { ...socialVerifiers };
  afterAll(() => Object.assign(socialVerifiers, orig));

  it('creates a profile-incomplete account on first Google login and reuses it after', async () => {
    const sub = 'g-' + tag();
    socialVerifiers.google = async () => ({ sub, email: `g${sub}@t.dev`, name: 'Gee' });
    const first = await t.http('POST', '/auth/google', { idToken: 'x' });
    expect(first.status).toBe(200);
    expect(first.body.isNew).toBe(true);
    const me = await t.http('GET', '/me', undefined, first.body.accessToken);
    expect(me.body.profile.profileComplete).toBe(false);
    expect(me.body.balance).toBe(500);
    const patch = await t.http('PATCH', '/me', { username: `gee_${tag()}`, name: 'Gee G' }, first.body.accessToken);
    expect(patch.body.profile.profileComplete).toBe(true);
    const again = await t.http('POST', '/auth/google', { idToken: 'x' });
    expect(again.body.isNew).toBe(false);
    expect(again.body.userId).toBe(first.body.userId);
  });

  it('links Apple login to an existing account with the same email', async () => {
    const u = await t.registerUser('Ap');
    socialVerifiers.apple = async () => ({ sub: 'a-' + tag(), email: u.email });
    const r = await t.http('POST', '/auth/apple', { identityToken: 'x' });
    expect(r.body.userId).toBe(u.userId);
  });

  it('rejects invalid provider tokens', async () => {
    socialVerifiers.google = async () => { throw Object.assign(new Error('bad'), { status: 401 }); };
    const r = await t.http('POST', '/auth/google', { idToken: 'x' });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe('profile & settings', () => {
  it('edits name/username/avatar/privacy/notifications and rejects duplicate usernames', async () => {
    const a = await t.registerUser('Pa'); const b = await t.registerUser('Pb');
    const ok = await t.http('PATCH', '/me', { name: 'New Name', avatarId: 'avatar_04', privacy: { hideStats: true }, notifPrefs: { push: false }, language: 'hi' }, a.accessToken);
    expect(ok.status).toBe(200);
    expect(ok.body.profile).toMatchObject({ name: 'New Name', avatarId: 'avatar_04', language: 'hi' });
    expect(ok.body.profile.privacy.hideStats).toBe(true);
    expect((await t.http('PATCH', '/me', { username: b.username }, a.accessToken)).status).toBe(409);
    // hidden stats are not exposed publicly
    const pub = await t.http('GET', `/users/${a.userId}/public`, undefined, b.accessToken);
    expect(pub.body.stats).toBeNull();
  });

  it('uploads a real PNG avatar and refuses fake images', async () => {
    const u = await t.registerUser('Img');
    const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]).toString('base64');
    const ok = await t.http('POST', '/me/image', { dataUrl: png }, u.accessToken);
    expect(ok.status).toBe(200);
    expect((await fetch(t.base + ok.body.imageUrl)).status).toBe(200);
    const fake = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
    expect((await t.http('POST', '/me/image', { dataUrl: fake }, u.accessToken)).status).toBe(400);
  });

  it('exposes public config (branding, daily rewards, products)', async () => {
    const c = await t.http('GET', '/config');
    expect(c.body.branding.name).toBeTruthy();
    expect(c.body.dailyRewards).toHaveLength(7);
    expect(c.body.languages).toEqual(['en', 'hi']);
  });

  it('banned users are locked out immediately', async () => {
    const u = await t.registerUser('Ban');
    await t.db.user.update({ where: { id: u.userId }, data: { isBanned: true } });
    expect((await t.http('GET', '/me', undefined, u.accessToken)).status).toBe(403);
    expect((await t.http('POST', '/auth/login', { identifier: u.email, password: 'password123' })).status).toBe(403);
  });
});
