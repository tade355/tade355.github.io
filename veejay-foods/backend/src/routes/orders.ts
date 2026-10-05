import { mkdirSync } from "node:fs";
import { extname } from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { badRequest, notFound } from "../lib/errors.js";
import { randomToken } from "../lib/crypto.js";
import { wrap, parse } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import { createOrder } from "../services/orders.js";
import { initiatePayment, verifyLatestPayment } from "../services/payments.js";
import { qrPayload } from "../services/qr.js";
import { createComplaint } from "../services/complaints.js";

export const UPLOAD_DIR = "uploads";
mkdirSync(UPLOAD_DIR, { recursive: true });
export const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, randomToken(16) + extname(file.originalname).toLowerCase().replace(/[^.\w]/g, "")),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (/^image\/(jpeg|png|webp)$/.test(file.mimetype) ? cb(null, true) : cb(badRequest("Only JPG, PNG or WebP images")) ),
});

const orderView = (o: any) => ({
  id: o.id, code: o.code, status: o.status, pickupAt: o.pickupAt, note: o.note, totalKobo: o.totalKobo, paidAt: o.paidAt,
  collectedAt: o.collectedAt, createdAt: o.createdAt, expiresAt: o.expiresAt, outlet: o.outlet,
  items: o.items?.map((i: any) => ({ id: i.id, name: i.nameSnapshot, unitPriceKobo: i.unitPriceKobo, quantity: i.quantity })),
  events: o.events?.map((e: any) => ({ status: e.toStatus, at: e.createdAt })),
});

export function orderRoutes(deps: Deps) {
  const r = Router();
  r.use(requireAuth);
  const include = { items: true, outlet: { select: { id: true, name: true, address: true } }, events: { orderBy: { createdAt: "asc" as const } } };

  r.post("/orders", wrap(async (req, res) => {
    const b = parse(z.object({
      outletId: z.string(), pickupAt: z.string(), note: z.string().max(200).optional(),
      items: z.array(z.object({ menuItemId: z.string(), quantity: z.number().int() })).min(1).max(40),
    }), req.body);
    const o = await createOrder(deps, req.user!.sub, b);
    res.status(201).json(orderView(await deps.db.order.findUniqueOrThrow({ where: { id: o.id }, include })));
  }));

  r.get("/orders", wrap(async (req, res) => {
    const list = await deps.db.order.findMany({ where: { userId: req.user!.sub, status: { not: "CANCELLED" } }, include, orderBy: { createdAt: "desc" }, take: 50 });
    res.json(list.map(orderView));
  }));

  const mine = async (userId: string, id: string) => {
    const o = await deps.db.order.findFirst({ where: { id, userId }, include });
    if (!o) throw notFound("Order not found");
    return o;
  };

  r.get("/orders/:id", wrap(async (req, res) => res.json(orderView(await mine(req.user!.sub, req.params.id)))));

  r.post("/orders/:id/pay", wrap(async (req, res) => res.json(await initiatePayment(deps, req.user!.sub, req.params.id))));

  r.get("/orders/:id/verify", wrap(async (req, res) => {
    await verifyLatestPayment(deps, req.user!.sub, req.params.id);
    res.json(orderView(await mine(req.user!.sub, req.params.id)));
  }));

  r.get("/orders/:id/qr", wrap(async (req, res) => {
    const o = await mine(req.user!.sub, req.params.id);
    if (!["PLACED", "PREPARING", "READY", "COLLECTED"].includes(o.status)) throw badRequest("QR is available once the order is paid", "not_paid");
    res.json({ payload: qrPayload(o.id), code: o.code, status: o.status });
  }));

  r.post("/complaints", upload.single("photo"), wrap(async (req, res) => {
    const b = parse(z.object({ orderId: z.string(), reason: z.string().min(1), description: z.string().optional() }), req.body);
    const c = await createComplaint(deps, req.user!.sub, { ...b, photoUrl: req.file ? `/uploads/${req.file.filename}` : undefined });
    res.status(201).json(c);
  }));

  r.get("/complaints", wrap(async (req, res) => {
    res.json(await deps.db.complaint.findMany({ where: { userId: req.user!.sub }, include: { refund: true }, orderBy: { createdAt: "desc" } }));
  }));
  return r;
}
