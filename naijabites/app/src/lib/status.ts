import type { OrderStatus } from "./types";

export const STEPS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: "PLACED", label: "Placed", hint: "Payment received" },
  { status: "PREPARING", label: "Preparing", hint: "The kitchen is on it" },
  { status: "READY", label: "Ready", hint: "Show your QR at the counter" },
  { status: "COLLECTED", label: "Collected", hint: "Enjoy!" },
];
export const stepIndex = (s: OrderStatus) => STEPS.findIndex((x) => x.status === s);
export const isActive = (s: OrderStatus) => s === "PLACED" || s === "PREPARING" || s === "READY";
export const statusLabel = (s: OrderStatus) => (s === "PENDING_PAYMENT" ? "Awaiting payment" : s === "CANCELLED" ? "Cancelled" : STEPS[stepIndex(s)].label);
