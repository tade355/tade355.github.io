import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, ErrorText, Input } from "../components/ui";
import { ApiError, api, post } from "../lib/api";
import { useCart } from "../lib/cart";
import { naira } from "../lib/money";
import { fmtDay, fmtTime, lagosDate } from "../lib/time";
import type { Order, Slot } from "../lib/types";
import { colors } from "../theme";

export const RETURN_URL = "naijabites://payment-complete";

/** Open Paystack's hosted checkout (cards, bank transfer, USSD). Card details never touch this app. */
export async function payForOrder(orderId: string): Promise<Order> {
  const { authorizationUrl } = await post<{ authorizationUrl: string }>(`/orders/${orderId}/pay`);
  await WebBrowser.openAuthSessionAsync(authorizationUrl, RETURN_URL);
  // Whatever the browser reports, ask OUR server (which asks Paystack) for the truth.
  return api<Order>(`/orders/${orderId}/verify`);
}

export default function Checkout() {
  const cart = useCart();
  const [day, setDay] = useState(0);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    if (!cart.outlet) return;
    setSlots(null);
    try { setSlots(await api<Slot[]>(`/outlets/${cart.outlet.id}/slots?date=${lagosDate(day)}`)); setErr(null); } catch (e: any) { setErr(e.message); setSlots([]); }
  }, [cart.outlet?.id, day]);
  useEffect(() => { setSlot(null); loadSlots(); }, [loadSlots]);

  if (!cart.outlet || !cart.count) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text>Your cart is empty.</Text></View>;
  const open = (slots ?? []).filter((s) => s.available);

  const pay = async () => {
    if (!slot || !cart.outlet) return;
    setBusy(true); setErr(null);
    let orderId: string | null = null;
    try {
      const order = await post<Order>("/orders", {
        outletId: cart.outlet.id, pickupAt: slot, note: note.trim() || undefined,
        items: cart.lines.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity })),
      });
      orderId = order.id; cart.clear();
      await payForOrder(order.id);
    } catch (e) {
      if (e instanceof ApiError && !orderId) {
        setErr(e.message);
        if (e.code === "slot_unavailable") { setSlot(null); loadSlots(); }
        setBusy(false); return;
      }
      // order exists but verification failed (e.g. offline): the order screen will keep checking
    }
    setBusy(false);
    if (orderId) router.replace(`/order/${orderId}`);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Card><Text style={s.h}>Pickup point</Text><Text style={{ fontWeight: "700" }}>{cart.outlet.name}</Text><Text style={{ color: colors.mute }}>{cart.outlet.address}</Text></Card>
        <Text style={s.h}>Pickup day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {[0, 1, 2, 3].map((d) => <Chip key={d} label={d === 0 ? "Today" : d === 1 ? "Tomorrow" : fmtDay(new Date(Date.now() + d * 86_400_000).toISOString())} active={day === d} onPress={() => setDay(d)} />)}
        </ScrollView>
        <Text style={s.h}>Pickup time</Text>
        {slots === null ? <ActivityIndicator color={colors.green} /> : open.length === 0 ? (
          <Text style={{ color: colors.mute, marginBottom: 12 }}>No pickup slots left for this day. Try another day.</Text>
        ) : (
          <View style={s.grid}>{open.map((sl) => <Chip key={sl.startsAt} label={fmtTime(sl.startsAt)} active={slot === sl.startsAt} onPress={() => setSlot(sl.startsAt)} />)}</View>
        )}
        <Input label="Note for the kitchen (optional)" value={note} onChangeText={setNote} maxLength={200} placeholder="e.g. less pepper" />
        <Card>
          {cart.lines.map((l) => <View key={l.item.id} style={s.row}><Text>{l.quantity}× {l.item.name}</Text><Text>{naira(l.item.priceKobo * l.quantity)}</Text></View>)}
          <View style={[s.row, { marginTop: 8 }]}><Text style={s.h}>Total</Text><Text style={[s.h, { color: colors.green }]}>{naira(cart.totalKobo)}</Text></View>
        </Card>
        <Text style={{ color: colors.mute, fontSize: 12, marginBottom: 12 }}>You'll pay securely on Paystack with card, bank transfer or USSD. Your order is confirmed once payment goes through.</Text>
        <ErrorText>{err}</ErrorText>
        <Button title={`Pay ${naira(cart.totalKobo)}`} onPress={pay} loading={busy} disabled={!slot} />
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  h: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 8, marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
});
