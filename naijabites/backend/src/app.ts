import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import type { Deps } from "./deps.js";
import { HttpError } from "./lib/errors.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { orderRoutes, UPLOAD_DIR } from "./routes/orders.js";
import { publicRoutes } from "./routes/public.js";
import { staffRoutes } from "./routes/staff.js";
import { webhookRoutes } from "./routes/webhooks.js";

export function createApp(deps: Deps) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors());
  app.use(webhookRoutes(deps)); // raw body, must precede express.json()
  app.use(express.json({ limit: "100kb" }));
  app.use("/uploads", express.static(UPLOAD_DIR, { fallthrough: false, maxAge: "7d" }));
  app.use(publicRoutes(deps));
  app.use(authRoutes(deps));
  app.use(orderRoutes(deps));
  app.use(staffRoutes(deps));
  app.use(adminRoutes(deps));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err instanceof ZodError) return res.status(400).json({ error: "Invalid input", code: "validation" });
    if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Image too large (max 5MB)" });
    if (err?.code === "P2025") return res.status(404).json({ error: "Not found" });
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  };
  app.use(onError);
  return app;
}
