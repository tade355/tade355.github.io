import { Router } from "express";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { normalizePhone } from "../lib/phone.js";
import { badRequest, notFound } from "../lib/errors.js";
import { wrap, parse } from "../lib/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { approveComplaint, rejectComplaint } from "../services/complaints.js";
import { upload } from "./orders.js";
import { salesReport } from "../services/reports.js";

const price = z.number().int().min(0).max(100_000_00);

export function adminRoutes(deps: Deps) {
  const r = Router();
  r.use("/admin", requireAuth, requireRole("ADMIN"));
  const db = deps.db;

  // ---- menu ----
  r.get("/admin/menu", wrap(async (_req, res) => {
    res.json(await db.category.findMany({ orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" }, include: { components: true } } } }));
  }));
  r.post("/admin/categories", wrap(async (req, res) => {
    res.status(201).json(await db.category.create({ data: parse(z.object({ name: z.string().min(1), sortOrder: z.number().int().default(0) }), req.body) }));
  }));
  r.patch("/admin/categories/:id", wrap(async (req, res) => {
    res.json(await db.category.update({ where: { id: req.params.id }, data: parse(z.object({ name: z.string().min(1).optional(), sortOrder: z.number().int().optional() }), req.body) }));
  }));
  const itemSchema = z.object({
    categoryId: z.string(), name: z.string().min(1), description: z.string().default(""), priceKobo: price,
    imageUrl: z.string().nullable().optional(), isCombo: z.boolean().default(false), active: z.boolean().default(true), sortOrder: z.number().int().default(0),
    components: z.array(z.object({ componentId: z.string(), quantity: z.number().int().min(1).max(20) })).default([]),
  });
  r.post("/admin/items", wrap(async (req, res) => {
    const { components, ...d } = parse(itemSchema, req.body);
    res.status(201).json(await db.menuItem.create({ data: { ...d, components: { create: components } }, include: { components: true } }));
  }));
  r.patch("/admin/items/:id", wrap(async (req, res) => {
    const { components, ...d } = parse(itemSchema.partial(), req.body);
    const item = await db.$transaction(async (tx) => {
      if (components) { await tx.comboComponent.deleteMany({ where: { comboId: req.params.id } }); await tx.comboComponent.createMany({ data: components.map((c) => ({ ...c, comboId: req.params.id })) }); }
      return tx.menuItem.update({ where: { id: req.params.id }, data: d, include: { components: true } });
    });
    res.json(item);
  }));
  // items are soft-deleted (active=false) because past orders reference them
  r.delete("/admin/items/:id", wrap(async (req, res) => { await db.menuItem.update({ where: { id: req.params.id }, data: { active: false } }); res.json({ ok: true }); }));
  r.post("/admin/upload", upload.single("image"), wrap(async (req, res) => {
    if (!req.file) throw badRequest("No image");
    res.json({ url: `/uploads/${req.file.filename}` });
  }));

  // ---- outlets ----
  r.get("/admin/outlets", wrap(async (_req, res) => res.json(await db.outlet.findMany({ include: { hours: true, unavailable: true }, orderBy: { name: "asc" } }))));
  const outletSchema = z.object({
    name: z.string().min(1), address: z.string().min(1), city: z.string().default(""), lat: z.number().nullable().optional(), lng: z.number().nullable().optional(),
    active: z.boolean().default(true), prepMinutes: z.number().int().min(5).max(240).default(30), slotMinutes: z.number().int().min(10).max(120).default(30), slotCapacity: z.number().int().min(1).max(500).default(10),
  });
  r.post("/admin/outlets", wrap(async (req, res) => res.status(201).json(await db.outlet.create({ data: parse(outletSchema, req.body) }))));
  r.patch("/admin/outlets/:id", wrap(async (req, res) => res.json(await db.outlet.update({ where: { id: req.params.id }, data: parse(outletSchema.partial(), req.body) }))));
  r.put("/admin/outlets/:id/hours", wrap(async (req, res) => {
    const hours = parse(z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), openMin: z.number().int().min(0).max(1439), closeMin: z.number().int().min(1).max(1440) }).refine((h) => h.closeMin > h.openMin)), req.body);
    await db.$transaction([db.outletHours.deleteMany({ where: { outletId: req.params.id } }), db.outletHours.createMany({ data: hours.map((h) => ({ ...h, outletId: req.params.id })) })]);
    res.json({ ok: true });
  }));
  r.put("/admin/outlets/:id/availability/:itemId", wrap(async (req, res) => {
    const { available } = parse(z.object({ available: z.boolean() }), req.body);
    const key = { outletId_menuItemId: { outletId: req.params.id, menuItemId: req.params.itemId } };
    if (available) await db.outletItemAvailability.deleteMany({ where: { outletId: req.params.id, menuItemId: req.params.itemId } });
    else await db.outletItemAvailability.upsert({ where: key, update: {}, create: { outletId: req.params.id, menuItemId: req.params.itemId } });
    res.json({ ok: true });
  }));

  // ---- staff ----
  r.get("/admin/users", wrap(async (_req, res) => res.json(await db.user.findMany({ where: { role: { in: ["STAFF", "ADMIN"] } }, select: { id: true, phone: true, name: true, role: true, outletId: true } }))));
  r.post("/admin/users", wrap(async (req, res) => {
    const b = parse(z.object({ phone: z.string(), name: z.string().optional(), role: z.enum(["STAFF", "ADMIN", "CUSTOMER"]), outletId: z.string().nullable().optional() }), req.body);
    if (b.role === "STAFF" && !b.outletId) throw badRequest("Staff need an outlet");
    const phone = normalizePhone(b.phone);
    res.json(await db.user.upsert({ where: { phone }, update: { role: b.role, name: b.name, outletId: b.outletId ?? null }, create: { phone, role: b.role, name: b.name, outletId: b.outletId ?? null } }));
  }));

  // ---- complaints & refunds ----
  r.get("/admin/complaints", wrap(async (req, res) => {
    const status = typeof req.query.status === "string" ? (req.query.status as any) : undefined;
    res.json(await db.complaint.findMany({
      where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: 100,
      include: { refund: true, user: { select: { phone: true, name: true } }, order: { select: { code: true, totalKobo: true, items: true } } },
    }));
  }));
  r.post("/admin/complaints/:id/approve", wrap(async (req, res) => {
    const b = parse(z.object({ amountKobo: z.number().int().positive().optional(), note: z.string().optional() }), req.body ?? {});
    res.json(await approveComplaint(deps, req.params.id, req.user!.sub, b));
  }));
  r.post("/admin/complaints/:id/reject", wrap(async (req, res) => {
    const { note } = parse(z.object({ note: z.string().min(1) }), req.body);
    await rejectComplaint(deps, req.params.id, req.user!.sub, note);
    res.json({ ok: true });
  }));
  r.get("/admin/refunds", wrap(async (_req, res) => res.json(await db.refund.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { payment: { select: { reference: true, order: { select: { code: true } } } } } }))));

  // ---- reports ----
  r.get("/admin/reports/sales", wrap(async (req, res) => {
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), outletId: z.string().optional() }), req.query);
    res.json(await salesReport(deps, q));
  }));
  r.get("/admin/orders/:id", wrap(async (req, res) => {
    const o = await db.order.findUnique({ where: { id: req.params.id }, include: { items: true, events: true, payments: true, user: { select: { phone: true, name: true } } } });
    if (!o) throw notFound(); res.json(o);
  }));
  return r;
}
