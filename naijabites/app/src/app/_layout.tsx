import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../lib/auth";
import { CartProvider } from "../lib/cart";
import { registerForPush } from "../lib/push";
import { colors } from "../theme";

function Gate() {
  const { user, ready } = useAuth();

  useEffect(() => { if (user && user.id !== "cached") registerForPush(); }, [user?.id]);
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.content.data?.orderId;
      if (typeof id === "string") router.push(`/order/${id}`);
    });
    return () => sub.remove();
  }, []);

  if (!ready) return <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.cream }}><ActivityIndicator color={colors.green} size="large" /></View>;
  return (
    <Stack screenOptions={{ headerTintColor: colors.green, contentStyle: { backgroundColor: colors.cream }, headerShadowVisible: false }}>
      <Stack.Protected guard={!user}><Stack.Screen name="login" options={{ headerShown: false }} /></Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="cart" options={{ title: "Your cart", presentation: "modal" }} />
        <Stack.Screen name="checkout" options={{ title: "Pickup & pay" }} />
        <Stack.Screen name="order/[id]" options={{ title: "Order" }} />
        <Stack.Screen name="order/report" options={{ title: "Report a problem" }} />
        <Stack.Screen name="payment-complete" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function Root() {
  return (
    <AuthProvider><CartProvider><StatusBar style="dark" /><Gate /></CartProvider></AuthProvider>
  );
}
