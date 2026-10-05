import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Card, ErrorText } from "../../components/ui";
import { api } from "../../lib/api";
import { naira } from "../../lib/money";
import { isActive, statusLabel } from "../../lib/status";
import { fmtDateTime } from "../../lib/time";
import type { Order } from "../../lib/types";
import { colors } from "../../theme";

export default function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setOrders(await api<Order[]>("/orders")); setErr(null); } catch (e: any) { setErr(e.message); }
  }, []);
  // refresh whenever the tab is focused, and poll while there's something in flight
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]));

  const sorted = [...(orders ?? [])].sort((a, b) => Number(isActive(b.status)) - Number(isActive(a.status)));
  return (
    <FlatList
      data={sorted} keyExtractor={(o) => o.id} contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      ListHeaderComponent={<ErrorText>{err}</ErrorText>}
      ListEmptyComponent={orders ? <Text style={{ textAlign: "center", color: colors.mute, marginTop: 60 }}>No orders yet. Your first one is on us to enjoy 🙂</Text> : null}
      renderItem={({ item: o }) => (
        <Pressable onPress={() => router.push(`/order/${o.id}`)} accessibilityRole="button">
          <Card style={isActive(o.status) ? { borderColor: colors.saffron, borderWidth: 2 } : undefined}>
            <View style={s.top}><Text style={s.code}>#{o.code}</Text><Text style={[s.pill, o.status === "READY" && { backgroundColor: colors.ok }]}>{statusLabel(o.status)}</Text></View>
            <Text style={s.line} numberOfLines={1}>{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</Text>
            <Text style={s.meta}>{o.outlet.name} · {fmtDateTime(o.pickupAt)}</Text>
            <Text style={s.total}>{naira(o.totalKobo)}</Text>
          </Card>
        </Pressable>
      )}
    />
  );
}
const s = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { fontSize: 18, fontWeight: "800" },
  pill: { backgroundColor: colors.green, color: "#fff", fontWeight: "700", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, overflow: "hidden", fontSize: 12 },
  line: { marginTop: 6 }, meta: { color: colors.mute, marginTop: 2 },
  total: { marginTop: 6, fontWeight: "800", color: colors.green },
});
