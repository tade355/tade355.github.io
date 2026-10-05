export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
export const img = (p?: string | null) => (!p ? undefined : p.startsWith("http") ? p : API_URL + p);
export const naira = (kobo: number) => "₦" + (kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });

export class ApiError extends Error { constructor(public status: number, m: string, public code?: string) { super(m); } }
export interface Me { id: string; phone: string; name: string | null; role: "CUSTOMER" | "STAFF" | "ADMIN"; outletId: string | null }

const safe = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
let access: string | null = null;
let onEnded = () => {};
export const onSessionEnded = (f: () => void) => { onEnded = f; };

async function raw(path: string, init: RequestInit = {}, auth = true) {
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (!(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (auth && access) headers.Authorization = `Bearer ${access}`;
  const res = await fetch(API_URL + path, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code);
  return body;
}

let refreshing: Promise<boolean> | null = null;
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const rt = safe.get("nb.admin.refresh"); if (!rt) return false;
    try {
      const t = await raw("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: rt }) }, false);
      access = t.accessToken; safe.set("nb.admin.refresh", t.refreshToken); return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { safe.del("nb.admin.refresh"); access = null; onEnded(); return false; }
      throw e; // network blip: keep the session
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  try { return await raw(path, init); }
  catch (e) { if (e instanceof ApiError && e.status === 401 && e.code === "token_expired" && (await refresh())) return raw(path, init); throw e; }
}
export const send = <T = any>(method: string, path: string, body?: unknown) => api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const requestOtp = (phone: string) => raw("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) }, false);
export async function verifyOtp(phone: string, code: string): Promise<Me> {
  const r = await raw("/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code }) }, false);
  access = r.accessToken; safe.set("nb.admin.refresh", r.refreshToken); return r.user;
}
export const hasStoredSession = () => !!safe.get("nb.admin.refresh");
export async function logout() {
  const rt = safe.get("nb.admin.refresh");
  if (rt) await raw("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: rt }) }, false).catch(() => {});
  safe.del("nb.admin.refresh"); access = null;
}
