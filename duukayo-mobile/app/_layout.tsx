import Toasts from "../src/components/Toasts";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CustomerProvider } from "../src/features/storefront/CustomerProvider";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <CustomerProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="pos"
            options={{
              headerShown: true,
              title: "Business tools",
              headerBackTitle: "Shop",
            }}
          />
        </Stack>
      </CustomerProvider>
      <Toasts />
    </SafeAreaProvider>
  );
}
