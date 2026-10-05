import { Expo, type ExpoPushMessage } from "expo-server-sdk";

export interface PushSender { send(token: string, title: string, body: string, data?: Record<string, unknown>): Promise<void> }

const expo = new Expo();
export const expoPush: PushSender = {
  async send(token, title, body, data) {
    if (!Expo.isExpoPushToken(token)) return;
    const msg: ExpoPushMessage = { to: token, title, body, data, sound: "default", channelId: "orders" };
    try { await expo.sendPushNotificationsAsync([msg]); } catch (e) { console.error("push failed", e); }
  },
};
