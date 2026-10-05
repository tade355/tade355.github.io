import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { forbidden, unauthorized } from "../lib/errors.js";
import { verifyAccess, type AccessClaims } from "../services/auth.js";

declare global { namespace Express { interface Request { user?: AccessClaims } } }

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return next(unauthorized("Missing token"));
  try { req.user = verifyAccess(h.slice(7)); next(); } catch (e) { next(e); }
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) =>
  req.user && roles.includes(req.user.role) ? next() : next(forbidden("Not allowed"));
