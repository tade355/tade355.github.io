import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, ErrorText, Input } from "../components/ui";
import { useAuth } from "../lib/auth";
import { BRAND, colors } from "../theme";

export default function Login() {
  const { requestOtp, verifyOtp } = useAuth();
  const [phone, setPhone] = useState(""); const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const send = async () => {
    setBusy(true); setErr(null);
    try { await requestOtp(phone); setStep("code"); setWait(30); }
    catch (e: any) { setErr(e.message ?? "Couldn't send the code. Check your connection."); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr(null);
    try { await verifyOtp(phone, code); } // success flips the auth guard; no manual navigation needed
    catch (e: any) { setErr(e.message ?? "Couldn't verify. Check your connection."); setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.green }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>🍛</Text>
        <Text style={s.brand}>{BRAND}</Text>
        <Text style={s.tag}>Order ahead. Skip the queue.</Text>
        <View style={s.card}>
          {step === "phone" ? (
            <>
              <Input label="Phone number" placeholder="0803 123 4567" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" value={phone} onChangeText={setPhone} />
              <ErrorText>{err}</ErrorText>
              <Button title="Send code" onPress={send} loading={busy} disabled={phone.replace(/\D/g, "").length < 10} />
            </>
          ) : (
            <>
              <Text style={s.help}>We sent a 6-digit code by SMS to {phone}.</Text>
              <Input label="Code" placeholder="123456" keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" textContentType="oneTimeCode" value={code} onChangeText={setCode} />
              <ErrorText>{err}</ErrorText>
              <Button title="Verify & continue" onPress={verify} loading={busy} disabled={code.length !== 6} />
              <Button title={wait > 0 ? `Resend code in ${wait}s` : "Resend code"} variant="ghost" onPress={send} disabled={wait > 0 || busy} style={{ marginTop: 10 }} />
              <Button title="Change number" variant="ghost" onPress={() => { setStep("phone"); setCode(""); setErr(null); }} style={{ marginTop: 10, borderWidth: 0 }} />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logo: { fontSize: 56, textAlign: "center" },
  brand: { color: "#fff", fontSize: 30, fontWeight: "800", textAlign: "center" },
  tag: { color: colors.saffron, textAlign: "center", marginBottom: 28, fontWeight: "600" },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 18 },
  help: { color: colors.mute, marginBottom: 12 },
});
