import { z } from "zod";

export const BRAND = "Veejay Foods";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(8).default("dev-access-secret"),
  OTP_SECRET: z.string().min(8).default("dev-otp-secret"),
  QR_SECRET: z.string().min(8).default("dev-qr-secret"),
  PAYSTACK_SECRET_KEY: z.string().default("sk_test_dev"),
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  APP_CALLBACK_URL: z.string().default("veejay://payment-complete"),
  SMS_PROVIDER: z.enum(["console", "termii"]).default("console"),
  PAYSTACK_EMAIL_DOMAIN: z.string().default("veejay.invalid"),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default("development"),
});

export const env = schema.parse(process.env);
if (env.NODE_ENV === "production") {
  // Fail fast rather than run real money with placeholder or guessable secrets.
  const weak: string[] = (["JWT_ACCESS_SECRET", "OTP_SECRET", "QR_SECRET"] as const).filter(
    (k) => env[k].length < 32 || /^(dev-|change-me)/.test(env[k]),
  );
  if (env.PAYSTACK_SECRET_KEY === "sk_test_dev") weak.push("PAYSTACK_SECRET_KEY");
  if (env.PAYSTACK_EMAIL_DOMAIN.endsWith(".invalid")) weak.push("PAYSTACK_EMAIL_DOMAIN");
  if (weak.length) throw new Error(`Set real values (secrets: 32+ random characters) for: ${weak.join(", ")}`);
  // The console SMS provider prints login codes to the server log — never acceptable with real customers.
  if (env.SMS_PROVIDER === "console") throw new Error("SMS_PROVIDER=console is not allowed in production (login codes would be logged). Use termii.");
}

// Policy constants
export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_DAYS = 30;
export const REFRESH_REUSE_GRACE_SEC = 60;
export const OTP_TTL_SEC = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const PAYMENT_HOLD_MIN = 15;
