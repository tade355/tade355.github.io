import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { chargeSuccess, makeFakes, payInit, placePendingOrder, resetDb, seedWorld, signedWebhook, bearer, clock } from "./helpers.js";
import { verifyWebhookSignature } from "../src/providers/paystack.js";
import { createHmac } from "node:crypto";

let fakes: ReturnType<typeof makeFakes>;
let app: ReturnType<typeof createApp>;
let w: Awaited<ReturnType<typeof seedWorld>>;

beforeEach(async () => {
  await resetDb();
  clock.t = new Date("2026-06-10T10:00:00Z");
  fakes = makeFakes(); app = createApp(fakes.deps); w = await seedWorld();
});

const statusOf = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;

describe("Paystack webhook", () => {
  it("rejects a missing or wrong signature and changes nothing", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    const body = JSON.stringify(chargeSuccess(reference, o.body.totalKobo));
    const none = await request(app).post("/webhooks/paystack").set("Content-Type", "application/json").send(body);
    const bad = await request(app).post("/webhooks/paystack").set("Content-Type", "application/json").set("x-paystack-signature", "deadbeef").send(body);
    const wrongKey = await signedWebhook(app, chargeSuccess(reference, o.body.totalKobo), "sk_live_attacker");
    expect([none.status, bad.status, wrongKey.status]).toEqual([401, 401, 401]);
    expect(await statusOf(o.body.id)).toBe("PENDING_PAYMENT");
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it("signature is over the exact raw bytes (a re-serialised body fails)", () => {
    const raw = '{"event":"charge.success", "data":{"x":1}}';
    const sig = createHmac("sha512", "k").update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, sig, "k")).toBe(true);
    expect(verifyWebhookSignature(JSON.stringify(JSON.parse(raw)), sig, "k")).toBe(false);
  });

  it("charge.success moves PENDING_PAYMENT -> PLACED, records payment details and pushes a notification", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    const res = await signedWebhook(app, chargeSuccess(reference, o.body.totalKobo));
    expect(res.status).toBe(200); expect(res.body.result).toBe("paid");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: o.body.id }, include: { payments: true, events: true } });
    expect(order.status).toBe("PLACED"); expect(order.paidAt).not.toBeNull();
    expect(order.payments[0]).toMatchObject({ status: "SUCCESS", channel: "bank_transfer", paystackId: "99" });
    expect(order.events.map((e) => e.toStatus)).toEqual(["PENDING_PAYMENT", "PLACED"]);
    expect(fakes.pushes).toHaveLength(1); expect(fakes.pushes[0].title).toMatch(/placed/i);
  });

  it("is idempotent: redelivering the same event does not re-apply or re-notify", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    const body = chargeSuccess(reference, o.body.totalKobo);
    expect((await signedWebhook(app, body)).body.result).toBe("paid");
    expect((await signedWebhook(app, body)).body.result).toBe("duplicate");
    expect((await signedWebhook(app, body)).body.result).toBe("duplicate");
    const events = await prisma.orderEvent.findMany({ where: { orderId: o.body.id, toStatus: "PLACED" } });
    expect(events).toHaveLength(1); expect(fakes.pushes).toHaveLength(1);
  });

  it("is safe under concurrent duplicate deliveries", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    const body = chargeSuccess(reference, o.body.totalKobo);
    const results = await Promise.all(Array.from({ length: 6 }, () => signedWebhook(app, body)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await prisma.orderEvent.count({ where: { orderId: o.body.id, toStatus: "PLACED" } })).toBe(1);
    expect(fakes.pushes).toHaveLength(1);
    expect(await statusOf(o.body.id)).toBe("PLACED");
  });

  it("does NOT mark paid when the amount differs from what we charged", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    const res = await signedWebhook(app, chargeSuccess(reference, 100));
    expect(res.body.result).toBe("amount_mismatch");
    expect(await statusOf(o.body.id)).toBe("PENDING_PAYMENT");
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference } })).status).toBe("FAILED");
  });

  it("does NOT mark paid for the wrong currency", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    const res = await signedWebhook(app, chargeSuccess(reference, o.body.totalKobo, { currency: "USD" }));
    expect(res.body.result).toBe("amount_mismatch"); expect(await statusOf(o.body.id)).toBe("PENDING_PAYMENT");
  });

  it("ignores non-success charges and unknown references (200, no state change)", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    expect((await signedWebhook(app, chargeSuccess(reference, o.body.totalKobo, { status: "failed" }))).body.result).toBe("not_success");
    expect((await signedWebhook(app, chargeSuccess("nbg_unknown", 5))).body.result).toBe("unknown_reference");
    expect(await statusOf(o.body.id)).toBe("PENDING_PAYMENT");
  });

  it("ignores unrelated events and malformed JSON", async () => {
    expect((await signedWebhook(app, { event: "transfer.success", data: { id: 1 } })).body.result).toBe("ignored");
    const raw = "{not json"; const sig = createHmac("sha512", "sk_test_unit").update(raw).digest("hex");
    const res = await request(app).post("/webhooks/paystack").set("x-paystack-signature", sig).set("Content-Type", "application/json").send(raw);
    expect(res.status).toBe(400);
  });

  it("payment that arrives after the order expired is refunded automatically, not kept", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    await prisma.order.update({ where: { id: o.body.id }, data: { status: "CANCELLED" } });
    const res = await signedWebhook(app, chargeSuccess(reference, o.body.totalKobo));
    expect(res.body.result).toBe("late_auto_refund");
    expect(await statusOf(o.body.id)).toBe("CANCELLED");
    expect(fakes.refunds).toHaveLength(1);
    expect(fakes.refunds[0]).toMatchObject({ reference, amountKobo: o.body.totalKobo });
    expect(await prisma.refund.count({ where: { paymentId: (await prisma.payment.findUniqueOrThrow({ where: { reference } })).id } })).toBe(1);
  });

  it("returns 500 (so Paystack retries) if processing blows up, and a retry then succeeds", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    // fail once inside the DB transaction (paidAt = deps.now()), so it rolls back
    let boom = true;
    fakes.deps.now = () => { if (boom) { boom = false; throw new Error("db blip"); } return clock.t; };
    const body = chargeSuccess(reference, o.body.totalKobo);
    expect((await signedWebhook(app, body)).status).toBe(500);
    expect(await statusOf(o.body.id)).toBe("PENDING_PAYMENT"); // rolled back, nothing half-applied
    const retry = await signedWebhook(app, body);
    expect(retry.status).toBe(200); expect(retry.body.result).toBe("paid");
    expect(await statusOf(o.body.id)).toBe("PLACED");
  });

  it("refund.processed finalises the Refund and marks the Payment REFUNDED; refund.failed marks it FAILED", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    await signedWebhook(app, chargeSuccess(reference, o.body.totalKobo));
    const payment = await prisma.payment.findUniqueOrThrow({ where: { reference } });
    const r1 = await prisma.refund.create({ data: { paymentId: payment.id, amountKobo: payment.amountKobo, approvedById: w.admin.id } });
    await signedWebhook(app, { event: "refund.processed", data: { id: 7, transaction_reference: reference, status: "processed" } });
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: r1.id } })).status).toBe("SUCCESS");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("REFUNDED");

    const r2 = await prisma.refund.create({ data: { paymentId: payment.id, amountKobo: 1, approvedById: w.admin.id } });
    await signedWebhook(app, { event: "refund.failed", data: { id: 8, transaction_reference: reference } });
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("FAILED");
  });

  it("GET /orders/:id/verify reconciles via Paystack verify (never trusts the client) and agrees with the webhook path", async () => {
    const o = await placePendingOrder(app, w); const { reference } = await payInit(app, w, o.body.id);
    // Paystack still says abandoned -> order stays pending
    let res = await request(app).get(`/orders/${o.body.id}/verify`).set(bearer(w.customer));
    expect(res.body.status).toBe("PENDING_PAYMENT");
    fakes.verifyResults.set(reference, { status: "success", reference, amountKobo: o.body.totalKobo, currency: "NGN", channel: "card", id: 5 });
    res = await request(app).get(`/orders/${o.body.id}/verify`).set(bearer(w.customer));
    expect(res.body.status).toBe("PLACED");
    // a later webhook for the same charge is a harmless duplicate
    expect((await signedWebhook(app, chargeSuccess(reference, o.body.totalKobo))).body.result).toBe("duplicate");
    expect(await prisma.orderEvent.count({ where: { orderId: o.body.id, toStatus: "PLACED" } })).toBe(1);
  });

  it("cannot pay someone else's order or an expired one", async () => {
    const o = await placePendingOrder(app, w);
    const stranger = await prisma.user.create({ data: { phone: "+2348099999999" } });
    expect((await request(app).post(`/orders/${o.body.id}/pay`).set(bearer(stranger)).send()).status).toBe(404);
    clock.t = new Date(clock.t.getTime() + 16 * 60_000);
    const late = await request(app).post(`/orders/${o.body.id}/pay`).set(bearer(w.customer)).send();
    expect(late.status).toBe(409); expect(late.body.code).toBe("order_expired");
  });
});
