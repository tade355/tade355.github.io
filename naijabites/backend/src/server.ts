import { createApp } from "./app.js";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { httpPaystack } from "./providers/paystack.js";
import { expoPush } from "./providers/push.js";
import { defaultSms } from "./providers/sms.js";
import { expireUnpaidOrders } from "./services/orders.js";
import type { Deps } from "./deps.js";

const deps: Deps = { db: prisma, paystack: httpPaystack(env.PAYSTACK_SECRET_KEY), sms: defaultSms(), push: expoPush, now: () => new Date() };
createApp(deps).listen(env.PORT, () => console.log(`API on :${env.PORT}`));
setInterval(() => expireUnpaidOrders(deps).catch((e) => console.error("expire job", e)), 60_000);
