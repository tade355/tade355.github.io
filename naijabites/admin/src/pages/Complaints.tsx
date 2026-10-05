import { useCallback, useEffect, useState } from "react";
import { api, img, naira, send } from "../api";

interface C { id: string; reason: string; description: string; photoUrl: string | null; status: string; resolutionNote: string | null; createdAt: string; user: { phone: string; name: string | null }; order: { code: string; totalKobo: number; items: { nameSnapshot: string; quantity: number }[] }; refund: { status: string; amountKobo: number } | null }

export function Complaints() {
  const [list, setList] = useState<C[]>([]); const [status, setStatus] = useState("OPEN"); const [err, setErr] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const load = useCallback(() => api<C[]>(`/admin/complaints?status=${status}`).then((l) => { setList(l); setErr(null); }).catch((e) => setErr(e.message)), [status]);
  useEffect(() => { load(); }, [load]);

  const approve = async (c: C) => {
    const naira_ = amounts[c.id]; const kobo = naira_ ? Math.round(parseFloat(naira_) * 100) : undefined;
    if (!confirm(`Refund ${kobo ? naira(kobo) : "the FULL " + naira(c.order.totalKobo)} to the customer's original payment method?`)) return;
    try { await send("POST", `/admin/complaints/${c.id}/approve`, kobo ? { amountKobo: kobo } : {}); load(); } catch (e: any) { setErr(e.message); }
  };
  const reject = async (c: C) => {
    const note = prompt("Reason for rejecting (shown to the customer):"); if (!note) return;
    try { await send("POST", `/admin/complaints/${c.id}/reject`, { note }); load(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <>
      <div className="row"><h2 style={{ margin: 0 }}>Complaints & refunds</h2>
        <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}>{["OPEN", "APPROVED", "REJECTED"].map((s) => <option key={s}>{s}</option>)}</select></label></div>
      {err && <div className="err">{err}</div>}
      {list.map((c) => (
        <div className="card" key={c.id}>
          <div className="row" style={{ justifyContent: "space-between", margin: 0 }}>
            <b>Order {c.order.code} · {naira(c.order.totalKobo)}</b><span className="mute">{new Date(c.createdAt).toLocaleString("en-NG")}</span></div>
          <div className="mute">{c.user.name ?? ""} {c.user.phone} — ordered: {c.order.items.map((i) => `${i.quantity}× ${i.nameSnapshot}`).join(", ")}</div>
          <p><b>{c.reason}</b>{c.description ? ` — ${c.description}` : ""}</p>
          {c.photoUrl && <a href={img(c.photoUrl)} target="_blank" rel="noreferrer"><img className="thumb" src={img(c.photoUrl)} alt="Customer photo" /></a>}
          {c.status === "OPEN" ? (
            <div className="row" style={{ marginTop: 10 }}>
              <label>Partial refund ₦ (blank = full)<input value={amounts[c.id] ?? ""} onChange={(e) => setAmounts({ ...amounts, [c.id]: e.target.value })} inputMode="decimal" /></label>
              <button className="btn" onClick={() => approve(c)}>Approve & refund</button>
              <button className="btn danger" onClick={() => reject(c)}>Reject</button>
            </div>
          ) : (
            <div className="mute">{c.status}{c.resolutionNote ? ` — ${c.resolutionNote}` : ""}{c.refund ? ` · refund ${naira(c.refund.amountKobo)}: ${c.refund.status}` : ""}</div>
          )}
        </div>
      ))}
      {!list.length && <div className="mute">Nothing here.</div>}
    </>
  );
}
