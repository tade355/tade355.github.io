import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { expireUnpaidOrders } from "../src/services/orders.js";
import { qrPayload } from "../src/services/qr.js";
import { bearer, clock, futureSlot, makeFakes, paidOrder, placePendingOrder, resetDb, seedWorld } from "./helpers.js";

let fakes: ReturnType<typeof makeFakes>; let app: ReturnType<typeof createApp>; let w: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  await resetDb(); clock.t = new Date("2026-06-10T10:00:00Z");
  fakes = makeFakes(); app = createApp(fakes.deps); w = await seedWorld();
});
const setStatus = (id: string, to: "PREPARING" | "READY", who = w.staff) =>
  request(app).post(`/staff/orders/${id}/status`).set(bearer(who)).send({ to });
const status = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;

describe("creating orders", () => {
  it("snapshots server-side prices (client can't set them) and starts PENDING_PAYMENT with a hold", async () => {
    const res = await request(app).post("/orders").set(bearer(w.customer)).send({
      outletId: w.outlet.id, pickupAt: futureSlot(), items: [{ menuItemId: w.jollof.id, quantity: 2 }, { menuItemId: w.shawarma.id, quantity: 1 }], priceKobo: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.totalKobo).toBe(2 * 250_000 + 300_000);
    expect(res.body.status).toBe("PENDING_PAYMENT");
    expect(new Date(res.body.expiresAt).getTime()).toBe(clock.t.getTime() + 15 * 60_000);
    await prisma.menuItem.update({ where: { id: w.jollof.id }, data: { priceKobo: 999 } }); // later price change
    expect((await request(app).get(`/orders/${res.body.id}`).set(bearer(w.customer))).body.totalKobo).toBe(800_000);
  });
  it.each([
    ["empty cart", { items: [] }], ["zero quantity", { items: [{ menuItemId: "x", quantity: 0 }] }],
    ["huge quantity", { items: [{ menuItemId: "x", quantity: 999 }] }],
  ])("rejects %s", async (_n, patch) => {
    const res = await request(app).post("/orders").set(bearer(w.customer)).send({ outletId: w.outlet.id, pickupAt: futureSlot(), ...patch });
    expect(res.status).toBe(400);
  });
  it("rejects past slots, off-grid times and slots when closed", async () => {
    const past = await request(app).post("/orders").set(bearer(w.customer)).send({ outletId: w.outlet.id, pickupAt: "2026-06-10T10:00:00.000Z", items: [{ menuItemId: w.jollof.id, quantity: 1 }] });
    expect(past.status).toBe(409);
    const offGrid = await request(app).post("/orders").set(bearer(w.customer)).send({ outletId: w.outlet.id, pickupAt: "2026-06-11T11:07:00.000Z", items: [{ menuItemId: w.jollof.id, quantity: 1 }] });
    expect(offGrid.status).toBe(400);
    const closedDay = await request(app).post("/orders").set(bearer(w.customer)).send({ outletId: w.other.id, pickupAt: "2026-06-12T11:00:00.000Z", items: [{ menuItemId: w.jollof.id, quantity: 1 }] });
    expect(closedDay.status).toBe(400); // "other" outlet only opens Thursdays
  });
  it("blocks items that are inactive or sold out at that outlet", async () => {
    await prisma.outletItemAvailability.create({ data: { outletId: w.outlet.id, menuItemId: w.shawarma.id } });
    const res = await request(app).post("/orders").set(bearer(w.customer)).send({ outletId: w.outlet.id, pickupAt: futureSlot(), items: [{ menuItemId: w.shawarma.id, quantity: 1 }] });
    expect(res.status).toBe(409); expect(res.body.code).toBe("item_unavailable");
  });
  it("enforces slot capacity, even under concurrent bookings", async () => {
    await prisma.outlet.update({ where: { id: w.outlet.id }, data: { slotCapacity: 2 } });
    const users = await Promise.all([1, 2, 3, 4, 5].map((i) => prisma.user.create({ data: { phone: `+23480700000${i}0` } })));
    const results = await Promise.all(users.map((u) => request(app).post("/orders").set(bearer(u)).send({ outletId: w.outlet.id, pickupAt: futureSlot(), items: [{ menuItemId: w.jollof.id, quantity: 1 }] })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });
  it("unpaid orders release their slot after the hold lapses", async () => {
    await prisma.outlet.update({ where: { id: w.outlet.id }, data: { slotCapacity: 1 } });
    const a = await placePendingOrder(app, w); expect(a.status).toBe(201);
    const u2 = await prisma.user.create({ data: { phone: "+2348071111111" } });
    const body = { outletId: w.outlet.id, pickupAt: futureSlot(), items: [{ menuItemId: w.jollof.id, quantity: 1 }] };
    expect((await request(app).post("/orders").set(bearer(u2)).send(body)).status).toBe(409);
    clock.t = new Date(clock.t.getTime() + 16 * 60_000);
    expect(await expireUnpaidOrders(fakes.deps)).toBe(1);
    expect(await status(a.body.id)).toBe("CANCELLED");
    expect((await request(app).post("/orders").set(bearer(u2)).send(body)).status).toBe(201);
  });
  it("slots endpoint reports full / past correctly", async () => {
    const res = await request(app).get(`/outlets/${w.outlet.id}/slots?date=2026-06-10`);
    expect(res.status).toBe(200);
    const byTime = Object.fromEntries(res.body.map((s: any) => [s.startsAt, s]));
    expect(byTime["2026-06-10T09:00:00.000Z"]).toMatchObject({ available: false, reason: "past" }); // 10:00 Lagos
    expect(byTime["2026-06-10T10:00:00.000Z"]).toMatchObject({ available: false, reason: "past" }); // inside 30-min prep window
    expect(byTime["2026-06-10T10:30:00.000Z"]).toMatchObject({ available: true }); // exactly now + prep is bookable
  });
});

describe("status transitions via staff", () => {
  it("PLACED -> PREPARING -> READY with push at each step; collected only via scan", async () => {
    const { order } = await paidOrder(app, w); fakes.pushes.length = 0;
    expect((await setStatus(order.id, "PREPARING")).status).toBe(200);
    expect((await setStatus(order.id, "READY")).status).toBe(200);
    expect(await status(order.id)).toBe("READY");
    expect(fakes.pushes.map((p) => p.data.status)).toEqual(["PREPARING", "READY"]);
    const viaStatus = await request(app).post(`/staff/orders/${order.id}/status`).set(bearer(w.staff)).send({ to: "COLLECTED" });
    expect(viaStatus.status).toBe(400);
  });
  it("rejects skipping steps and unpaid orders", async () => {
    const { order } = await paidOrder(app, w);
    const skip = await setStatus(order.id, "READY"); expect(skip.status).toBe(409); expect(skip.body.code).toBe("bad_transition");
    const pending = await placePendingOrder(app, w);
    expect((await setStatus(pending.body.id, "PREPARING")).status).toBe(409);
    expect(await status(pending.body.id)).toBe("PENDING_PAYMENT");
  });
  it("staff cannot touch another outlet's orders; customers cannot use staff routes", async () => {
    const { order } = await paidOrder(app, w);
    expect((await setStatus(order.id, "PREPARING", w.staffOther)).status).toBe(403);
    expect((await request(app).post(`/staff/orders/${order.id}/status`).set(bearer(w.customer)).send({ to: "PREPARING" })).status).toBe(403);
    expect((await request(app).get("/staff/orders")).status).toBe(401);
    expect(await status(order.id)).toBe("PLACED");
  });
  it("two simultaneous clicks apply the transition once", async () => {
    const { order } = await paidOrder(app, w);
    const rs = await Promise.all([setStatus(order.id, "PREPARING"), setStatus(order.id, "PREPARING")]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, toStatus: "PREPARING" } })).toBe(1);
  });
  it("staff queue is scoped to their outlet", async () => {
    await paidOrder(app, w);
    expect((await request(app).get("/staff/orders").set(bearer(w.staff))).body).toHaveLength(1);
    expect((await request(app).get("/staff/orders").set(bearer(w.staffOther))).body).toHaveLength(0);
  });
});

