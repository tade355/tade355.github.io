import { Router } from "express";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { wrap, parse } from "../lib/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { collectByScan, transitionOrder, type Actor } from "../services/orders.js";

const view = (o: any) => ({
  id: o.id, code: o.code, status: o.status, pickupAt: o.pickupAt, note: o.note, totalKobo: o.totalKobo, paidAt: o.paidAt,
  customer: { phone: o.user.phone, name: o.user.name }, outlet: o.outlet?.name,
  items: o.items.map((i: any) => ({ name: i.nameSnapshot, quantity: i.quantity })),
});

export function staffRoutes(deps: Deps) {
  const r = Router();
  // Re-read role/outlet from the DB so revoking or moving staff takes effect immediately, not after token expiry.
  const actorOf = async (sub: string): Promise<Actor> => {
    const u = await deps.db.user.findUniqueOrThrow({ where: { id: sub } });
    if (u.role === "CUSTOMER") throw forbidden("Not allowed");
    return { id: u.id, role: u.role, outletId: u.outletId };
  };
  r.use("/staff", requireAuth, requireRole("STAFF", "ADMIN"));

  r.get("/staff/orders", wrap(async (req, res) => {
    const u = await actorOf(req.user!.sub);
    const q = parse(z.object({ outletId: z.string().optional(), status: z.string().optional() }), req.query);
    const outletId = u.role === "STAFF" ? u.outletId : q.outletId;
    if (u.role === "STAFF" && !outletId) throw forbidden("Staff account has no outlet");
    const statuses = (q.status ? q.status.split(",") : ["PLACED", "PREPARING", "READY"]) as any[];
    const list = await deps.db.order.findMany({
      where: { status: { in: statuses }, ...(outletId ? { outletId } : {}) },
      include: { items: true, user: { select: { phone: true, name: true } }, outlet: { select: { name: true } } },
      orderBy: { pickupAt: "asc" }, take: 200,
    });
    res.json(list.map(view));
  }));

  r.post("/staff/orders/:id/status", wrap(async (req, res) => {
    const { to } = parse(z.object({ to: z.enum(["PREPARING", "READY"]) }), req.body);
    await transitionOrder(deps, req.params.id, to, await actorOf(req.user!.sub));
    res.json({ ok: true });
  }));

  r.post("/staff/scan", wrap(async (req, res) => {
    const { payload } = parse(z.object({ payload: z.string().min(5).max(200) }), req.body);
    const o = await collectByScan(deps, payload, await actorOf(req.user!.sub));
    res.json({ ok: true, code: o.code, items: o.items.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity })) });
  }));

  // Fallback when a customer's phone can't show the QR: staff types the short order code.
  r.post("/staff/collect-by-code", wrap(async (req, res) => {
    const { code } = parse(z.object({ code: z.string().min(4).max(10) }), req.body);
    const o = await deps.db.order.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!o) throw notFound("No order with that code");
    if (o.status !== "READY") throw badRequest(`Order is ${o.status.toLowerCase()}, not ready`, "not_ready");
    await transitionOrder(deps, o.id, "COLLECTED", await actorOf(req.user!.sub));
    res.json({ ok: true, code: o.code });
  }));
  return r;
}
