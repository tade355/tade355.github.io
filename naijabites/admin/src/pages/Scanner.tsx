import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";
import { send } from "../api";

type Result = { ok: boolean; text: string };

export function Scanner() {
  const [result, setResult] = useState<Result | null>(null);
  const [code, setCode] = useState(""); const [camErr, setCamErr] = useState<string | null>(null);
  const busy = useRef(false); const last = useRef("");

  const submit = async (fn: () => Promise<any>, label: (r: any) => string) => {
    try { const r = await fn(); setResult({ ok: true, text: label(r) }); }
    catch (e: any) { setResult({ ok: false, text: e.message }); }
  };

  useEffect(() => {
    const qr = new Html5Qrcode("reader"); let started = false;
    qr.start({ facingMode: "environment" }, { fps: 10, qrbox: 240 }, async (text) => {
      if (busy.current || text === last.current) return; // ignore repeat frames of the same code
      busy.current = true; last.current = text;
      await submit(() => send("POST", "/staff/scan", { payload: text }), (r) => `✅ Order ${r.code} collected: ${r.items.map((i: any) => `${i.quantity}× ${i.name}`).join(", ")}`);
      setTimeout(() => { busy.current = false; last.current = ""; }, 2500);
    }, () => {}).then(() => { started = true; }).catch((e) => setCamErr(String(e?.message ?? e)));
    return () => { if (started) qr.stop().then(() => qr.clear()).catch(() => {}); };
  }, []);

  return (
    <>
      <h2>Scan pickup QR</h2>
      {camErr && <div className="err">Camera unavailable ({camErr}). Use the order code below instead.</div>}
      <div id="reader" />
      {result && <div className={`flash ${result.ok ? "good" : "bad"}`} role="status">{result.text}</div>}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>No QR? Enter the order code</h3>
        <form className="row" onSubmit={(e) => { e.preventDefault(); submit(() => send("POST", "/staff/collect-by-code", { code }), (r) => `✅ Order ${r.code} collected`); setCode(""); }}>
          <label>Order code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} style={{ textTransform: "uppercase" }} /></label>
          <button className="btn" disabled={code.length < 4}>Mark collected</button>
        </form>
      </div>
    </>
  );
}
