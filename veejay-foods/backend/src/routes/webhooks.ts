import express, { Router } from "express";
import type { Deps } from "../deps.js";
import { env } from "../env.js";
import { verifyWebhookSignature } from "../providers/paystack.js";
import { handleWebhook } from "../services/payments.js";

/** Mounted BEFORE express.json(): the signature is over the exact raw bytes. */
export function webhookRoutes(deps: Deps) {
  const r = Router();
  r.post("/webhooks/paystack", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    const raw: Buffer = req.body;
    if (!Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, req.header("x-paystack-signature"), env.PAYSTACK_SECRET_KEY))
      return res.status(401).json({ error: "bad signature" });
    let body: any;
    try { body = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "bad json" }); }
    try {
      const out = await handleWebhook(deps, body);
      res.status(200).json(out); // 200 = stop retrying
    } catch (e) {
      console.error("webhook processing failed", e);
      res.status(500).json({ error: "processing failed" }); // Paystack will retry
    }
  });
  return r;
}
