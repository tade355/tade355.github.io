import { randomBytes } from "node:crypto";
import type { Payment, Prisma } from "@prisma/client";
import type { Deps } from "../deps.js";
import { env } from "../env.js";
import { conflict, notFound } from "../lib/errors.js";
import type { PaystackVerifyResult } from "../providers/paystack.js";
import { notifyStatus } from "./orders.js";
import { assertTransition } from "./orderStateMachine.js";

export async function initiatePayment(deps: Deps, userId: string, orderId: string) {
  const order = await deps.db.order.findFirst({ where: { id: orderId, userId }, include: { user: true } });
  if (!order) throw notFound("Order not found");
  if (order.status !== "PENDING_PAYMENT") throw conflict("This order is not awaiting payment", "not_pending");
  if (order.expiresAt && order.expiresAt <= deps.now()) throw conflict("Payment window expired. Please start a new order.", "order_expired");

  const reference = `nbg_${order.code}_${randomBytes(4).toString("hex")}`;
  // Paystack needs an email per customer; we only have a phone. Set PAYSTACK_EMAIL_DOMAIN to a domain the
  // business controls (Paystack may send receipts here) — never one owned by a stranger.
  const email = `${order.user.phone.replace(/\D/g, "")}@${env.PAYSTACK_EMAIL_DOMAIN}`;
  const init = await deps.paystack.initialize({
    email, amountKobo: order.totalKobo, reference, callbackUrl: `${env.PUBLIC_API_URL}/payments/return`,
    metadata: { orderId: order.id, code: order.code },
  });
  const payment = await deps.db.payment.create({
    data: { orderId: order.id, reference, amountKobo: order.totalKobo, authorizationUrl: init.authorizationUrl },
  });
  return { paymentId: payment.id, reference, authorizationUrl: init.authorizationUrl };
}

export type ChargeOutcome = "paid" | "duplicate" | "unknown_reference" | "amount_mismatch" | "late_auto_refund" | "not_success";

/**
 * Apply a verified-successful Paystack charge to our records. Used by BOTH the webhook and the
 * client-triggered verify endpoint, so they can never disagree. Idempotent.
 * `charge` must come from the signed webhook body or from a server-side /transaction/verify call.
 */
export async function applyCharge(deps: Deps, charge: PaystackVerifyResult): Promise<ChargeOutcome> {
  if (charge.status !== "success") return "not_success";
  let notify: { token: string | null; code: string; orderId: string } | null = null;
  let autoRefund: Payment | null = null;

  const outcome = await deps.db.$transaction(async (tx): Promise<ChargeOutcome> => {
    const payment = await tx.payment.findUnique({ where: { reference: charge.reference }, include: { order: { include: { user: true } } } });
    if (!payment) return "unknown_reference";
    // lock the payment row so webhook + verify racing each other serialize
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (fresh.status === "SUCCESS" || fresh.status === "REFUNDED") return "duplicate";

    if (charge.amountKobo !== fresh.amountKobo || charge.currency !== fresh.currency) {
      await tx.payment.update({ where: { id: fresh.id }, data: { status: "FAILED" } });
      return "amount_mismatch";
    }
    await tx.payment.update({
      where: { id: fresh.id },
      data: { status: "SUCCESS", channel: charge.channel ?? null, paystackId: charge.id != null ? String(charge.id) : null, paidAt: deps.now() },
    });

    const order = payment.order;
    if (order.status === "PENDING_PAYMENT") {
      assertTransition("PENDING_PAYMENT", "PLACED");
      const r = await tx.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: { status: "PLACED", paidAt: deps.now() } });
      if (r.count === 1) {
        await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PLACED" } });
        notify = { token: order.user.expoPushToken, code: order.code, orderId: order.id };
        return "paid";
      }
    }
    // Money arrived but the order was already cancelled/expired → don't keep it; refund automatically.
    autoRefund = { ...fresh, status: "SUCCESS" };
    return "late_auto_refund";
  });

  if (notify) { const n = notify as { token: string | null; code: string; orderId: string }; await notifyStatus(deps, n.token, n.code, n.orderId, "PLACED"); }
  if (outcome === "late_auto_refund" && autoRefund) await startRefund(deps, autoRefund as Payment, { reason: "Order expired before payment arrived" });
  return outcome;
}

