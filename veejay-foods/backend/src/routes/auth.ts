import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { wrap, parse } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import * as auth from "../services/auth.js";

export function authRoutes(deps: Deps) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

  r.post("/auth/otp/request", limiter, wrap(async (req, res) => {
    const { phone } = parse(z.object({ phone: z.string() }), req.body);
    await auth.requestOtp(deps, phone);
    res.json({ ok: true });
  }));

  r.post("/auth/otp/verify", limiter, wrap(async (req, res) => {
    const b = parse(z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/) }), req.body);
    const { user, ...tokens } = await auth.verifyOtp(deps, b.phone, b.code);
    res.json({ ...tokens, user: { id: user.id, phone: user.phone, name: user.name, role: user.role, outletId: user.outletId } });
  }));

  r.post("/auth/refresh", wrap(async (req, res) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
    res.json(await auth.refresh(deps, refreshToken));
  }));

  r.post("/auth/logout", wrap(async (req, res) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string() }), req.body);
    await auth.logout(deps, refreshToken);
    res.json({ ok: true });
  }));

  r.get("/me", requireAuth, wrap(async (req, res) => {
    const u = await deps.db.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
    res.json({ id: u.id, phone: u.phone, name: u.name, role: u.role, outletId: u.outletId });
  }));

  r.patch("/me", requireAuth, wrap(async (req, res) => {
    const b = parse(z.object({ name: z.string().max(80).optional(), expoPushToken: z.string().max(200).nullable().optional() }), req.body);
    const u = await deps.db.user.update({ where: { id: req.user!.sub }, data: b });
    res.json({ id: u.id, phone: u.phone, name: u.name });
  }));
  return r;
}
