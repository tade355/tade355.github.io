import type { Deps } from "../deps.js";
import { LAGOS_OFFSET_MIN } from "./slots.js";

/** Sales between two Lagos-local dates (inclusive). Revenue counts paid orders (PLACED..COLLECTED) minus successful refunds. */
export async function salesReport(deps: Deps, q: { from: string; to: string; outletId?: string }) {
  const from = new Date(Date.parse(`${q.from}T00:00:00Z`) - LAGOS_OFFSET_MIN * 60_000);
  const to = new Date(Date.parse(`${q.to}T00:00:00Z`) + 86_400_000 - LAGOS_OFFSET_MIN * 60_000);
  const orders = await deps.db.order.findMany({
    where: { paidAt: { gte: from, lt: to }, status: { in: ["PLACED", "PREPARING", "READY", "COLLECTED"] }, ...(q.outletId ? { outletId: q.outletId } : {}) },
    include: { items: true, outlet: { select: { name: true } } },
  });
  const refunds = await deps.db.refund.findMany({ where: { status: { not: "FAILED" }, payment: { order: { id: { in: orders.map((o) => o.id) } } } }, include: { payment: { select: { orderId: true } } } });
  const refundByOrder = new Map<string, number>();
  for (const r of refunds) refundByOrder.set(r.payment.orderId, (refundByOrder.get(r.payment.orderId) ?? 0) + r.amountKobo);

  const byDay = new Map<string, { orders: number; grossKobo: number }>();
  const byOutlet = new Map<string, { orders: number; grossKobo: number }>();
  const byItem = new Map<string, { quantity: number; grossKobo: number }>();
  let gross = 0;
  for (const o of orders) {
    const day = new Date(o.paidAt!.getTime() + LAGOS_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
    const d = byDay.get(day) ?? { orders: 0, grossKobo: 0 }; d.orders++; d.grossKobo += o.totalKobo; byDay.set(day, d);
    const ot = byOutlet.get(o.outlet.name) ?? { orders: 0, grossKobo: 0 }; ot.orders++; ot.grossKobo += o.totalKobo; byOutlet.set(o.outlet.name, ot);
    for (const i of o.items) { const x = byItem.get(i.nameSnapshot) ?? { quantity: 0, grossKobo: 0 }; x.quantity += i.quantity; x.grossKobo += i.quantity * i.unitPriceKobo; byItem.set(i.nameSnapshot, x); }
    gross += o.totalKobo;
  }
  const refunded = [...refundByOrder.values()].reduce((a, b) => a + b, 0);
  return {
    orders: orders.length, grossKobo: gross, refundedKobo: refunded, netKobo: gross - refunded,
    avgOrderKobo: orders.length ? Math.round(gross / orders.length) : 0,
    byDay: [...byDay].sort().map(([date, v]) => ({ date, ...v })),
    byOutlet: [...byOutlet].map(([outlet, v]) => ({ outlet, ...v })),
    topItems: [...byItem].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
  };
}
