import { useCallback, useEffect, useState } from "react";
import { api, send, type Me } from "../api";

interface U { id: string; phone: string; name: string | null; role: string; outletId: string | null }

export function Staff({ me }: { me: Me }) {
  const [users, setUsers] = useState<U[]>([]); const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ phone: "", name: "", role: "STAFF", outletId: "" }); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<U[]>("/admin/users").then(setUsers).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); api("/outlets").then((o) => { setOutlets(o); setF((x) => ({ ...x, outletId: o[0]?.id ?? "" })); }).catch(() => {}); }, [load]);
  const save = async (u: { phone: string; name?: string; role: string; outletId?: string | null }) => { try { await send("POST", "/admin/users", u); setErr(null); load(); } catch (e: any) { setErr(e.message); } };
  const oname = (id: string | null) => outlets.find((o) => o.id === id)?.name ?? "—";
  return (
    <>
      <h2>Staff & admins</h2>{err && <div className="err">{err}</div>}
      <div className="card"><div className="row">
        <label>Phone<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="0803…" /></label>
        <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="STAFF">Staff (one outlet)</option><option value="ADMIN">Admin</option></select></label>
        {f.role === "STAFF" && <label>Outlet<select value={f.outletId} onChange={(e) => setF({ ...f, outletId: e.target.value })}>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
        <button className="btn" disabled={f.phone.replace(/\D/g, "").length < 10} onClick={() => save({ phone: f.phone, name: f.name || undefined, role: f.role, outletId: f.role === "STAFF" ? f.outletId : null }).then(() => setF({ ...f, phone: "", name: "" }))}>Add / update</button>
      </div><div className="mute">They sign in with their phone number + SMS code. Role changes take effect immediately.</div></div>
      <div className="card"><table><thead><tr><th>Phone</th><th>Name</th><th>Role</th><th>Outlet</th><th /></tr></thead><tbody>
        {users.map((u) => <tr key={u.id}><td>{u.phone}</td><td>{u.name ?? ""}</td><td>{u.role}</td><td>{oname(u.outletId)}</td>
          <td>{u.id !== me.id && <button className="btn ghost" onClick={() => confirm(`Remove staff access for ${u.phone}?`) && save({ phone: u.phone, role: "CUSTOMER", outletId: null })}>Remove access</button>}</td></tr>)}
      </tbody></table></div>
    </>
  );
}
