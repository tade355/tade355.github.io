import { Tabs } from "expo-router";
import { Image, Text, View } from "react-native";
import { BRAND } from "../../theme";
import { colors } from "../../theme";

const icon = (e: string) => () => <Text style={{ fontSize: 20 }}>{e}</Text>;
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.green, headerStyle: { backgroundColor: colors.cream }, headerShadowVisible: false, sceneStyle: { backgroundColor: colors.cream } }}>
      <Tabs.Screen name="index" options={{ title: "Menu", tabBarIcon: icon("🍛"), headerTitle: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Image source={require("../../../assets/logo.png")} style={{ width: 30, height: 30 }} accessibilityIgnoresInvertColors />
          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.ink }}>{BRAND}</Text>
        </View>) }} />
      <Tabs.Screen name="orders" options={{ title: "My orders", tabBarIcon: icon("🧾") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("👤") }} />
    </Tabs>
  );
}
