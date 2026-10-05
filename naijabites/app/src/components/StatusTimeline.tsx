import { StyleSheet, Text, View } from "react-native";
import { STEPS, stepIndex } from "../lib/status";
import type { Order } from "../lib/types";
import { fmtTime } from "../lib/time";
import { colors } from "../theme";

export function StatusTimeline({ order }: { order: Order }) {
  const cur = stepIndex(order.status);
  return (
    <View accessibilityLabel={`Order status: ${order.status}`}>
      {STEPS.map((st, i) => {
        const done = i <= cur, at = order.events.find((e) => e.status === st.status)?.at;
        return (
          <View key={st.status} style={s.row}>
            <View style={{ alignItems: "center", width: 24 }}>
              <View style={[s.dot, done && s.dotOn, i === cur && s.dotNow]}>{done ? <Text style={s.tick}>✓</Text> : null}</View>
              {i < STEPS.length - 1 ? <View style={[s.bar, i < cur && { backgroundColor: colors.green }]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 18 }}>
              <Text style={[s.label, !done && { color: colors.mute }]}>{st.label}{at ? `  ·  ${fmtTime(at)}` : ""}</Text>
              <Text style={s.hint}>{st.hint}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  dotOn: { backgroundColor: colors.green, borderColor: colors.green },
  dotNow: { borderColor: colors.saffron, borderWidth: 3 },
  tick: { color: "#fff", fontSize: 12, fontWeight: "800" },
  bar: { width: 2, flex: 1, backgroundColor: colors.line, marginVertical: 2 },
  label: { fontSize: 16, fontWeight: "700", color: colors.ink },
  hint: { fontSize: 13, color: colors.mute },
});
