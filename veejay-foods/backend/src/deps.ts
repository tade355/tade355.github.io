import type { Db } from "./db.js";
import type { PaystackClient } from "./providers/paystack.js";
import type { SmsSender } from "./providers/sms.js";
import type { PushSender } from "./providers/push.js";

export interface Deps {
  db: Db;
  paystack: PaystackClient;
  sms: SmsSender;
  push: PushSender;
  now: () => Date;
}
