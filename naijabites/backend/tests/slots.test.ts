import { describe, expect, it } from "vitest";
import { buildSlots, lagosDate } from "../src/services/slots.js";

const hours = [{ dayOfWeek: 3, openMin: 9 * 60, closeMin: 21 * 60 }]; // Wednesdays 09:00–21:00 Lagos
const base = { hours, date: "2026-06-10", prepMinutes: 30, slotMinutes: 30, capacity: 2, counts: new Map<string, number>() };

describe("buildSlots", () => {
  it("generates half-hour slots across opening hours in Lagos time (UTC+1)", () => {
    const s = buildSlots({ ...base, now: new Date("2026-06-09T00:00:00Z") });
    expect(s).toHaveLength(24);
    expect(s[0].startsAt).toBe("2026-06-10T08:00:00.000Z"); // 09:00 Lagos
    expect(s.at(-1)!.startsAt).toBe("2026-06-10T19:30:00.000Z"); // last slot 20:30 Lagos
  });
  it("returns nothing on days the outlet is closed", () => {
    expect(buildSlots({ ...base, date: "2026-06-11", now: new Date("2026-06-09T00:00:00Z") })).toEqual([]);
  });
  it("blocks slots inside the prep window and marks full ones", () => {
    const counts = new Map([["2026-06-10T10:00:00.000Z", 2]]);
    const s = buildSlots({ ...base, counts, now: new Date("2026-06-10T09:00:00Z") }); // 10:00 Lagos
    const get = (iso: string) => s.find((x) => x.startsAt === iso)!;
    expect(get("2026-06-10T09:00:00.000Z")).toMatchObject({ available: false, reason: "past" });
    expect(get("2026-06-10T09:30:00.000Z")).toMatchObject({ available: true }); // exactly now + prep is bookable
    expect(get("2026-06-10T10:00:00.000Z")).toMatchObject({ available: false, reason: "full" });
    expect(get("2026-06-10T10:30:00.000Z")).toMatchObject({ available: true });
  });
  it("lagosDate rolls over at 23:00 UTC", () => {
    expect(lagosDate(new Date("2026-06-10T22:59:00Z"))).toBe("2026-06-10");
    expect(lagosDate(new Date("2026-06-10T23:00:00Z"))).toBe("2026-06-11");
  });
});
