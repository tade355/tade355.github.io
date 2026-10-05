import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { badRequest } from "./errors.js";

export const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next: NextFunction) => { fn(req, res).catch(next); };

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  try { return schema.parse(data); }
  catch (e) { if (e instanceof ZodError) throw badRequest(e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "validation"); throw e; }
}
