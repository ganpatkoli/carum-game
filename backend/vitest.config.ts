import { defineConfig } from 'vitest/config';

/** Tests never touch the dev database: they run against `<name>_test`, which is wiped at the start of every run. */
export function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/carrom';
  const u = new URL(base);
  u.pathname = u.pathname.replace(/\/?$/, '').replace(/(_test)?$/, '_test');
  return u.toString();
}

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // tests share one database and change global settings, so files run one at a time
    fileParallelism: false,
    testTimeout: 30000,
    env: { NODE_ENV: 'test', REQUIRE_PHONE_OTP: 'true', DATABASE_URL: testDatabaseUrl() },
  },
});
