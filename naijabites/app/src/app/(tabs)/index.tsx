import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, ErrorText } from "../../components/ui";
import { absUrl, api } from "../../lib/api";
import { useCart } from "../../lib/cart";
import { naira } from "../../lib/money";
import type { Category, MenuItem, Outlet } from "../../lib/types";
import { colors } from "../../theme";

export default function MenuScreen() {
  const cart = useCart();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<SectionList<MenuItem>>(null);

  const loadOutlets = useCallback(async () => {
    try {
      const o = await api<Outlet[]>("/outlets"); setOutlets(o);
      if (!cart.outlet || !o.some((x) => x.id === cart.outlet!.id)) { if (o[0]) cart.setOutlet(o[0]); }
      setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, [cart.outlet?.id]);
  useEffect(() => { loadOutlets(); }, []);

  const outletId = cart.outlet?.id;
  const loadMenu = useCallback(async () => {
    if (!outletId) return;
    try { setCats(await api<Category[]>(`/menu?outletId=${outletId}`)); setErr(null); } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, [outletId]);
  useEffect(() => { loadMenu(); }, [loadMenu]);

  const sections = useMemo(() => cats.filter((c) => c.items.length).map((c) => ({ title: c.name, data: c.items })), [cats]);

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={s.outlet} onPress={() => setPicker(true)} accessibilityRole="button" accessibilityLabel="Change pickup point">
        <Text style={s.outletLabel}>Pickup point</Text>
        <Text style={s.outletName}>📍 {cart.outlet?.name ?? "Choose…"}  ▾</Text>
      </Pressable>
      <ErrorText>{err}</ErrorText>
      {sections.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ padding: 12, alignItems: "center" }}>
          {sections.map((sec, i) => (
            <Chip key={sec.title} label={sec.title} active={i === active}
              onPress={() => { setActive(i); list.current?.scrollToLocation({ sectionIndex: i, itemIndex: 0, viewOffset: 44, animated: true }); }} />
          ))}
        </ScrollView>
      )}
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.green} /> : (
        <SectionList
          ref={list} sections={sections} onScrollToIndexFailed={() => {}} keyExtractor={(i) => i.id} stickySectionHeadersEnabled
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => { loadOutlets(); loadMenu(); }} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          renderSectionHeader={({ section }) => <Text style={s.section}>{section.title}</Text>}
          renderItem={({ item }) => <ItemRow item={item} />}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.mute, marginTop: 40 }}>Nothing on the menu right now.</Text>}
        />
      )}
      {cart.count > 0 && (
        <Pressable style={s.bar} onPress={() => router.push("/cart")} accessibilityRole="button">
          <Text style={s.barText}>{cart.count} item{cart.count > 1 ? "s" : ""}</Text>
          <Text style={s.barText}>View cart · {naira(cart.totalKobo)}</Text>
        </Pressable>
      )}
      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <Pressable style={s.backdrop} onPress={() => setPicker(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Choose a pickup point</Text>
            {outlets.map((o) => (
              <Pressable key={o.id} onPress={() => { cart.setOutlet(o); setPicker(false); }} style={[s.opt, cart.outlet?.id === o.id && { borderColor: colors.green }]}>
                <Text style={{ fontWeight: "700" }}>{o.name}</Text>
                <Text style={{ color: colors.mute }}>{o.address}{o.city ? `, ${o.city}` : ""}</Text>
              </Pressable>
            ))}
            <Button title="Close" variant="ghost" onPress={() => setPicker(false)} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ItemRow({ item }: { item: MenuItem }) {
  const cart = useCart(); const q = cart.qty(item.id); const img = absUrl(item.imageUrl);
  return (
    <Card style={[item.isCombo && { borderColor: colors.saffron, borderWidth: 2 }, !item.available && { opacity: 0.5 }]}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {img ? <Image source={{ uri: img }} style={s.img} accessibilityIgnoresInvertColors /> : <View style={[s.img, s.imgPh]}><Text style={{ fontSize: 28 }}>{item.isCombo ? "🎁" : "🍽️"}</Text></View>}
        <View style={{ flex: 1 }}>
          {item.isCombo ? <Text style={s.badge}>MEAL PLAN</Text> : null}
          <Text style={s.name}>{item.name}</Text>
          {item.description ? <Text style={s.desc} numberOfLines={2}>{item.description}</Text> : null}
          {item.components.length ? <Text style={s.desc}>Includes: {item.components.map((c) => `${c.quantity}× ${c.name}`).join(", ")}</Text> : null}
          <View style={s.row}>
            <Text style={s.price}>{naira(item.priceKobo)}</Text>
            {!item.available ? <Text style={{ color: colors.danger, fontWeight: "700" }}>Sold out here</Text> : q === 0 ? (
              <Pressable style={s.add} onPress={() => cart.add(item)} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`}><Text style={s.addText}>Add</Text></Pressable>
            ) : (
              <View style={s.stepper}>
                <Pressable onPress={() => cart.remove(item.id)} style={s.stepBtn} accessibilityLabel="Remove one"><Text style={s.stepText}>−</Text></Pressable>
                <Text style={{ fontWeight: "800", minWidth: 20, textAlign: "center" }}>{q}</Text>
                <Pressable onPress={() => cart.add(item)} style={s.stepBtn} accessibilityLabel="Add one"><Text style={s.stepText}>+</Text></Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  outlet: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.green },
  outletLabel: { color: colors.saffron, fontSize: 12, fontWeight: "700" },
  outletName: { color: "#fff", fontSize: 17, fontWeight: "800" },
  section: { fontSize: 20, fontWeight: "800", color: colors.green, backgroundColor: colors.cream, paddingVertical: 8 },
  img: { width: 84, height: 84, borderRadius: 12, backgroundColor: colors.line },
  imgPh: { alignItems: "center", justifyContent: "center" },
  badge: { color: colors.saffron, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  name: { fontSize: 16, fontWeight: "800", color: colors.ink },
  desc: { color: colors.mute, fontSize: 13, marginTop: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  price: { fontSize: 16, fontWeight: "800", color: colors.green },
  add: { backgroundColor: colors.green, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 99 },
  addText: { color: "#fff", fontWeight: "800" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.line, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 20, fontWeight: "800" },
  bar: { position: "absolute", left: 16, right: 16, bottom: 16, backgroundColor: colors.green, borderRadius: 16, padding: 16, flexDirection: "row", justifyContent: "space-between" },
  barText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: "#0006", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.cream, padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 8 },
  sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  opt: { padding: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.line, backgroundColor: "#fff" },
});
