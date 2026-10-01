# CARROM ARENA — Play. Strike. Win.

Monorepo (npm workspaces):

| Path | What |
|---|---|
| `packages/game-core` | Deterministic fixed-step physics, board, configurable rule engine, AI (easy→expert). Shared by server and mobile. |
| `backend` | Fastify + Prisma/PostgreSQL + Socket.IO. Auth (JWT + rotating refresh), wallet ledger, daily rewards, matchmaking, authoritative game sessions, ELO, admin RBAC. |
| `mobile` | Expo Router app: 5-tab shell, Skia board, offline vs-AI play, en/hi i18n. |
| `admin` | Next.js + Tailwind admin shell with role-gated navigation. |

## Run
```bash
npm install
cd backend && cp .env.example .env
npx prisma db push && psql "$DATABASE_URL" -f prisma/constraints.sql   # constraints + immutable ledger trigger
npm run dev                  # API + realtime on :4000
cd ../mobile && npx expo start
cd ../admin && npm run dev   # :3001
npm test                     # game-core + backend (backend tests need Postgres at DATABASE_URL)
```

## Key design decisions
* **Physics is a custom fixed-step engine, not Matter.js.** Server-side validation needs identical results on server and client, so one pure-TS engine is shared. The client sends only a shot `(strikerX, angle, power)`; the server simulates it and broadcasts the authoritative snapshot — clients cannot forge pockets, positions or scores.
* **Wallet:** one function (`applyWalletTx`) updates balance + appends a ledger row in one DB transaction, with idempotency keys. The DB itself enforces `balance >= 0`, `balance = earned − spent`, and ledger immutability (trigger).
* **Rules are data** (`RuleConfig`), not UI code; the admin `app_settings` table is the intended store.

## Status vs. the spec
Done and tested: engine, rules (queen cover, fouls), AI, anti-cheat validation, reconnect/forfeit, matchmaking, ELO, wallet, daily rewards, auth, RBAC matrix, mobile shell + offline game, admin shell.

**Not yet built** (schema exists for most): OTP/Google/Apple sign-in, friends/rooms/private-room endpoints, missions & achievements engines, inventory/shop, support/report endpoints, push notifications, ads & IAP, audio assets, animations, offline-stat sync, admin data screens and admin API endpoints, leaderboard periods. The mobile online-multiplayer client screen is not wired yet. Mobile has been type-checked but not run on a device/emulator, so game feel and drag controls are untuned.
