import { createHmac } from "node:crypto";
import { safeEqual } from "../lib/crypto.js";

export interface PaystackInitResult { authorizationUrl: string; accessCode: string; reference: string }
export interface PaystackVerifyResult {
  status: "success" | "failed" | "abandoned" | "pending" | string;
  reference: string; amountKobo: number; currency: string; channel?: string; id?: string | number; paidAt?: string;
}
export interface PaystackRefundResult { id: string; status: string }

export interface PaystackClient {
  initialize(p: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata?: Record<string, unknown> }): Promise<PaystackInitResult>;
  verify(reference: string): Promise<PaystackVerifyResult>;
  refund(p: { reference: string; amountKobo: number; note?: string }): Promise<PaystackRefundResult>;
}

/** Paystack signs the raw request body with HMAC-SHA512 using your secret key. */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

export function httpPaystack(secretKey: string): PaystackClient {
  const base = "https://api.paystack.co";
  async function call(path: string, init?: RequestInit) {
    const res = await fetch(base + path, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.status === false) throw new Error(`Paystack ${path}: ${json.message ?? res.status}`);
    return json.data;
  }
  return {
    async initialize(p) {
      const d = await call("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: p.email, amount: p.amountKobo, reference: p.reference, currency: "NGN",
          callback_url: p.callbackUrl, channels: ["card", "bank_transfer", "ussd"], metadata: p.metadata,
        }),
      });
      return { authorizationUrl: d.authorization_url, accessCode: d.access_code, reference: d.reference };
    },
    async verify(reference) {
      const d = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
      return { status: d.status, reference: d.reference, amountKobo: d.amount, currency: d.currency, channel: d.channel, id: d.id, paidAt: d.paid_at };
    },
    async refund(p) {
      const d = await call("/refund", {
        method: "POST",
        body: JSON.stringify({ transaction: p.reference, amount: p.amountKobo, merchant_note: p.note }),
      });
      return { id: String(d.id ?? ""), status: d.status };
    },
  };
}
