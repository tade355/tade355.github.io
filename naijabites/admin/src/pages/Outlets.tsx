import { useCallback, useEffect, useState } from "react";
import { api, send } from "../api";

interface Hours { dayOfWeek: number; openMin: number; closeMin: number }
interface O { id: string; name: string; address: string; city: string; active: boolean; prepMinutes: number; slotMinutes: number; slotCapacity: number; hours: Hours[] }
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

export function Outlets() {
  const [list, setList] = useState<O[]>([]); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const [nw, setNw] = useState({ name: "", address: "", city: "" });
  const load = useCallback(() => api<O[]>("/admin/outlets").then(setList).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<unknown>, ok = "Saved ✓") => { try { await fn(); await load(); setErr(null); setMsg(ok); } catch (e: any) { setErr(e.message); setMsg(null); } };
  const upd = (id: string, patch: Partial<O>) => setList((l) => l.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  return (
    <>
      <h2>Pickup points</h2>{err && <div className="err">{err}</div>}{msg && <div className="ok">{msg}</div>}
      {list.map((o) => (
        <div className="card" key={o.id}>
          <div className="row">
            <label>Name<input value={o.name} onChange={(e) => upd(o.id, { name: e.target.value })} /></label>
            <label>Address<input value={o.address} onChange={(e) => upd(o.id, { address: e.target.value })} /></label>
            <label>City<input value={o.city} onChange={(e) => upd(o.id, { city: e.target.value })} /></label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={o.active} onChange={(e) => upd(o.id, { active: e.target.checked })} />Open for orders</label>
          </div>
          <div className="row">
            <label>Prep time (min)<input type="number" value={o.prepMinutes} onChange={(e) => upd(o.id, { prepMinutes: +e.target.value })} style={{ width: 90 }} /></label>
            <label>Slot length (min)<input type="number" value={o.slotMinutes} onChange={(e) => upd(o.id, { slotMinutes: +e.target.value })} style={{ width: 90 }} /></label>
            <label>Orders per slot<input type="number" value={o.slotCapacity} onChange={(e) => upd(o.id, { slotCapacity: +e.target.value })} style={{ width: 90 }} /></label>
          </div>
          <table><tbody>{DAYS.map((d, i) => {
            const h = o.hours.find((x) => x.dayOfWeek === i);
            const set = (p: Partial<Hours> | null) => upd(o.id, { hours: p === null ? o.hours.filter((x) => x.dayOfWeek !== i) : [...o.hours.filter((x) => x.dayOfWeek !== i), { dayOfWeek: i, openMin: 540, closeMin: 1260, ...h, ...p }] });
            return <tr key={d}><td style={{ width: 60 }}><b>{d}</b></td>
              <td><label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={!!h} onChange={(e) => set(e.target.checked ? {} : null)} />Open</label></td>
              <td>{h && <><input type="time" value={hhmm(h.openMin)} onChange={(e) => set({ openMin: toMin(e.target.value) })} /> – <input type="time" value={hhmm(h.closeMin === 1440 ? 1439 : h.closeMin)} onChange={(e) => set({ closeMin: toMin(e.target.value) })} /></>}</td></tr>;
          })}</tbody></table>
          <button className="btn" onClick={() => run(async () => {
            await send("PATCH", `/admin/outlets/${o.id}`, { name: o.name, address: o.address, city: o.city, active: o.active, prepMinutes: o.prepMinutes, slotMinutes: o.slotMinutes, slotCapacity: o.slotCapacity });
            await send("PUT", `/admin/outlets/${o.id}/hours`, o.hours.map(({ dayOfWeek, openMin, closeMin }) => ({ dayOfWeek, openMin, closeMin })));
          })}>Save {o.name}</button>
        </div>
      ))}
      <div className="card"><h3 style={{ marginTop: 0 }}>Add a pickup point</h3>
        <div className="row"><label>Name<input value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} /></label>
          <label>Address<input value={nw.address} onChange={(e) => setNw({ ...nw, address: e.target.value })} /></label>
          <label>City<input value={nw.city} onChange={(e) => setNw({ ...nw, city: e.target.value })} /></label>
          <button className="btn" disabled={!nw.name || !nw.address} onClick={() => run(async () => { await send("POST", "/admin/outlets", nw); setNw({ name: "", address: "", city: "" }); }, "Outlet added — now set its opening hours")}>Add</button></div></div>
    </>
  );
}
