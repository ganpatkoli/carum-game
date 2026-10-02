export const config = {
  port: Number(process.env.PORT ?? 4000),
  accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
  adminSecret: process.env.JWT_ADMIN_SECRET ?? 'dev-admin-secret',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
  accessTtl: '15m',
  refreshTtlDays: 30,
  reconnectWindowMs: 30_000,
  turnTimeMs: 45_000,
  signupBonusCoins: 500,
};
