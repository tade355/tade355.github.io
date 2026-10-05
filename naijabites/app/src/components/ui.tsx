import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { colors, radius } from "../theme";

export function Button({ title, onPress, loading, disabled, variant = "primary", style }: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: "primary" | "ghost" | "danger"; style?: ViewStyle;
}) {
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off }} onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, variant === "ghost" && s.ghost, variant === "danger" && s.danger, off && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}>
      {loading ? <ActivityIndicator color={variant === "ghost" ? colors.green : "#fff"} /> :
        <Text style={[s.btnText, variant === "ghost" && { color: colors.green }]}>{title}</Text>}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.mute} {...rest} style={[s.input, style]} />
    </View>
  );
}

export const Card = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[s.card, style]}>{children}</View>;
export const ErrorText = ({ children }: { children?: string | null }) => (children ? <Text style={s.err} accessibilityRole="alert">{children}</Text> : null);
export const Center = ({ children }: { children: ReactNode }) => <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>{children}</View>;

export function Chip({ label, active, onPress, disabled }: { label: string; active?: boolean; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={[s.chip, active && s.chipOn, disabled && { opacity: 0.35 }]}>
      <Text style={[s.chipText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { backgroundColor: colors.green, borderRadius: radius, paddingVertical: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", minHeight: 50 },
  ghost: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.green },
  danger: { backgroundColor: colors.danger },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  label: { fontSize: 13, color: colors.mute, marginBottom: 4, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: "#fff", borderRadius: 12, padding: 12, fontSize: 16, color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 14, borderWidth: 1, borderColor: colors.line, marginBottom: 12 },
  err: { color: colors.danger, marginBottom: 10, fontWeight: "600" },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.line, marginRight: 8 },
  chipOn: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { color: colors.ink, fontWeight: "600" },
});
