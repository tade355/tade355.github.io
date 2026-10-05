import assert from "node:assert/strict";
import { test } from "node:test";
import { naira } from "./money.ts";
import { isActive, stepIndex, statusLabel } from "./status.ts";
import { lagosDate } from "./time.ts";

test("naira formats kobo", () => {
  assert.equal(naira(250000).replace(/\s/g, ""), "₦2,500");
  assert.equal(naira(150050).replace(/\s/g, ""), "₦1,500.50");
});
test("order status helpers", () => {
  assert.equal(stepIndex("PLACED"), 0); assert.equal(stepIndex("COLLECTED"), 3);
  assert.ok(isActive("READY")); assert.ok(!isActive("COLLECTED")); assert.ok(!isActive("PENDING_PAYMENT"));
  assert.equal(statusLabel("PENDING_PAYMENT"), "Awaiting payment");
});
test("lagosDate rolls over at 23:00 UTC", () => {
  assert.equal(lagosDate(0, new Date("2026-06-10T22:59:00Z")), "2026-06-10");
  assert.equal(lagosDate(0, new Date("2026-06-10T23:00:00Z")), "2026-06-11");
  assert.equal(lagosDate(1, new Date("2026-06-10T10:00:00Z")), "2026-06-11");
});