describe("QR pickup", () => {
  const scan = (payload: string, who = w.staff) => request(app).post("/staff/scan").set(bearer(who)).send({ payload });
  const ready = async () => { const { order } = await paidOrder(app, w); await setStatus(order.id, "PREPARING"); await setStatus(order.id, "READY"); return order; };

  it("QR is only issued once the order is paid", async () => {
    const pending = await placePendingOrder(app, w);
    expect((await request(app).get(`/orders/${pending.body.id}/qr`).set(bearer(w.customer))).status).toBe(400);
    const { order } = await paidOrder(app, w);
    const qr = await request(app).get(`/orders/${order.id}/qr`).set(bearer(w.customer));
    expect(qr.status).toBe(200); expect(qr.body.payload).toBe(qrPayload(order.id));
  });
  it("scanning a READY order marks it COLLECTED exactly once", async () => {
    const o = await ready(); fakes.pushes.length = 0;
    const first = await scan(qrPayload(o.id));
    expect(first.status).toBe(200);
    const c = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(c.status).toBe("COLLECTED"); expect(c.collectedById).toBe(w.staff.id); expect(c.collectedAt).not.toBeNull();
    const again = await scan(qrPayload(o.id)); expect(again.status).toBe(409); expect(again.body.code).toBe("already_collected");
    expect(fakes.pushes).toHaveLength(1);
  });
  it("two staff scanning at the same instant: one wins", async () => {
    const o = await ready();
    const rs = await Promise.all([scan(qrPayload(o.id)), scan(qrPayload(o.id))]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("refuses an order that is not READY yet", async () => {
    const { order } = await paidOrder(app, w);
    const r = await scan(qrPayload(order.id)); expect(r.status).toBe(409); expect(r.body.code).toBe("not_ready");
    expect(await status(order.id)).toBe("PLACED");
  });
  it("refuses forged, tampered, garbage and unpaid QR codes", async () => {
    const o = await ready();
    const good = qrPayload(o.id);
    const forged = `nbg1.${o.id}.${"0".repeat(32)}`;
    const otherOrder = `nbg1.someotherid.${good.split(".")[2]}`;
    for (const p of [forged, otherOrder, "hello", "nbg1..", good.toUpperCase()]) expect((await scan(p)).status).toBe(400);
    const pending = await placePendingOrder(app, w);
    expect((await scan(qrPayload(pending.body.id))).status).toBe(409);
    expect(await status(o.id)).toBe("READY");
  });
  it("staff at another outlet can't collect it; customers can't scan", async () => {
    const o = await ready();
    expect((await scan(qrPayload(o.id), w.staffOther)).status).toBe(403);
    expect((await scan(qrPayload(o.id), w.customer as any)).status).toBe(403);
    expect(await status(o.id)).toBe("READY");
  });
  it("collect-by-code fallback works for READY orders only", async () => {
    const { order } = await paidOrder(app, w);
    const early = await request(app).post("/staff/collect-by-code").set(bearer(w.staff)).send({ code: order.code.toLowerCase() });
    expect(early.status).toBe(400);
    await setStatus(order.id, "PREPARING"); await setStatus(order.id, "READY");
    expect((await request(app).post("/staff/collect-by-code").set(bearer(w.staff)).send({ code: order.code.toLowerCase() })).status).toBe(200);
  });
});
