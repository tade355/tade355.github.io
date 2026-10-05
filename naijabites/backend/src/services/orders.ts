import { Prisma, type OrderStatus, type User } from "@prisma/client";
import type { Deps } from "../deps.js";
import { PAYMENT_HOLD_MIN } from "../env.js";
import { orderCode } from "../lib/crypto.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { assertTransition, STATUS_MESSAGES } from "./orderStateMachine.js";
import { parseQrPayload } from "./qr.js";
import { buildSlots, lagosDate } from "./slots.js";

const HOLDING: OrderStatus[] = ["PLACED", "PREPARING", "READY"];
const MAX_QTY = 20;
const MAX_ORDER_KOBO = 5_000_000_00; // ₦5,000,000

/** Orders occupying a slot: paid/in-progress, or awaiting payment within the hold window. */
export async function slotCounts(deps: Deps, outletId: string, from: Date, to: Date) {
  const rows = await deps.db.order.findMany({
    where: {
      outletId, pickupAt: { gte: from, lt: to },
      OR: [{ status: { in: HOLDING } }, { status: "PENDING_PAYMENT", expiresAt: { gt: deps.now() } }],
    },
    select: { pickupAt: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) { const k = r.pickupAt.toISOString(); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

export async function getSlots(deps: Deps, outletId: string, date: string) {
  const outlet = await deps.db.outlet.findUnique({ where: { id: outletId }, include: { hours: true } });
  if (!outlet || !outlet.active) throw notFound("Outlet not found");
  const start = new Date(Date.parse(`${date}T00:00:00Z`) - 3_600_000);
  const counts = await slotCounts(deps, outletId, start, new Date(start.getTime() + 86_400_000));
  return buildSlots({
    hours: outlet.hours, date, now: deps.now(), prepMinutes: outlet.prepMinutes,
    slotMinutes: outlet.slotMinutes, capacity: outlet.slotCapacity, counts,
  });
}

export interface CreateOrderInput { outletId: string; pickupAt: string; items: { menuItemId: string; quantity: number }[]; note?: string }

export async function createOrder(deps: Deps, userId: string, input: CreateOrderInput) {
  if (!input.items.length) throw badRequest("Your cart is empty");
  const merged = new Map<string, number>();
  for (const i of input.items) {
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > MAX_QTY) throw badRequest(`Quantity must be 1–${MAX_QTY}`);
    merged.set(i.menuItemId, (merged.get(i.menuItemId) ?? 0) + i.quantity);
  }
  const pickupAt = new Date(input.pickupAt);
  if (Number.isNaN(pickupAt.getTime())) throw badRequest("Invalid pickup time");

  const outlet = await deps.db.outlet.findUnique({ where: { id: input.outletId }, include: { hours: true } });
  if (!outlet || !outlet.active) throw badRequest("That pickup point is not available");

  const items = await deps.db.menuItem.findMany({
    where: { id: { in: [...merged.keys()] } },
    include: { unavailable: { where: { outletId: outlet.id } } },
  });
  if (items.length !== merged.size) throw badRequest("Some items are no longer on the menu");
  for (const it of items) if (!it.active || it.unavailable.length) throw conflict(`${it.name} is unavailable at this pickup point`, "item_unavailable");

  const lines = items.map((it) => ({ menuItemId: it.id, nameSnapshot: it.name, unitPriceKobo: it.priceKobo, quantity: merged.get(it.id)! }));
  const subtotal = lines.reduce((s, l) => s + l.unitPriceKobo * l.quantity, 0);
  if (subtotal > MAX_ORDER_KOBO) throw badRequest("Order total too large");

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await deps.db.$transaction(async (tx) => {
        // serialize bookings of the same slot so capacity can't be oversold
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${outlet.id + "|" + pickupAt.toISOString()}))`;
        const date = lagosDate(pickupAt);
        const dayStart = new Date(Date.parse(`${date}T00:00:00Z`) - 3_600_000);
        const slots = buildSlots({
          hours: outlet.hours, date, now: deps.now(), prepMinutes: outlet.prepMinutes, slotMinutes: outlet.slotMinutes,
          capacity: outlet.slotCapacity,
          counts: await slotCounts({ ...deps, db: tx as any }, outlet.id, dayStart, new Date(dayStart.getTime() + 86_400_000)),
        });
        const slot = slots.find((s) => s.startsAt === pickupAt.toISOString());
        if (!slot) throw badRequest("Pick a valid pickup time slot", "bad_slot");
        if (!slot.available) throw conflict(slot.reason === "full" ? "That time slot is full" : "That time slot has passed", "slot_unavailable");

        const order = await tx.order.create({
          data: {
            code: orderCode(), userId, outletId: outlet.id, pickupAt, note: (input.note ?? "").slice(0, 200),
            subtotalKobo: subtotal, totalKobo: subtotal,
            expiresAt: new Date(deps.now().getTime() + PAYMENT_HOLD_MIN * 60_000),
            items: { create: lines },
            events: { create: { toStatus: "PENDING_PAYMENT", actorId: userId } },
          },
          include: { items: true },
        });
        return order;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // code collision
      throw e;
    }
  }
  throw conflict("Could not create order, please retry");
}

/** Cancel unpaid orders whose payment hold has lapsed (releases the slot). Safe to call often. */
export async function expireUnpaidOrders(deps: Deps) {
  const stale = await deps.db.order.findMany({ where: { status: "PENDING_PAYMENT", expiresAt: { lt: deps.now() } }, select: { id: true } });
  let n = 0;
  for (const { id } of stale) {
    const r = await deps.db.order.updateMany({ where: { id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED" } });
    if (r.count) { n++; await deps.db.orderEvent.create({ data: { orderId: id, fromStatus: "PENDING_PAYMENT", toStatus: "CANCELLED" } }); }
  }
  return n;
}

export interface Actor { id: string; role: User["role"]; outletId: string | null }

/** Atomic, guarded transition. `from` is re-checked in the UPDATE so concurrent scans/clicks can't double-apply. */
export async function transitionOrder(deps: Deps, orderId: string, to: OrderStatus, actor: Actor | null) {
  const order = await deps.db.order.findUnique({ where: { id: orderId }, include: { user: true } });
  if (!order) throw notFound("Order not found");
  if (actor && actor.role === "STAFF" && actor.outletId !== order.outletId) throw forbidden("This order belongs to another outlet");
  assertTransition(order.status, to);
  const extra: Prisma.OrderUpdateManyMutationInput = {};
  if (to === "COLLECTED") { extra.collectedAt = deps.now(); }
  if (to === "PLACED") { extra.paidAt = deps.now(); }
  const upd = await deps.db.order.updateMany({
    where: { id: orderId, status: order.status },
    data: { status: to, ...extra, ...(to === "COLLECTED" && actor ? { collectedById: actor.id } : {}) },
  });
  if (upd.count !== 1) throw conflict("Order was just updated by someone else", "stale_order");
  await deps.db.orderEvent.create({ data: { orderId, fromStatus: order.status, toStatus: to, actorId: actor?.id ?? null } });
  await notifyStatus(deps, order.user.expoPushToken, order.code, order.id, to);
  return deps.db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
}

export async function notifyStatus(deps: Deps, token: string | null | undefined, code: string, orderId: string, to: OrderStatus) {
  const msg = STATUS_MESSAGES[to];
  if (!token || !msg) return;
  try { await deps.push.send(token, msg.title, msg.body(code), { orderId, status: to }); } catch { /* never fail a transition on push */ }
}

/** Staff scan: only a paid READY order at the staff member's outlet can be collected, exactly once. */
export async function collectByScan(deps: Deps, payload: string, actor: Actor) {
  const orderId = parseQrPayload(payload);
  if (!orderId) throw badRequest("Invalid QR code", "bad_qr");
  const order = await deps.db.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("Order not found");
  if (order.status === "COLLECTED") throw conflict("This order was already collected", "already_collected");
  if (order.status === "READY") return transitionOrder(deps, orderId, "COLLECTED", actor);
  if (order.status === "PLACED" || order.status === "PREPARING") throw conflict(`Order is still ${order.status.toLowerCase()} — not ready yet`, "not_ready");
  throw conflict("This order is not payable/collectable", "not_collectable");
}
