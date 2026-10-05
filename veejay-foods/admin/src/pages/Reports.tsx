import { useEffect, useState } from "react";
import { api, naira } from "../api";

interface R { orders: number; grossKobo: number; refundedKobo: number; netKobo: number; avgOrderKobo: number; byDay: { date: string; orders: number; grossKobo: number }[]; byOutlet: { outlet: string; orders: number; grossKobo: number }[]; topItems: { name: string; quantity: number; grossKobo: number }[] }
const lagos = (plus = 0) => new Date(Date.now() + 3_600_000 + plus * 86_400_000).toISOString().slice(0, 10);

export function Reports() {
  const [from, setFrom] = useState(lagos(-6)); const [to, setTo] = useState(lagos());
  const [outlet, setOutlet] = useState(""); const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [r, setR] = useState<R | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api("/outlets").then(setOutlets).catch(() => {}); }, []);
  useEffect(() => { api<R>(`/admin/reports/sales?from=${from}&to=${to}${outlet ? `&outletId=${outlet}` : ""}`).then((x) => { setR(x); setErr(null); }).catch((e) => setErr(e.message)); }, [from, to, outlet]);
  const max = Math.max(1, ...(r?.byDay.map((d) => d.grossKobo) ?? [1]));
  return (
    <>
      <h2>Sales</h2>
      <div className="row">
        <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Outlet<select value={outlet} onChange={(e) => setOutlet(e.target.value)}><option value="">All</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      </div>
      {err && <div className="err">{err}</div>}
      {r && (<>
        <div className="cols">
          {[["Orders", String(r.orders)], ["Gross sales", naira(r.grossKobo)], ["Refunds", naira(r.refundedKobo)], ["Net", naira(r.netKobo)], ["Avg order", naira(Math.round(r.avgOrderKobo / 100) * 100)]].map(([k, v]) => <div className="card" key={k}><div className="mute">{k}</div><div className="code">{v}</div></div>)}
        </div>
        <div className="card"><h3 style={{ marginTop: 0 }}>By day</h3>
          {r.byDay.map((d) => <div key={d.date} className="row" style={{ margin: "4px 0", flexWrap: "nowrap" }}><span style={{ width: 90 }}>{d.date}</span><div style={{ flex: 1 }}><div className="bar" style={{ width: `${(d.grossKobo / max) * 100}%` }} /></div><span style={{ width: 150, textAlign: "right" }}>{naira(d.grossKobo)} · {d.orders}</span></div>)}
          {!r.byDay.length && <span className="mute">No paid orders in this range.</span>}</div>
        <div className="cols">
          <div className="card"><h3 style={{ marginTop: 0 }}>By outlet</h3><table><tbody>{r.byOutlet.map((o) => <tr key={o.outlet}><td>{o.outlet}</td><td>{o.orders}</td><td>{naira(o.grossKobo)}</td></tr>)}</tbody></table></div>
          <div className="card"><h3 style={{ marginTop: 0 }}>Top items</h3><table><tbody>{r.topItems.map((i) => <tr key={i.name}><td>{i.name}</td><td>{i.quantity}×</td><td>{naira(i.grossKobo)}</td></tr>)}</tbody></table></div>
        </div></>)}
    </>
  );
}
