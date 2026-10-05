import type { OutletHours } from "@prisma/client";

export const LAGOS_OFFSET_MIN = 60; // Africa/Lagos is UTC+1 year-round (no DST)

export interface Slot { startsAt: string; available: boolean; reason?: "past" | "full" }

/** "YYYY-MM-DD" in Lagos local time for a given instant. */
export function lagosDate(d: Date): string {
  return new Date(d.getTime() + LAGOS_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function buildSlots(p: {
  hours: Pick<OutletHours, "dayOfWeek" | "openMin" | "closeMin">[];
  date: string; // Lagos-local YYYY-MM-DD
  now: Date; prepMinutes: number; slotMinutes: number; capacity: number;
  counts: Map<string, number>; // ISO startsAt -> orders holding that slot
}): Slot[] {
  const midnightUtc = Date.parse(`${p.date}T00:00:00Z`) - LAGOS_OFFSET_MIN * 60_000;
  const dow = new Date(Date.parse(`${p.date}T12:00:00Z`)).getUTCDay();
  const h = p.hours.find((x) => x.dayOfWeek === dow);
  if (!h) return [];
  const earliest = p.now.getTime() + p.prepMinutes * 60_000;
  const out: Slot[] = [];
  for (let m = h.openMin; m + p.slotMinutes <= h.closeMin; m += p.slotMinutes) {
    const startsAt = new Date(midnightUtc + m * 60_000);
    const iso = startsAt.toISOString();
    if (startsAt.getTime() < earliest) out.push({ startsAt: iso, available: false, reason: "past" });
    else if ((p.counts.get(iso) ?? 0) >= p.capacity) out.push({ startsAt: iso, available: false, reason: "full" });
    else out.push({ startsAt: iso, available: true });
  }
  return out;
}