/** Create a Refund row and ask Paystack to refund to the original payment method. */
export async function startRefund(deps: Deps, payment: Payment, opts: { reason: string; complaintId?: string; approvedById?: string; amountKobo?: number }) {
  const prior = await deps.db.refund.aggregate({ where: { paymentId: payment.id, status: { not: "FAILED" } }, _sum: { amountKobo: true } });
  const remaining = payment.amountKobo - (prior._sum.amountKobo ?? 0);
  const amountKobo = Math.min(opts.amountKobo ?? remaining, remaining);
  if (amountKobo <= 0) throw conflict("Nothing left to refund on this payment", "fully_refunded");
  const refund = await deps.db.refund.create({
    data: { paymentId: payment.id, amountKobo, reason: opts.reason, complaintId: opts.complaintId, approvedById: opts.approvedById ?? "system" },
  });
  try {
    const r = await deps.paystack.refund({ reference: payment.reference, amountKobo, note: opts.reason });
    return deps.db.refund.update({ where: { id: refund.id }, data: { paystackRefundId: r.id || null } });
  } catch (e) {
    await deps.db.refund.update({ where: { id: refund.id }, data: { status: "FAILED" } });
    throw e;
  }
}

/** Reconcile from the app if the webhook is late: ask Paystack directly (never trust the client). */
export async function verifyLatestPayment(deps: Deps, userId: string, orderId: string) {
  const order = await deps.db.order.findFirst({ where: { id: orderId, userId }, include: { payments: { orderBy: { createdAt: "desc" } } } });
  if (!order) throw notFound("Order not found");
  for (const p of order.payments) {
    if (p.status === "SUCCESS") break;
    const v = await deps.paystack.verify(p.reference);
    if (v.status === "success") await applyCharge(deps, v);
  }
  return deps.db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, payments: true } });
}

/** Paystack refund.processed / refund.failed → finalize our Refund row. */
export async function applyRefundEvent(deps: Deps, type: string, data: any): Promise<"updated" | "ignored"> {
  const txRef: string | undefined = data?.transaction_reference ?? data?.transaction?.reference;
  if (!txRef) return "ignored";
  const payment = await deps.db.payment.findUnique({ where: { reference: txRef } });
  if (!payment) return "ignored";
  const pending = await deps.db.refund.findFirst({ where: { paymentId: payment.id, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (!pending) return "ignored";
  if (type === "refund.processed") {
    await deps.db.refund.update({ where: { id: pending.id }, data: { status: "SUCCESS" } });
    const total = await deps.db.refund.aggregate({ where: { paymentId: payment.id, status: "SUCCESS" }, _sum: { amountKobo: true } });
    if ((total._sum.amountKobo ?? 0) >= payment.amountKobo) await deps.db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
  } else if (type === "refund.failed") {
    await deps.db.refund.update({ where: { id: pending.id }, data: { status: "FAILED" } });
  } else return "ignored";
  return "updated";
}

/** Entry point for the (already signature-verified) webhook body. Idempotent per event. */
export async function handleWebhook(deps: Deps, body: { event: string; data: any }): Promise<{ result: string }> {
  const { event, data } = body;
  const key = `${event}:${data?.reference ?? data?.transaction_reference ?? data?.id ?? "na"}`;
  let rec = await deps.db.webhookEvent.findUnique({ where: { eventKey: key } });
  if (rec?.processedAt) return { result: "duplicate" };
  if (!rec) {
    try { rec = await deps.db.webhookEvent.create({ data: { eventKey: key, type: event, payload: body as unknown as Prisma.InputJsonValue } }); }
    catch { return { result: "duplicate" }; } // lost the insert race to a concurrent delivery
  }
  let result = "ignored";
  if (event === "charge.success") {
    result = await applyCharge(deps, {
      status: data.status, reference: data.reference, amountKobo: data.amount, currency: data.currency, channel: data.channel, id: data.id,
    });
  } else if (event === "refund.processed" || event === "refund.failed") {
    result = await applyRefundEvent(deps, event, data);
  }
  await deps.db.webhookEvent.update({ where: { id: rec.id }, data: { processedAt: deps.now() } });
  return { result };
}
