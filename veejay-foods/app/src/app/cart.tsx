import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card } from "../components/ui";
import { useCart } from "../lib/cart";
import { naira } from "../lib/money";
import { colors } from "../theme";

export default function Cart() {
  const cart = useCart();
  if (!cart.count) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.mute }}>Your cart is empty.</Text><Button title="Browse menu" variant="ghost" style={{ marginTop: 12 }} onPress={() => router.back()} /></View>;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: colors.mute, marginBottom: 8 }}>Pickup at {cart.outlet?.name}</Text>
        {cart.lines.map(({ item, quantity }) => (
          <Card key={item.id}>
            <View style={s.row}>
              <View style={{ flex: 1 }}><Text style={s.name}>{item.name}</Text><Text style={{ color: colors.mute }}>{naira(item.priceKobo)} each</Text></View>
              <View style={s.stepper}>
                <Text onPress={() => cart.remove(item.id)} style={s.step} accessibilityRole="button" accessibilityLabel="Remove one">−</Text>
                <Text style={s.qty}>{quantity}</Text>
                <Text onPress={() => cart.add(item)} style={s.step} accessibilityRole="button" accessibilityLabel="Add one">+</Text>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
      <View style={s.footer}>
        <View style={s.row}><Text style={s.name}>Total</Text><Text style={[s.name, { color: colors.green }]}>{naira(cart.totalKobo)}</Text></View>
        <Button title="Choose pickup time" onPress={() => { router.dismiss(); router.push("/checkout"); }} />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  name: { fontSize: 16, fontWeight: "800" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  step: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.line, textAlign: "center", lineHeight: 34, fontSize: 20, fontWeight: "800", overflow: "hidden" },
  qty: { fontWeight: "800", minWidth: 20, textAlign: "center" },
  footer: { padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: "#fff" },
});
