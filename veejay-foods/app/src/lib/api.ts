import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string) ?? "http://localhost:4000";
export const absUrl = (p: string | null | undefined) => (!p ? undefined : p.startsWith("http") ? p : API_URL + p);

const REFRESH_KEY = "nb.refresh";
let accessToken: string | null = null;
let onSessionEnded: () => void = () => {};
export const setSessionEndedHandler = (fn: () => void) => { onSessionEnded = fn; };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export const isNetworkError = (e: unknown) => !(e instanceof ApiError);

export const storeRefresh = (t: string) => SecureStore.setItemAsync(REFRESH_KEY, t);
export const loadRefresh = () => SecureStore.getItemAsync(REFRESH_KEY);
export const clearSession = async () => { accessToken = null; await SecureStore.deleteItemAsync(REFRESH_KEY); };
export const setAccessToken = (t: string | null) => { accessToken = t; };

async function raw(path: string, init: RequestInit & { auth?: boolean } = {}) {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (!(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (init.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(API_URL + path, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code);
  return body;
}

/**
 * Single-flight refresh. IMPORTANT: only a definitive 401 from the server ends the session.
 * Network errors/timeouts/5xx keep the stored refresh token, so a bad connection never signs anyone out.
 */
let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = await loadRefresh();
    if (!refreshToken) return false;
    try {
      const t = await raw("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }), auth: false });
      accessToken = t.accessToken; await storeRefresh(t.refreshToken);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { await clearSession(); onSessionEnded(); return false; }
      throw e; // transient: keep the session, let the caller retry later
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  try { return await raw(path, init); }
  catch (e) {
    if (e instanceof ApiError && e.status === 401 && e.code === "token_expired") {
      if (await refreshSession()) return raw(path, init);
    }
    throw e;
  }
}

export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const publicPost = <T = any>(path: string, body: unknown) => raw(path, { method: "POST", body: JSON.stringify(body), auth: false }) as Promise<T>;
