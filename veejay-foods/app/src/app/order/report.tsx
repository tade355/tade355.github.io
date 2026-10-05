import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Image, ScrollView, Text, View } from "react-native";
import { Button, Chip, ErrorText, Input } from "../../components/ui";
import { api } from "../../lib/api";
import { colors } from "../../theme";

const REASONS = ["Wrong item", "Missing item", "Food quality", "Other"];

export default function Report() {
  const { id, code } = useLocalSearchParams<{ id: string; code?: string }>();
  const [reason, setReason] = useState(REASONS[0]);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission needed", "Allow access in Settings to attach a photo.");
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6, allowsEditing: false };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled) setPhoto(r.assets[0]);
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("orderId", String(id)); fd.append("reason", reason); fd.append("description", description);
      if (photo) fd.append("photo", { uri: photo.uri, name: photo.fileName ?? "photo.jpg", type: photo.mimeType ?? "image/jpeg" } as any);
      await api("/complaints", { method: "POST", body: fd });
      Alert.alert("Thanks — we're on it", "We'll review your report and refund you to your original payment method if it's approved.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: colors.mute, marginBottom: 12 }}>Order #{code}. Tell us what went wrong and add a photo if you can.</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8, marginBottom: 12 }}>{REASONS.map((r) => <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}</View>
      <Input label="Details" value={description} onChangeText={setDescription} multiline numberOfLines={4} maxLength={1000} placeholder="e.g. I ordered chicken shawarma but got beef" style={{ minHeight: 90, textAlignVertical: "top" }} />
      {photo ? <Image source={{ uri: photo.uri }} style={{ width: "100%", height: 200, borderRadius: 12, marginBottom: 12 }} accessibilityIgnoresInvertColors /> : null}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
        <Button title="📷 Take photo" variant="ghost" onPress={() => pick(true)} style={{ flex: 1 }} />
        <Button title="🖼️ Gallery" variant="ghost" onPress={() => pick(false)} style={{ flex: 1 }} />
      </View>
      <ErrorText>{err}</ErrorText>
      <Button title="Submit report" onPress={submit} loading={busy} />
    </ScrollView>
  );
}
