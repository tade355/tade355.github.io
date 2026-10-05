import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Button, Card, ErrorText } from "../../components/ui";
import { StatusTimeline } from "../../components/StatusTimeline";
import { api } from "../../lib/api";
import { naira } from "../../lib/money";
import { isActive } from "../../lib/status";
import { fmtDateTime } from "../../lib/time";
import type { Order } from "../../lib/types";
import { colors } from "../../theme";
import { payForOrder } from "../checkout";

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const status = useRef<string>("");

  const load = useCallback(async () => {
    try {
      // while unpaid, use /verify so a late webhook is reconciled straight from Paystack
      const o = await api<Order>(status.current === "PENDING_PAYMENT" ? `/orders/${id}/verify` : `/orders/${id}`);
      status.current = o.status; setOrder(o); setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!status.current || isActive(status.current as any) || status.current === "PENDING_PAYMENT") load(); }, 8_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (order && order.paidAt && order.status !== "CANCELLED" && !qr) api<{ payload: string }>(`/orders/${id}/qr`).then((r) => setQr(r.payload)).catch(() => {});
  }, [order?.status, order?.paidAt, id, qr]);

  if (!order) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>{err ? <ErrorText>{err}</ErrorText> : <ActivityIndicator color={colors.green} />}</View>;
  const expired = order.status === "PENDING_PAYMENT" && order.expiresAt && new Date(order.expiresAt) < new Date();
  const paid = !!order.paidAt && order.status !== "CANCELLED";

  const payNow = async () => { setPaying(true); try { setOrder(await payForOrder(order.id)); } catch (e: any) { setErr(e.message); } finally { setPaying(false); } };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ErrorText>{err}</ErrorText>
      <Text style={s.code}>Order #{order.code}</Text>
      <Text style={s.meta}>{order.outlet.name} · pickup {fmtDateTime(order.pickupAt)}</Text>

      {order.status === "PENDING_PAYMENT" && (
        <Card style={{ borderColor: colors.saffron, borderWidth: 2 }}>
          <Text style={{ fontWeight: "800", marginBottom: 6 }}>{expired ? "This order expired" : "Waiting for payment"}</Text>
          <Text style={{ color: colors.mute, marginBottom: 10 }}>{expired ? "Your pickup slot was released. Please place a new order." : "Paid already? It can take a minute to show up — this page updates by itself."}</Text>
          {!expired && <Button title={`Pay ${naira(order.totalKobo)}`} onPress={payNow} loading={paying} />}
        </Card>
      )}
      {order.status === "CANCELLED" && <Card><Text style={{ fontWeight: "800" }}>Cancelled</Text><Text style={{ color: colors.mute }}>If you were charged, you'll be refunded automatically.</Text></Card>}

      {paid && <Card><StatusTimeline order={order} /></Card>}

      {paid && qr && order.status !== "COLLECTED" && (
        <Card style={{ alignItems: "center" }}>
          <Text style={s.h}>{order.status === "READY" ? "Your order is ready!" : "Your pickup code"}</Text>
          <View style={s.qr} accessibilityLabel="Pickup QR code"><QRCode value={qr} size={200} /></View>
          <Text style={{ color: colors.mute, textAlign: "center" }}>Show this at the counter. Backup code:</Text>
          <Text style={s.big}>{order.code}</Text>
        </Card>
      )}

      <Card>
        <Text style={s.h}>Items</Text>
        {order.items.map((i) => <View key={i.id} style={s.row}><Text>{i.quantity}× {i.name}</Text><Text>{naira(i.unitPriceKobo * i.quantity)}</Text></View>)}
        <View style={[s.row, { marginTop: 8 }]}><Text style={s.h}>Total</Text><Text style={[s.h, { color: colors.green }]}>{naira(order.totalKobo)}</Text></View>
        {order.note ? <Text style={{ color: colors.mute, marginTop: 6 }}>Note: {order.note}</Text> : null}
      </Card>

      {paid && <Button title="Something wrong? Report a problem" variant="ghost" onPress={() => router.push({ pathname: "/order/report", params: { id: order.id, code: order.code } })} />}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  code: { fontSize: 26, fontWeight: "800" }, meta: { color: colors.mute, marginBottom: 14 },
  h: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  qr: { padding: 14, backgroundColor: "#fff", borderRadius: 12, marginVertical: 12 },
  big: { fontSize: 32, fontWeight: "800", letterSpacing: 4, color: colors.green },
});
