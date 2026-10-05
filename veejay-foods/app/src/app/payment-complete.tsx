import { Redirect } from "expo-router";
// Deep link target (veejay://payment-complete) if the OS opens the app instead of the in-app browser closing.
export default function PaymentComplete() { return <Redirect href="/(tabs)/orders" />; }
