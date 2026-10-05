import { Router } from "express";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { wrap, parse } from "../lib/http.js";
import { notFound } from "../lib/errors.js";
import { getSlots } from "../services/orders.js";
import { lagosDate } from "../services/slots.js";

export function publicRoutes(deps: Deps) {
  const r = Router();

  r.get("/menu", wrap(async (req, res) => {
    const outletId = typeof req.query.outletId === "string" ? req.query.outletId : undefined;
    const [cats, unavail] = await Promise.all([
      deps.db.category.findMany({
        orderBy: { sortOrder: "asc" },
        include: { items: { where: { active: true }, orderBy: { sortOrder: "asc" }, include: { components: { include: { component: { select: { name: true } } } } } } },
      }),
      outletId ? deps.db.outletItemAvailability.findMany({ where: { outletId } }) : Promise.resolve([]),
    ]);
    const off = new Set(unavail.map((u) => u.menuItemId));
    res.json(cats.map((c) => ({
      id: c.id, name: c.name,
      items: c.items.map((i) => ({
        id: i.id, name: i.name, description: i.description, imageUrl: i.imageUrl, priceKobo: i.priceKobo, isCombo: i.isCombo,
        available: !off.has(i.id), components: i.components.map((x) => ({ name: x.component.name, quantity: x.quantity })),
      })),
    })));
  }));

  r.get("/outlets", wrap(async (_req, res) => {
    const outlets = await deps.db.outlet.findMany({ where: { active: true }, include: { hours: true }, orderBy: { name: "asc" } });
    res.json(outlets.map((o) => ({
      id: o.id, name: o.name, address: o.address, city: o.city, lat: o.lat, lng: o.lng, prepMinutes: o.prepMinutes,
      hours: o.hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openMin: h.openMin, closeMin: h.closeMin })),
    })));
  }));

  r.get("/outlets/:id/slots", wrap(async (req, res) => {
    const { date } = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(lagosDate(deps.now())) }), req.query);
    res.json(await getSlots(deps, req.params.id, date));
  }));

  // Where Paystack sends the browser after checkout; bounces back into the app via deep link.
  r.get("/payments/return", (req, res) => {
    const ref = typeof req.query.reference === "string" ? req.query.reference.replace(/[^\w-]/g, "") : "";
    const link = `naijabites://payment-complete?reference=${ref}`;
    res.type("html").send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Payment</title>
<body style="font-family:system-ui;text-align:center;padding:48px"><h2>Returning to the app…</h2><p><a href="${link}">Tap here if nothing happens</a></p>
<script>location.href=${JSON.stringify(link)}</script></body>`);
  });
  r.get("/health", (_req, res) => res.json({ ok: true }));
  return r;
}
