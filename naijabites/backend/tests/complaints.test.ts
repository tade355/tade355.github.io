import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { bearer, chargeSuccess, clock, makeFakes, paidOrder, placePendingOrder, resetDb, seedWorld, signedWebhook } from "./helpers.js";

let fakes: ReturnType<typeof makeFakes>; let app: ReturnType<typeof createApp>; let w: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  await resetDb(); clock.t = new Date("2026-06-10T10:00:00Z");
  fakes = makeFakes(); app = createApp(fakes.deps); w = await seedWorld();
});
const file = (orderId: string, reason = "Wrong item") =>
  request(app).post("/complaints").set(bearer(w.customer)).field("orderId", orderId).field("reason", reason).field("description", "Got beef, ordered chicken")
    .attach("photo", Buffer.from("\xff\xd8\xff\xe0fakejpeg", "binary"), { filename: "p.jpg", contentType: "image/jpeg" });

describe("complaints & refunds", () => {
  it("customer reports with a photo; admin approves; refund goes to the ORIGINAL transaction", async () => {
    const { order, reference } = await paidOrder(app, w);
    const c = await file(order.id); expect(c.status).toBe(201); expect(c.body.photoUrl).toMatch(/^\/uploads\//);
    const approve = await request(app).post(`/admin/complaints/${c.body.id}/approve`).set(bearer(w.admin)).send({});
    expect(approve.status).toBe(200);
    expect(fakes.refunds).toEqual([expect.objectContaining({ reference, amountKobo: order.totalKobo })]);
    expect((await prisma.complaint.findUniqueOrThrow({ where: { id: c.body.id } })).status).toBe("APPROVED");
    expect((await prisma.refund.findFirstOrThrow()).status).toBe("PENDING");
    // Paystack later confirms
    await signedWebhook(app, { event: "refund.processed", data: { id: 1, transaction_reference: reference } });
    expect((await prisma.refund.findFirstOrThrow()).status).toBe("SUCCESS");
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference } })).status).toBe("REFUNDED");
  });
  it("supports a partial refund and never refunds more than was paid", async () => {
    const { order } = await paidOrder(app, w); const c = await file(order.id);
    await request(app).post(`/admin/complaints/${c.body.id}/approve`).set(bearer(w.admin)).send({ amountKobo: 100_000 });
    expect(fakes.refunds[0].amountKobo).toBe(100_000);
    // a second refund for the same payment is capped at what remains
    const payment = await prisma.payment.findFirstOrThrow();
    const { startRefund } = await import("../src/services/payments.js");
    await startRefund(fakes.deps, payment, { reason: "extra", amountKobo: 10_000_000 });
    expect(fakes.refunds[1].amountKobo).toBe(order.totalKobo - 100_000);
    await expect(startRefund(fakes.deps, payment, { reason: "again" })).rejects.toThrow(/Nothing left/);
  });
  it("only the owner of a PAID order can report it, once", async () => {
    const pending = await placePendingOrder(app, w);
    expect((await file(pending.body.id)).status).toBe(409);
    const { order } = await paidOrder(app, w);
    const stranger = await prisma.user.create({ data: { phone: "+2348088888888" } });
    expect((await request(app).post("/complaints").set(bearer(stranger)).field("orderId", order.id).field("reason", "x")).status).toBe(404);
    expect((await file(order.id)).status).toBe(201);
    const dup = await file(order.id); expect(dup.status).toBe(409); expect(dup.body.code).toBe("duplicate_complaint");
  });
  it("only admins resolve; double-approve doesn't double-refund; reject records the reason", async () => {
    const { order } = await paidOrder(app, w); const c = await file(order.id);
    expect((await request(app).post(`/admin/complaints/${c.body.id}/approve`).set(bearer(w.staff)).send({})).status).toBe(403);
    const both = await Promise.all([1, 2].map(() => request(app).post(`/admin/complaints/${c.body.id}/approve`).set(bearer(w.admin)).send({})));
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(fakes.refunds).toHaveLength(1);
    const { order: o2 } = await paidOrder(app, w); const c2 = await file(o2.id);
    expect((await request(app).post(`/admin/complaints/${c2.body.id}/reject`).set(bearer(w.admin)).send({ note: "Photo shows correct item" })).status).toBe(200);
    expect(await prisma.complaint.findUniqueOrThrow({ where: { id: c2.body.id } })).toMatchObject({ status: "REJECTED", resolutionNote: "Photo shows correct item" });
  });
  it("if Paystack refuses the refund, the complaint goes back to OPEN so it can be retried", async () => {
    const { order } = await paidOrder(app, w); const c = await file(order.id);
    fakes.paystack.failRefund = true;
    const r = await request(app).post(`/admin/complaints/${c.body.id}/approve`).set(bearer(w.admin)).send({});
    expect(r.status).toBe(502);
    expect((await prisma.complaint.findUniqueOrThrow({ where: { id: c.body.id } })).status).toBe("OPEN");
    expect(await prisma.refund.count()).toBe(0);
    fakes.paystack.failRefund = false;
    expect((await request(app).post(`/admin/complaints/${c.body.id}/approve`).set(bearer(w.admin)).send({})).status).toBe(200);
  });
  it("rejects non-image uploads and oversized photos", async () => {
    const { order } = await paidOrder(app, w);
    const bad = await request(app).post("/complaints").set(bearer(w.customer)).field("orderId", order.id).field("reason", "x").attach("photo", Buffer.from("<script>"), { filename: "a.html", contentType: "text/html" });
    expect(bad.status).toBe(400);
    const big = await request(app).post("/complaints").set(bearer(w.customer)).field("orderId", order.id).field("reason", "x").attach("photo", Buffer.alloc(6 * 1024 * 1024), { filename: "a.jpg", contentType: "image/jpeg" });
    expect(big.status).toBe(413);
  });
});

describe("sales report", () => {
  it("sums paid orders, subtracts refunds, ignores unpaid", async () => {
    await paidOrder(app, w, [{ menuItemId: w.jollof.id, quantity: 2 }]);
    await placePendingOrder(app, w);
    const res = await request(app).get("/admin/reports/sales?from=2026-06-10&to=2026-06-10").set(bearer(w.admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ orders: 1, grossKobo: 500_000, refundedKobo: 0, netKobo: 500_000 });
    expect(res.body.topItems[0]).toMatchObject({ name: "Party Jollof", quantity: 2 });
    expect(res.body.byDay).toEqual([{ date: "2026-06-10", orders: 1, grossKobo: 500_000 }]);
  });
});
