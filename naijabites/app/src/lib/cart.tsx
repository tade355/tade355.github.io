import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MenuItem, Outlet } from "./types";

export interface CartLine { item: MenuItem; quantity: number }
interface CartCtx {
  outlet: Outlet | null; setOutlet(o: Outlet): void;
  lines: CartLine[]; count: number; totalKobo: number;
  qty(id: string): number; add(item: MenuItem): void; remove(id: string): void; clear(): void;
}
const Ctx = createContext<CartCtx>(null as never);
export const useCart = () => useContext(Ctx);
const KEY = "nb.cart.v1"; const MAX_QTY = 20;

export function CartProvider({ children }: { children: ReactNode }) {
  const [outlet, setOutletState] = useState<Outlet | null>(null);
  const [map, setMap] = useState<Record<string, CartLine>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((s) => { if (s) { try { const v = JSON.parse(s); setOutletState(v.outlet ?? null); setMap(v.map ?? {}); } catch { /* ignore */ } } }).finally(() => setLoaded(true));
  }, []);
  useEffect(() => { if (loaded) AsyncStorage.setItem(KEY, JSON.stringify({ outlet, map })).catch(() => {}); }, [outlet, map, loaded]);

  const setOutlet = useCallback((o: Outlet) => setOutletState((cur) => { if (cur?.id !== o.id) setMap({}); return o; }), []); // availability/prices are per outlet
  const add = useCallback((item: MenuItem) => setMap((m) => ({ ...m, [item.id]: { item, quantity: Math.min(MAX_QTY, (m[item.id]?.quantity ?? 0) + 1) } })), []);
  const remove = useCallback((id: string) => setMap((m) => {
    const cur = m[id]; if (!cur) return m;
    const { [id]: _, ...rest } = m; return cur.quantity <= 1 ? rest : { ...rest, [id]: { ...cur, quantity: cur.quantity - 1 } };
  }), []);
  const clear = useCallback(() => setMap({}), []);

  const value = useMemo<CartCtx>(() => {
    const lines = Object.values(map);
    return {
      outlet, setOutlet, lines, add, remove, clear,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      totalKobo: lines.reduce((n, l) => n + l.item.priceKobo * l.quantity, 0),
      qty: (id) => map[id]?.quantity ?? 0,
    };
  }, [outlet, map, setOutlet, add, remove, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
