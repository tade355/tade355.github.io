import jwt from "jsonwebtoken";
import type { Role, User } from "@prisma/client";
import type { Deps } from "../deps.js";
import { env, ACCESS_TTL_SEC, REFRESH_TTL_DAYS, REFRESH_REUSE_GRACE_SEC, OTP_TTL_SEC, OTP_MAX_ATTEMPTS } from "../env.js";
import { hmac, otpCode, randomToken, safeEqual, sha256 } from "../lib/crypto.js";
import { HttpError, unauthorized } from "../lib/errors.js";
import { normalizePhone } from "../lib/phone.js";
import { otpMessage } from "../providers/sms.js";
import { ACTIVE_STATUSES } from "./orderStateMachine.js";

export interface AccessClaims { sub: string; role: Role; outletId: string | null }
export interface TokenPair { accessToken: string; refreshToken: string; expiresIn: number }

const otpHash = (phone: string, code: string) => hmac(env.OTP_SECRET, `${phone}:${code}`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export async function requestOtp(deps: Deps, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  const now = deps.now();
  const recent = await deps.db.otpCode.count({ where: { phone, createdAt: { gt: new Date(now.getTime() - 10 * 60_000) } } });
  if (recent >= 3) throw new HttpError(429, "Too many codes requested. Try again in a few minutes.", "otp_rate_limited");
  const code = otpCode();
  await deps.db.otpCode.create({ data: { phone, codeHash: otpHash(phone, code), expiresAt: new Date(now.getTime() + OTP_TTL_SEC * 1000) } });
  await deps.sms.send(phone, otpMessage(code));
  return { phone };
}

export async function verifyOtp(deps: Deps, rawPhone: string, code: string) {
  const phone = normalizePhone(rawPhone);
  const now = deps.now();
  const rec = await deps.db.otpCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" },
  });
  if (!rec || rec.attempts >= OTP_MAX_ATTEMPTS) throw unauthorized("Invalid or expired code", "bad_otp");
  if (!safeEqual(rec.codeHash, otpHash(phone, code))) {
    await deps.db.otpCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    throw unauthorized("Invalid or expired code", "bad_otp");
  }
  // consume atomically so a code can't be used twice
  const used = await deps.db.otpCode.updateMany({ where: { id: rec.id, consumedAt: null }, data: { consumedAt: now } });
  if (used.count !== 1) throw unauthorized("Invalid or expired code", "bad_otp");
  const user = await deps.db.user.upsert({ where: { phone }, update: {}, create: { phone } });
  return { user, ...(await issueTokens(deps, user)) };
}

export function signAccess(user: Pick<User, "id" | "role" | "outletId">): string {
  const claims: AccessClaims = { sub: user.id, role: user.role, outletId: user.outletId };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL_SEC });
}

export function verifyAccess(token: string): AccessClaims {
  try { return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims; }
  catch { throw unauthorized("Access token expired or invalid", "token_expired"); }
}

async function issueTokens(deps: Deps, user: User, familyId?: string): Promise<TokenPair> {
  const refreshToken = randomToken();
  await deps.db.refreshToken.create({
    data: {
      userId: user.id, tokenHash: sha256(refreshToken), familyId: familyId ?? randomToken(12),
      expiresAt: addDays(deps.now(), REFRESH_TTL_DAYS),
    },
  });
  return { accessToken: signAccess(user), refreshToken, expiresIn: ACCESS_TTL_SEC };
}

export const hasActiveOrder = async (deps: Deps, userId: string) =>
  (await deps.db.order.count({ where: { userId, status: { in: ACTIVE_STATUSES } } })) > 0;

/**
 * Rotate a refresh token. Session-continuity rules:
 *  - sliding 30-day expiry;
 *  - a user with an active (paid, uncollected) order is NEVER signed out: an expired token is still
 *    accepted, and replay of an already-rotated token (lost response on a flaky network) is accepted
 *    without revoking the family;
 *  - otherwise, replay of a rotated token beyond a short grace window revokes the family (theft signal).
 */
export async function refresh(deps: Deps, refreshToken: string): Promise<TokenPair> {
  const now = deps.now();
  const rec = await deps.db.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) }, include: { user: true } });
  if (!rec || rec.revokedAt) throw unauthorized("Session ended. Please sign in again.", "session_ended");
  const active = await hasActiveOrder(deps, rec.userId);

  if (rec.rotatedAt) {
    const withinGrace = now.getTime() - rec.rotatedAt.getTime() <= REFRESH_REUSE_GRACE_SEC * 1000;
    if (!withinGrace && !active) {
      await deps.db.refreshToken.updateMany({ where: { familyId: rec.familyId }, data: { revokedAt: now } });
      throw unauthorized("Session ended. Please sign in again.", "session_ended");
    }
  } else if (rec.expiresAt <= now && !active) {
    throw unauthorized("Session expired. Please sign in again.", "session_expired");
  }

  if (!rec.rotatedAt) await deps.db.refreshToken.update({ where: { id: rec.id }, data: { rotatedAt: now } });
  return issueTokens(deps, rec.user, rec.familyId);
}

export async function logout(deps: Deps, refreshToken: string) {
  const rec = await deps.db.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
  if (rec) await deps.db.refreshToken.updateMany({ where: { familyId: rec.familyId }, data: { revokedAt: deps.now() } });
}
