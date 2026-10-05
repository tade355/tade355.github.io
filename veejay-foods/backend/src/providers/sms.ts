import { env, BRAND } from "../env.js";

export interface SmsSender { send(phone: string, text: string): Promise<void> }

export const consoleSms: SmsSender = {
  async send(phone, text) { console.log(`[sms:console] to ${phone}: ${text}`); },
};

/** Termii (popular in Nigeria). Requires TERMII_API_KEY + TERMII_SENDER_ID. */
export const termiiSms: SmsSender = {
  async send(phone, text) {
    const res = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone.replace("+", ""), from: process.env.TERMII_SENDER_ID, sms: text, type: "plain", channel: "generic", api_key: process.env.TERMII_API_KEY }),
    });
    if (!res.ok) throw new Error("SMS send failed");
  },
};

export const defaultSms = (): SmsSender => (env.SMS_PROVIDER === "termii" ? termiiSms : consoleSms);
export const otpMessage = (code: string) => `${BRAND}: your code is ${code}. It expires in 5 minutes. Don't share it.`;
