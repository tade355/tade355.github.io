import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearSession, isNetworkError, loadRefresh, post, publicPost, refreshSession, setAccessToken, setSessionEndedHandler, storeRefresh } from "./api";
import type { User } from "./types";

interface AuthCtx {
  user: User | null; ready: boolean; offline: boolean;
  requestOtp(phone: string): Promise<void>; verifyOtp(phone: string, code: string): Promise<void>; logout(): Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => { setSessionEndedHandler(() => setUser(null)); }, []);

  // Restore session on launch. Having a refresh token but no network must NOT look like "logged out".
  useEffect(() => {
    (async () => {
      try {
        if (!(await loadRefresh())) return;
        try {
          if (await refreshSession()) setUser(await api<User>("/me"));
        } catch (e) {
          if (isNetworkError(e)) { setOffline(true); setUser({ id: "cached", phone: "", name: null, role: "CUSTOMER" }); }
        }
      } finally { setReady(true); }
    })();
  }, []);

  // If we started offline, finish restoring the real profile once connectivity returns.
  useEffect(() => {
    if (!offline) return;
    const t = setInterval(async () => {
      try { if (await refreshSession()) { setUser(await api<User>("/me")); setOffline(false); } } catch { /* still offline */ }
    }, 10_000);
    return () => clearInterval(t);
  }, [offline]);

  const requestOtp = useCallback(async (phone: string) => { await publicPost("/auth/otp/request", { phone }); }, []);
  const verifyOtp = useCallback(async (phone: string, code: string) => {
    const r = await publicPost("/auth/otp/verify", { phone, code });
    setAccessToken(r.accessToken); await storeRefresh(r.refreshToken); setUser(r.user);
  }, []);
  const logout = useCallback(async () => {
    const t = await loadRefresh();
    if (t) { try { await post("/auth/logout", { refreshToken: t }); } catch { /* best effort */ } }
    await clearSession(); setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, offline, requestOtp, verifyOtp, logout }), [user, ready, offline, requestOtp, verifyOtp, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
