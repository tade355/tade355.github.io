import { useEffect, useState } from "react";
import { api, hasStoredSession, logout, onSessionEnded, refresh, requestOtp, verifyOtp, type Me } from "./api";
import { BRAND } from "./brand";
import { Complaints } from "./pages/Complaints";
import { Menu } from "./pages/Menu";
import { Outlets } from "./pages/Outlets";
import { Queue } from "./pages/Queue";
import { Reports } from "./pages/Reports";
import { Scanner } from "./pages/Scanner";
import { Staff } from "./pages/Staff";

const TABS = [
  { id: "queue", label: "Live orders", roles: ["STAFF", "ADMIN"], el: Queue },
  { id: "scan", label: "Scan pickup QR", roles: ["STAFF", "ADMIN"], el: Scanner },
  { id: "refunds", label: "Complaints & refunds", roles: ["ADMIN"], el: Complaints },
  { id: "menu", label: "Menu", roles: ["ADMIN"], el: Menu },
  { id: "outlets", label: "Outlets", roles: ["ADMIN"], el: Outlets },
  { id: "reports", label: "Sales", roles: ["ADMIN"], el: Reports },
  { id: "staff", label: "Staff", roles: ["ADMIN"], el: Staff },
] as const;

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("queue");

  useEffect(() => {
    onSessionEnded(() => setMe(null));
    (async () => {
      try { if (hasStoredSession() && (await refresh())) setMe(await api<Me>("/me")); } catch { /* offline: show login */ }
      setReady(true);
    })();
  }, []);

  if (!ready) return <main>Loading…</main>;
  if (!me || me.role === "CUSTOMER") return <Login onDone={setMe} denied={me?.role === "CUSTOMER"} />;
  const tabs = TABS.filter((t) => (t.roles as readonly string[]).includes(me.role));
  const Page = (tabs.find((t) => t.id === tab) ?? tabs[0]).el;
  return (
    <>
      <header className="top">
        <b>🍛 {BRAND}</b>
        <nav>{tabs.map((t) => <button key={t.id} className={t.id === tab ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}</nav>
        <span>{me.name ?? me.phone} · {me.role}</span>
        <button className="btn ghost" onClick={async () => { await logout(); setMe(null); }}>Sign out</button>
      </header>
      <main><Page me={me} /></main>
    </>
  );
}

function Login({ onDone, denied }: { onDone: (m: Me) => void; denied?: boolean }) {
  const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(denied ? "This account doesn't have staff access." : null); const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="login card">
      <h2>🍛 {BRAND} — Staff</h2>
      {step === 0 ? (
        <form onSubmit={(e) => { e.preventDefault(); go(async () => { await requestOtp(phone); setStep(1); }); }}>
          <label>Phone number<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" inputMode="tel" autoFocus /></label>
          {err && <div className="err">{err}</div>}
          <p><button className="btn" disabled={busy || phone.replace(/\D/g, "").length < 10}>Send code</button></p>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); go(async () => { const u = await verifyOtp(phone, code); onDone(u); }); }}>
          <label>6-digit code<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code" /></label>
          {err && <div className="err">{err}</div>}
          <p><button className="btn" disabled={busy || code.length !== 6}>Sign in</button> <button type="button" className="btn ghost" onClick={() => setStep(0)}>Back</button></p>
        </form>
      )}
    </div>
  );
}
