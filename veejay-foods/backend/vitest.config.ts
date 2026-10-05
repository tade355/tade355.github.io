import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    fileParallelism: false, // all files share one Postgres database
    testTimeout: 20000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/naijabites_test",
      PAYSTACK_SECRET_KEY: "sk_test_unit", JWT_ACCESS_SECRET: "test-access-secret", OTP_SECRET: "test-otp-secret", QR_SECRET: "test-qr-secret",
    },
  },
});
