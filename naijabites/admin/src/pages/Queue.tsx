import { useCallback, useEffect, useRef, useState } from "react";
import { api, naira, send, type Me } from "../api";

interface QOrder { id: string; code: string; status: string; pickupAt: string; note: string; totalKobo: number; customer: { phone: string; name: string | null }; outlet: string; items: { name: string; quantity: number }[] }
const COLS = [{ s: "PLACED", t: "New", next: "PREPARING", cta: "Start preparing" }, { s: "PREPARING", t: "Preparing", next: "READY", cta: "Mark ready" }, { s: "READY", t: "Ready for pickup", next: null, cta: "" }] as const;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

export function Queue({ me }: { me: Me }) {
  const [orders, setOrders] = useState<QOrder[]>([]); const [err, setErr] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]); const [outlet, setOutlet] = useState("");
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => { if (me.role === "ADMIN") api("/outlets").then(setOutlets).catch(() => {}); }, [me.role]);
  const load = useCallback(async () => {
    try {
      const list = await api<QOrder[]>(`/staff/orders${outlet ? `?outletId=${outlet}` : ""}`);
      const fresh = list.filter((o) => o.status === "PLACED" && seen.current && !seen.current.has(o.id));
      if (fresh.length) beep();
      seen.current = new Set(list.map((o) => o.id)); setOrders(list); setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, [outlet]);
  useEffect(() => { seen.current = null; load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const advance = async (o: QOrder, to: string) => { try { await send("POST", `/staff/orders/${o.id}/status`, { to }); await load(); } catch (e: any) { setErr(e.message); load(); } };

  return (
    <>
      <div className="row"><h2 style={{ margin: 0 }}>Live orders</h2>
        {me.role === "ADMIN" && <label>Outlet<select value={outlet} onChange={(e) => setOutlet(e.target.value)}><option value="">All</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
        <span className="mute">auto-refreshes every 5s</span></div>
      {err && <div className="err">{err}</div>}
      <div className="cols">
        {COLS.map((c) => {
          const list = orders.filter((o) => o.status === c.s);
          return (
            <section className="col" key={c.s}>
              <h3>{c.t} <span className="pill">{list.length}</span></h3>
              {list.map((o) => (
                <div className="card" key={o.id}>
                  <div className="row" style={{ justifyContent: "space-between", margin: 0 }}><span className="code">{o.code}</span><b>{time(o.pickupAt)}</b></div>
                  <div className="mute">{o.customer.name ?? o.customer.phone} · {naira(o.totalKobo)}</div>
                  <ul style={{ margin: "8px 0", paddingLeft: 18 }}>{o.items.map((i, k) => <li key={k}>{i.quantity}× {i.name}</li>)}</ul>
                  {o.note && <div className="card" style={{ background: "#FFF3D6" }}>📝 {o.note}</div>}
                  {c.next ? <button className="btn" onClick={() => advance(o, c.next!)}>{c.cta}</button> : <span className="mute">Scan the customer's QR to hand over</span>}
                </div>
              ))}
              {!list.length && <div className="mute">Nothing here.</div>}
            </section>
          );
        })}
      </div>
    </>
  );
}

function beep() {
  try { const a = new AudioContext(), o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 880; o.start(); o.stop(a.currentTime + 0.25); } catch { /* autoplay blocked */ }
}
