import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { api } from "../../lib/api";
export async function registerPush(business: number) {
  if (!Device.isDevice) return "Development fallback: refresh orders manually.";
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Shop orders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    return "Notifications disabled; refresh orders manually.";
  const token = await Notifications.getDevicePushTokenAsync();
  await api(`businesses/${business}/devices/`, {
    token: String(token.data),
    pending_sales: 0,
  });
  return "Device registered. Live delivery requires server FCM credentials and a development build.";
}
export function onOrderNotification(refresh: () => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    () => refresh(),
  );
  return () => subscription.remove();
}
