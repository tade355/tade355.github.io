import type { OrderStatus } from "@prisma/client";
import { conflict } from "../lib/errors.js";

/** Single source of truth for order lifecycle. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PLACED", "CANCELLED"],
  PLACED: ["PREPARING"],
  PREPARING: ["READY"],
  READY: ["COLLECTED"],
  COLLECTED: [],
  CANCELLED: [],
};

/** Statuses during which the customer must never be signed out. */
export const ACTIVE_STATUSES: OrderStatus[] = ["PLACED", "PREPARING", "READY"];

export const canTransition = (from: OrderStatus, to: OrderStatus) => TRANSITIONS[from].includes(to);

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) throw conflict(`Cannot move order from ${from} to ${to}`, "bad_transition");
}

export const isTerminal = (s: OrderStatus) => TRANSITIONS[s].length === 0;

export const STATUS_MESSAGES: Partial<Record<OrderStatus, { title: string; body: (code: string) => string }>> = {
  PLACED: { title: "Order placed ✅", body: (c) => `Payment received. Your order ${c} is in the queue.` },
  PREPARING: { title: "Preparing your order 🍳", body: (c) => `The kitchen has started order ${c}.` },
  READY: { title: "Ready for pickup 🛍️", body: (c) => `Order ${c} is ready. Show your QR code at the counter.` },
  COLLECTED: { title: "Enjoy your meal 😋", body: (c) => `Order ${c} collected. Thank you!` },
};
