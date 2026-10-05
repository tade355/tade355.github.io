import { createHmac } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import type { Deps } from "../src/deps.js";
import type { PaystackClient, PaystackVerifyResult } from "../src/providers/paystack.js";
import { signAccess } from "../src/services/auth.js";
import { buildSlots } from "../src/services/slots.js";

export const SECRET = "sk_test_unit";
export const clock = { t: new Date("2026-06-10T10:00:00Z") }; // a Wednesday, 11:00 Lagos

export function makeFakes() {
  const sent: { phone: string; text: string }[] = [];
  const pushes: { token: string; title: string; data?: any }[] = [];
  const verifyResults = new Map<string, PaystackVerifyResult>();
  const refunds: { reference: string; amountKobo: number }[] = [];
  const paystack: PaystackClient & { failRefund?: boolean } = {
    async initialize(p) { return { authorizationUrl: `https://checkout.paystack.test/${p.reference}`, accessCode: "ac", reference: p.reference }; },
    async verify(ref) { return verifyResults.get(ref) ?? { status: "abandoned", reference: ref, amountKobo: 0, currency: "NGN" }; },
    async refund(p) { if (paystack.failRefund) throw new Error("paystack down"); refunds.push(p); return { id: "rf_" + refunds.length, status: "pending" }; },
  };
  const deps: Deps = {
    db: prisma, paystack,
    sms: { async send(phone, text) { sent.push({ phone, text }); } },
    push: { async send(token, title, _b, data) { pushes.push({ token, title, data }); } },
    now: () => clock.t,
  };
  return { deps, sent, pushes, verifyResults, refunds, paystack };
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE "Refund","Complaint","WebhookEvent","Payment","OrderEvent","OrderItem","Order","OutletItemAvailability","OutletHours","ComboComponent","MenuItem","Category","RefreshToken","OtpCode","User","Outlet" RESTART IDENTITY CASCADE`);
}

export async function seedWorld(opts: { capacity?: number } = {}) {
  const outlet = await prisma.outlet.create({
    data: { name: "Ikeja", address: "1 Allen Ave", slotCapacity: opts.capacity ?? 10, hours: { create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openMin: 0, closeMin: 1440 })) } },
  });
  const other = await prisma.outlet.create({ data: { name: "VI", address: "2 Adeola", hours: { create: [{ dayOfWeek: 4, openMin: 0, closeMin: 1440 }] } } });
  const cat = await prisma.category.create({ data: { name: "Rice" } });
  const jollof = await prisma.menuItem.create({ data: { categoryId: cat.id, name: "Party Jollof", priceKobo: 250_000 } });
  const shawarma = await prisma.menuItem.create({ data: { categoryId: cat.id, name: "Shawarma", priceKobo: 300_000 } });
  const customer = await prisma.user.create({ data: { phone: "+2348011111111", expoPushToken: "ExponentPushToken[abc]" } });
  const staff = await prisma.user.create({ data: { phone: "+2348022222222", role: "STAFF", outletId: outlet.id } });
  const staffOther = await prisma.user.create({ data: { phone: "+2348033333333", role: "STAFF", outletId: other.id } });
  const admin = await prisma.user.create({ data: { phone: "+2348044444444", role: "ADMIN" } });
  return { outlet, other, jollof, shawarma, customer, staff, staffOther, admin };
}

export const bearer = (u: { id: string; role: any; outletId: string | null }) => ({ Authorization: `Bearer ${signAccess(u)}` });

/** A valid future slot (Thursday 12:00 Lagos) for the given outlet. */
export function futureSlot(): string {
  const slots = buildSlots({ hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openMin: 0, closeMin: 1440 })), date: "2026-06-11", now: clock.t, prepMinutes: 30, slotMinutes: 30, capacity: 10, counts: new Map() });
  return slots[24].startsAt; // 12:00 Lagos = 11:00Z
}

export function signedWebhook(app: ReturnType<typeof createApp>, body: object, secret = SECRET) {
  const raw = JSON.stringify(body);
  const sig = createHmac("sha512", secret).update(raw).digest("hex");
  return request(app).post("/webhooks/paystack").set("Content-Type", "application/json").set("x-paystack-signature", sig).send(raw);
}

export async function placePendingOrder(app: ReturnType<typeof createApp>, w: Awaited<ReturnType<typeof seedWorld>>, items = [{ menuItemId: "", quantity: 1 }]) {
  const res = await request(app).post("/orders").set(bearer(w.customer)).send({
    outletId: w.outlet.id, pickupAt: futureSlot(), items: items.map((i) => ({ ...i, menuItemId: i.menuItemId || w.jollof.id })),
  });
  return res;
}

export async function payInit(app: ReturnType<typeof createApp>, w: Awaited<ReturnType<typeof seedWorld>>, orderId: string) {
  const res = await request(app).post(`/orders/${orderId}/pay`).set(bearer(w.customer)).send();
  return res.body as { reference: string; authorizationUrl: string };
}

export const chargeSuccess = (reference: string, amount: number, extra: object = {}) => ({
  event: "charge.success", data: { id: 99, status: "success", reference, amount, currency: "NGN", channel: "bank_transfer", ...extra },
});

/** Create an order, initiate payment and get it to PLACED via the real webhook. */
export async function paidOrder(app: ReturnType<typeof createApp>, w: Awaited<ReturnType<typeof seedWorld>>, items?: any) {
  const o = await placePendingOrder(app, w, items);
  const { reference } = await payInit(app, w, o.body.id);
  await signedWebhook(app, chargeSuccess(reference, o.body.totalKobo));
  return { order: o.body, reference };
}
