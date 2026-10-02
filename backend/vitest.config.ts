import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // tests share one database and change global settings, so files run one at a time
    fileParallelism: false,
    testTimeout: 30000,
    env: { NODE_ENV: 'test', REQUIRE_PHONE_OTP: 'true' },
  },
});
