const TZ = "Africa/Lagos";
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: TZ });
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
export const fmtDateTime = (iso: string) => `${fmtDay(iso)}, ${fmtTime(iso)}`;
/** Lagos-local YYYY-MM-DD, `plusDays` from now. */
export function lagosDate(plusDays = 0, now = new Date()) {
  return new Date(now.getTime() + 3_600_000 + plusDays * 86_400_000).toISOString().slice(0, 10);
}
