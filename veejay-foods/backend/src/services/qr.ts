import { env } from "../env.js";
import { hmac, safeEqual } from "../lib/crypto.js";

const sig = (orderId: string) => hmac(env.QR_SECRET, `qr:${orderId}`).slice(0, 32);

/** Derived, not stored: the app can always re-render it, and it can't be forged without QR_SECRET. */
export const qrPayload = (orderId: string) => `nbg1.${orderId}.${sig(orderId)}`;

export function parseQrPayload(payload: string): string | null {
  const m = /^nbg1\.([a-z0-9]+)\.([a-f0-9]{32})$/.exec(payload.trim());
  if (!m) return null;
  return safeEqual(m[2], sig(m[1])) ? m[1] : null;
}
