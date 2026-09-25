import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCustomer } from "../../src/features/storefront/CustomerProvider";
import Icon, { type IconName } from "../../src/components/Icon";
const icons: Record<string, IconName> = { home: "home", categories: "overview", cart: "cart", wishlist: "heart", account: "profile" };
export default function CustomerTabs() {
  const insets = useSafeAreaInsets();
  const { carts } = useCustomer();
  const count = carts.reduce(
    (n, b) => n + b.items.reduce((n, p) => n + p.quantity, 0),
    0,
  );
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "#7b8975",
        tabBarActiveBackgroundColor: "#24543b",
        tabBarStyle: [styles.bar, { bottom: Math.max(insets.bottom, 12) }],
        tabBarItemStyle: styles.item,
        tabBarLabelStyle: styles.label,
      }}
    >
      {(
        [
          ["home", "Home"],
          ["categories", "Categories"],
          ["cart", "Cart"],
          ["wishlist", "Wishlist"],
          ["account", "Accounts"],
        ] as const
      ).map(([name, title]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.icon, focused && styles.active]}>
                <Icon name={icons[name]} color={color} size={23} />
                {name === "cart" && count > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text></View>}
              </View>
            ),
          }}
        />
      ))}
      <Tabs.Screen name="shops" options={{ href: null }} />
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    marginHorizontal: 16,
    height: 72,
    paddingTop: 7,
    paddingBottom: 7,
    paddingHorizontal: 5,
    borderRadius: 24,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: "#e4e9dc",
    backgroundColor: "#fff",
    shadowColor: "#193c30",
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: { borderRadius: 18, marginHorizontal: 2 },
  label: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  icon: {
    width: 36,
    height: 29,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  active: { backgroundColor: "#ffffff18" },
  badge: {
    position: "absolute",
    right: -7,
    top: -5,
    borderRadius: 10,
    backgroundColor: "#df9b40",
    paddingHorizontal: 4,
    minWidth: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
});
