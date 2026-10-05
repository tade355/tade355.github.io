import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@prisma/client";
import { ACTIVE_STATUSES, assertTransition, canTransition, isTerminal, TRANSITIONS } from "../src/services/orderStateMachine.js";

const ALL = Object.keys(TRANSITIONS) as OrderStatus[];
const VALID: [OrderStatus, OrderStatus][] = [
  ["PENDING_PAYMENT", "PLACED"], ["PENDING_PAYMENT", "CANCELLED"],
  ["PLACED", "PREPARING"], ["PREPARING", "READY"], ["READY", "COLLECTED"],
];

describe("order state machine", () => {
  it("allows exactly the documented transitions and nothing else", () => {
    for (const from of ALL) for (const to of ALL) {
      const expected = VALID.some(([a, b]) => a === from && b === to);
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(expected);
    }
  });
  it("cannot skip states (PLACED -> READY / COLLECTED)", () => {
    expect(() => assertTransition("PLACED", "READY")).toThrow(/Cannot move/);
    expect(() => assertTransition("PLACED", "COLLECTED")).toThrow();
    expect(() => assertTransition("PREPARING", "COLLECTED")).toThrow();
  });
  it("cannot go backwards or leave a terminal state", () => {
    expect(() => assertTransition("READY", "PREPARING")).toThrow();
    expect(() => assertTransition("COLLECTED", "READY")).toThrow();
    expect(() => assertTransition("CANCELLED", "PLACED")).toThrow();
    expect(isTerminal("COLLECTED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("PLACED")).toBe(false);
  });
  it("a paid order can never be cancelled", () => {
    for (const s of ["PLACED", "PREPARING", "READY"] as const) expect(canTransition(s, "CANCELLED")).toBe(false);
  });
  it("active statuses are the paid, uncollected ones", () => {
    expect(ACTIVE_STATUSES).toEqual(["PLACED", "PREPARING", "READY"]);
  });
});
