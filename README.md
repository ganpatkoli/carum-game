# CARROM ARENA — Play. Strike. Win.

A multiplayer mobile carrom game: real physics, ranked quick matches, private rooms (2 or 4 players), friends, bots,
coins/rewards/missions/achievements, shop, ads, notifications, anti-cheat, and a full admin console.

| Folder | What it is |
|---|---|
| `packages/game-core` | Deterministic physics engine, board, **configurable rule engine**, AI (easy → expert). Shared by server and app. |
| `backend` | Fastify + Prisma/PostgreSQL + Redis + Socket.IO. Auth, wallet ledger, matchmaking, authoritative game sessions, ELO, missions, shop, admin API, background jobs. |
| `mobile` | Expo (React Native, SDK 57) app: Skia board, offline practice vs AI, online play, i18n (English + Hindi), audio, animations. |
| `admin` | Next.js + Tailwind admin console (React Query, Recharts) with role-based access. |

## Run it locally

Needs Node 20+ (22 recommended), PostgreSQL 14+, and (optionally) Redis.

```powershell
git clone <repo> ; cd carum-game
npm install

# 1. backend
cd backend
copy .env.example .env          # edit DATABASE_URL (and REDIS_URL if you run Redis)
npm run db:setup                # migrations + DB constraints + default content (missions, items, settings)
$env:ADMIN_EMAIL="admin@carrom.dev"; $env:ADMIN_PASSWORD="ChangeMe-12345"; npx tsx prisma/seed.ts   # creates the super admin
npm run dev                     # API + realtime on http://localhost:4000

# 2. admin console (new terminal)
cd admin ; npm run dev          # http://localhost:3001  (sign in with the admin above)

# 3. mobile app (new terminal)
cd mobile
$env:EXPO_PUBLIC_API_URL="http://<your-PC-LAN-IP>:4000"   # a phone cannot reach "localhost"
npx expo start -c               # scan the QR with Expo Go (SDK 57)
```

Docker alternative: copy `.env.example` to `.env`, fill the secrets, then `docker compose up --build`
(Postgres, Redis, API on :4000, admin on :3001). *The compose/Dockerfiles have not been run in the build environment.*

**Ports:** API 4000 · admin 3001 · Expo 8081 (8082 if busy) · Postgres 5432 · Redis 6379.

Web preview of the app (handy for quick UI checks): `cd mobile && npm run web`.

## Tests
```bash
npm test             # game-core + backend (needs Postgres; uses a separate "<db>_test" database that is wiped every run)
npm run typecheck    # all four packages
```
~135 automated tests cover the engine, AI, rules, wallet ledger (idempotency, concurrency, immutability), auth/OTP/refresh
rotation, friends/blocks, rooms, real-time matches between two socket clients (fees, forged shots, reconnect, forfeit, bots,
timeouts, Redis restore), missions/achievements, shop, ads, purchases, leaderboards, offline sync, admin RBAC and background jobs.

## How it works (key decisions)
* **Authoritative server.** Clients send only a shot `(strikerX, angle, power)`. The server validates (turn, rate, placement, ranges),
  simulates it with the shared engine, and broadcasts recorded frames plus the final state. Clients animate the frames and then snap
  to the server state, so they can never forge pockets, positions or scores.
  The engine is a custom fixed-step 2-D physics (not Matter.js) so server and client share one deterministic implementation.
* **Money is a ledger.** `applyWalletTx` is the only code that changes a balance: one DB transaction, idempotency key, guarded update.
  The database itself enforces `balance ≥ 0`, `balance = earned − spent` and an append-only ledger (trigger).
* **Rules are data.** Queen, cover, fouls, penalties, points … live in `app_settings` and are editable in the admin console.
  Rewards, ads, branding, leaderboard periods, XP/coin payouts, turn timer, entry fees and store products too.
* **Redis** keeps live match state (restored after a server restart) and de-duplicates background jobs; PostgreSQL stores results.
* **Anti-boosting.** Matches abandoned almost instantly don't count for rating/missions/achievements; bot games never pay coins.
* **Anti-cheat review.** Rejected shots, per-shot timing, IP/device-key per event are logged; players with repeated violations or
  several cheating reports flag the match for admin review.

## Roles (admin console)
SUPER_ADMIN (everything) · ADMIN · GAME_MANAGER (rules, rewards, content, ads, branding, anti-cheat) · SUPPORT_MANAGER (reports,
tickets, notifications) · FINANCE_MANAGER (wallet, transactions, purchases). The API enforces the matrix on every request.

## Configure integrations (all optional in development)
| Feature | What to set |
|---|---|
| SMS OTP | `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` (otherwise codes are logged and returned as `devCode` outside production) |
| Email OTP | `RESEND_API_KEY`, `MAIL_FROM` |
| Google sign-in | backend `GOOGLE_CLIENT_IDS`; app `EXPO_PUBLIC_GOOGLE_{WEB,IOS,ANDROID}_CLIENT_ID` |
| Apple sign-in | backend `APPLE_CLIENT_IDS` (iOS only) |
| Push | set `extra.eas.projectId` in `mobile/app.json` (Expo push) |
| Production safety | `NODE_ENV=production` + strong `JWT_*_SECRET`s (the server refuses to start with defaults) |

## Honest status — what still needs your accounts/decisions before launch
* **Ads:** the app ships a mock ad provider (`mobile/src/ads/ads.ts`). Plug in AdMob (`react-native-google-mobile-ads`, needs a
  dev build, not Expo Go) and, for rewarded ads, server-side verification (`adHooks.verifyCompletion`).
* **In-app purchases:** the store UI, product catalogue and idempotent redemption are done; Google Play / App Store **receipt
  verification is not implemented** (`purchaseVerifiers.google/apple` return 501). Implement them (or RevenueCat) and set the
  client `IapProvider`. The `dev` provider is disabled in production. Platform billing is required for digital goods.
* **Legal text** (`Terms`, `Privacy`) is placeholder copy. **Store assets**: icons are generated placeholders (`npm run icons`).
* **Cosmetics** are limited to striker colour and board theme in-game; frames/effects/avatars are owned/equippable but have no
  in-game rendering yet. Emote/chat are fixed phrases (no free text) by design.
* **Not validated on real devices**: UI was verified in a browser build (screenshots) and via Android/iOS bundling, but not on a
  phone/emulator. Expect to tune touch feel (pull distance, power curve) and layout on real hardware.
* **Not load-tested.** A single API node handles realtime in memory; horizontal scaling needs sticky sessions or the Socket.IO
  Redis adapter. 4-player games use two shared baselines (teammates alternate on one side).
* Region/latency matchmaking inputs are accepted but the client currently sends a fixed region/latency.
