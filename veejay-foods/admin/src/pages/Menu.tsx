import { useCallback, useEffect, useState } from "react";
import { api, img, naira, send, API_URL } from "../api";

interface Item { id: string; categoryId: string; name: string; description: string; priceKobo: number; imageUrl: string | null; isCombo: boolean; active: boolean; components: { componentId: string; quantity: number }[] }
interface Cat { id: string; name: string; sortOrder: number; items: Item[] }
interface Outlet { id: string; name: string; unavailable: { menuItemId: string }[] }

const blank = (categoryId: string): Partial<Item> & { priceNaira: string } => ({ categoryId, name: "", description: "", priceNaira: "", isCombo: false, active: true, components: [], imageUrl: null });

export function Menu() {
  const [cats, setCats] = useState<Cat[]>([]); const [outlets, setOutlets] = useState<Outlet[]>([]); const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<(Partial<Item> & { priceNaira: string }) | null>(null); const [newCat, setNewCat] = useState("");
  const load = useCallback(async () => {
    try { const [c, o] = await Promise.all([api<Cat[]>("/admin/menu"), api<Outlet[]>("/admin/outlets")]); setCats(c); setOutlets(o); setErr(null); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const all = cats.flatMap((c) => c.items);
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); setErr(null); } catch (e: any) { setErr(e.message); } };

  const save = () => run(async () => {
    if (!edit) return;
    const kobo = Math.round(parseFloat(edit.priceNaira) * 100);
    if (!edit.name || !Number.isFinite(kobo)) throw new Error("Name and a valid price are required");
    const body = { categoryId: edit.categoryId, name: edit.name, description: edit.description ?? "", priceKobo: kobo, imageUrl: edit.imageUrl ?? null, isCombo: !!edit.isCombo, active: edit.active !== false, components: edit.isCombo ? edit.components ?? [] : [] };
    await (edit.id ? send("PATCH", `/admin/items/${edit.id}`, body) : send("POST", "/admin/items", body));
    setEdit(null);
  });
  const upload = async (f: File) => {
    const fd = new FormData(); fd.append("image", f);
    try { const r = await api<{ url: string }>("/admin/upload", { method: "POST", body: fd }); setEdit((e) => e && { ...e, imageUrl: r.url }); } catch (e: any) { setErr(e.message); }
  };

  return (
    <>
      <h2>Menu</h2>{err && <div className="err">{err}</div>}
      <div className="row"><label>New category<input value={newCat} onChange={(e) => setNewCat(e.target.value)} /></label>
        <button className="btn" disabled={!newCat} onClick={() => run(async () => { await send("POST", "/admin/categories", { name: newCat, sortOrder: cats.length }); setNewCat(""); })}>Add category</button></div>

      {edit && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{edit.id ? "Edit item" : "New item"}</h3>
          <div className="row">
            <label>Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label>Price (₦)<input value={edit.priceNaira} onChange={(e) => setEdit({ ...edit, priceNaira: e.target.value })} inputMode="decimal" /></label>
            <label>Category<select value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <label>Description<textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={2} /></label>
          <div className="row" style={{ marginTop: 10 }}>
            <label>Image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
            {edit.imageUrl && <img className="thumb" style={{ maxWidth: 90 }} src={img(edit.imageUrl)} alt="" />}
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!edit.isCombo} onChange={(e) => setEdit({ ...edit, isCombo: e.target.checked })} /> Combo / meal plan</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> On the menu</label>
          </div>
          {edit.isCombo && (
            <div className="card"><b>Includes</b>
              {all.filter((i) => !i.isCombo && i.id !== edit.id).map((i) => {
                const cur = edit.components?.find((c) => c.componentId === i.id);
                return <div key={i.id} className="row" style={{ margin: "4px 0" }}><span style={{ minWidth: 200 }}>{i.name}</span>
                  <input type="number" min={0} max={20} value={cur?.quantity ?? 0} style={{ width: 70 }} onChange={(e) => { const q = +e.target.value; const rest = (edit.components ?? []).filter((c) => c.componentId !== i.id); setEdit({ ...edit, components: q > 0 ? [...rest, { componentId: i.id, quantity: q }] : rest }); }} /></div>;
              })}</div>
          )}
          <button className="btn" onClick={save}>Save</button> <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
        </div>
      )}

      {cats.map((c) => (
        <div className="card" key={c.id}>
          <div className="row" style={{ justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>{c.name}</h3><button className="btn ghost" onClick={() => setEdit(blank(c.id) as any)}>+ Add item</button></div>
          <table><tbody>
            {c.items.map((i) => (
              <tr key={i.id} style={{ opacity: i.active ? 1 : 0.5 }}>
                <td style={{ width: 56 }}>{i.imageUrl ? <img src={img(i.imageUrl)} width={44} height={44} style={{ objectFit: "cover", borderRadius: 6 }} alt="" /> : "🍽️"}</td>
                <td><b>{i.name}</b> {i.isCombo && <span className="pill" style={{ background: "var(--red-d)" }}>COMBO</span>}<div className="mute">{i.description}</div></td>
                <td>{naira(i.priceKobo)}</td>
                <td>{outlets.map((o) => { const off = o.unavailable.some((u) => u.menuItemId === i.id);
                  return <label key={o.id} style={{ display: "inline-flex", gap: 4, marginRight: 10, alignItems: "center" }} title={`Available at ${o.name}`}>
                    <input type="checkbox" checked={!off} onChange={() => run(() => send("PUT", `/admin/outlets/${o.id}/availability/${i.id}`, { available: off }))} />{o.name.split(" ")[0]}</label>; })}</td>
                <td><button className="btn ghost" onClick={() => setEdit({ ...i, priceNaira: String(i.priceKobo / 100) })}>Edit</button>{" "}
                  {i.active && <button className="btn ghost" onClick={() => confirm(`Remove ${i.name} from the menu?`) && run(() => send("DELETE", `/admin/items/${i.id}`))}>Hide</button>}</td>
              </tr>))}
          </tbody></table>
        </div>
      ))}
      <p className="mute">API: {API_URL}</p>
    </>
  );
}
