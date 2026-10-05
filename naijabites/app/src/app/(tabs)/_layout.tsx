import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../theme";

const icon = (e: string) => () => <Text style={{ fontSize: 20 }}>{e}</Text>;
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.green, headerStyle: { backgroundColor: colors.cream }, headerShadowVisible: false, sceneStyle: { backgroundColor: colors.cream } }}>
      <Tabs.Screen name="index" options={{ title: "Menu", tabBarIcon: icon("🍛") }} />
      <Tabs.Screen name="orders" options={{ title: "My orders", tabBarIcon: icon("🧾") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("👤") }} />
    </Tabs>
  );
}
