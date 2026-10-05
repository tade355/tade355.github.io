import { useEffect, useState } from "react";
import { Alert, ScrollView, Text } from "react-native";
import { Button, Card, ErrorText, Input } from "../../components/ui";
import { api, patch } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { Order } from "../../lib/types";
import { isActive } from "../../lib/status";
import { colors } from "../../theme";

export default function Account() {
  const { user, logout, offline } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setName(user?.name ?? ""), [user?.name]);

  const save = async () => { try { await patch("/me", { name }); setMsg("Saved ✓"); } catch (e: any) { setMsg(e.message); } };
  const confirmLogout = async () => {
    let active = false;
    try { active = (await api<Order[]>("/orders")).some((o) => isActive(o.status)); } catch { /* ignore */ }
    Alert.alert("Sign out?", active ? "You have an order in progress. You'll need your phone code to see your pickup QR again." : "You'll need a new code to sign back in.", [
      { text: "Stay signed in", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: logout },
    ]);
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {offline ? <ErrorText>You're offline. We'll reconnect automatically — you're still signed in.</ErrorText> : null}
      <Card>
        <Text style={{ color: colors.mute }}>Phone</Text>
        <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 12 }}>{user?.phone || "—"}</Text>
        <Input label="Your name" value={name} onChangeText={setName} placeholder="So we can call out your order" autoComplete="name" />
        <Button title="Save" onPress={save} />
        {msg ? <Text style={{ marginTop: 8, color: colors.mute }}>{msg}</Text> : null}
      </Card>
      <Button title="Sign out" variant="ghost" onPress={confirmLogout} />
    </ScrollView>
  );
}
