import { useFeedback } from "../../lib/feedback";
import Icon from "../../components/Icon";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { publicApi } from "../../lib/api";
import { money } from "../../lib/types";
import { productName } from "../../lib/variants";
import type { GuestOrder } from "../../lib/storefront";
import { useCustomer } from "./CustomerProvider";
import { ShopHome } from "./ShopScreens";

export function ShopsTab() {
  return <ShopHome browse />;
}
function Action({
  title,
  onPress,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.action, secondary && s.secondary]}
    >
      <Text style={[s.actionText, secondary && { color: "#28533a" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Heading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
}) {
  return (
    <View style={s.heading}>
      {eyebrow && <Text style={s.eyebrow}>{eyebrow}</Text>}
      <Text style={s.title}>{title}</Text>
      {detail && <Text style={s.muted}>{detail}</Text>}
    </View>
  );
}
export function CartTab() {
  const router = useRouter();
  const { carts, ready, clearCart } = useCustomer();
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Heading
          title="Cart"
        />
        {!ready && <ActivityIndicator />}
        {ready && !carts.length && (
          <View style={s.empty}>
            <Icon name="cart" size={40} />
            <Text style={s.subtitle}>Your cart is empty</Text>
            <Text style={s.muted}>
              Add products from a shop.
            </Text>
            <Action
              title="Explore shops →"
              onPress={() => router.navigate("/(tabs)/shops")}
            />
          </View>
        )}
        {ready && carts.length > 0 && <Action title="Checkout →" onPress={() => router.push("/checkout")} />}
        {carts.map((cart) => (
          <View key={cart.slug} style={s.card}>
            <View style={s.row}>
              <Text style={s.subtitle}>{cart.name}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${cart.name} cart`}
                onPress={() =>
                  Alert.alert(
                    "Remove this cart?",
                    "Your selected items will be removed.",
                    [
                      { text: "Keep cart", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => clearCart(cart.slug),
                      },
                    ],
                  )
                }
              >
                <Text style={s.remove}>Remove</Text>
              </Pressable>
            </View>
            {cart.items.map((p) => (
              <View key={p.id} style={s.line}>
                <Text style={{ flex: 1, color: "#47603e" }}>
                  {p.quantity} × {productName(p)}
                </Text>
                <Text>{money(p.price * p.quantity, cart.currency)}</Text>
              </View>
            ))}
            <View style={s.row}>
              <Text style={s.muted}>Items subtotal</Text>
              <Text style={s.subtitle}>
                {money(
                  cart.items.reduce((n, p) => n + p.price * p.quantity, 0),
                  cart.currency,
                )}
              </Text>
            </View>
            <Action
              title="Review & checkout →"
              onPress={() =>
                router.push({
                  pathname: "/shop/[slug]",
                  params: { slug: cart.slug, checkout: "1" },
                })
              }
            />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
export function OrdersTab({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { tokens, ready } = useCustomer();
  const [orders, setOrders] = useState<
    { token: string; order: GuestOrder | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useFeedback("error");
  useFocusEffect(
    useCallback(() => {
      let live = true;
      async function load() {
        if (!ready) return;
        setLoading(true);
        const results = await Promise.allSettled(
          tokens.map((token) =>
            publicApi<GuestOrder>(`guest-orders/${encodeURIComponent(token)}/`),
          ),
        );
        if (live) {
          setOrders(
            results.map((result, i) => ({
              token: tokens[i],
              order: result.status === "fulfilled" ? result.value : null,
            })),
          );
          setError(
            results.some((r) => r.status === "rejected")
              ? "Some orders could not be refreshed. Open an order to retry."
              : "",
          );
          setLoading(false);
        }
      }
      void load();
      const timer = setInterval(load, 15000);
      return () => {
        live = false;
        clearInterval(timer);
      };
    }, [tokens, ready, setError]),
  );
  const content = (
    <View style={{ gap: 16 }}>
        {embedded ? <View style={{ gap: 8 }}><Text accessibilityRole="header" style={s.subtitle}>My orders</Text><Text style={s.muted}>Track orders saved on this device.</Text></View> : <Heading
          title="Orders"
        />}
        {loading && <ActivityIndicator color="#28533a" />}
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
        {ready && !tokens.length && (
          <View style={s.empty}>
            <Icon name="orders" size={40} />
            <Text style={s.subtitle}>Your next favourite is waiting.</Text>
            <Text style={s.muted}>
              Orders you place on this device will appear here.
            </Text>
            <Action
              title="Find a shop →"
              onPress={() => router.navigate("/(tabs)/shops")}
            />
          </View>
        )}
        {orders.map(({ token, order }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              order
                ? `Track order ${order.id} from ${order.shop}`
                : "Retry order status"
            }
            key={token}
            style={s.card}
            onPress={() =>
              router.push({ pathname: "/order/[token]", params: { token } })
            }
          >
            <View style={s.row}>
              <Text style={s.subtitle}>
                {order?.shop || "Order status unavailable"}
              </Text>
              <Text style={s.badge}>{order?.status || "Retry"}</Text>
            </View>
            {order && (
              <>
                <Text style={s.muted}>
                  Order #{order.id} · {order.delivery ? "Delivery" : "Pickup"}
                </Text>
                <Text style={s.muted}>
                  {order.lines
                    .map((line) => `${line.quantity} × ${line.name}`)
                    .join(", ")}
                </Text>
                <View style={s.row}>
                  <Text style={s.subtitle}>
                    {money(order.total, order.currency)}
                  </Text>
                  <Text style={s.link}>Track order →</Text>
                </View>
              </>
            )}
          </Pressable>
        ))}
    </View>
  );
  return embedded ? content : <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>{content}</ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f8f2" },
  content: { padding: 22, paddingBottom: 120, gap: 20 },
  heading: { gap: 6, paddingTop: 0, paddingBottom: 0 },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: "800",
    color: "#6f855b",
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1,
    color: "#234c34",
  },
  subtitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#2c4c37",
    flexShrink: 1,
  },
  muted: { color: "#75816c", fontSize: 13, lineHeight: 21 },
  card: {
    padding: 22,
    gap: 17,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e8da",
    borderRadius: 22,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  line: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#eff1e8",
  },
  action: {
    padding: 16,
    alignItems: "center",
    backgroundColor: "#29553a",
    borderRadius: 18,
  },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  secondary: { backgroundColor: "#eaf0df" },
  empty: {
    alignItems: "center",
    gap: 20,
    padding: 28,
    backgroundColor: "#fff",
    borderRadius: 24,
  },
  emptyIcon: { fontSize: 65, color: "#9cac7a" },
  remove: { color: "#9c5a45", fontSize: 11, padding: 10 },
  badge: {
    borderRadius: 12,
    backgroundColor: "#eaf0df",
    padding: 8,
    color: "#506b40",
    fontSize: 10,
    textTransform: "capitalize",
  },
  link: { color: "#456c3e", fontSize: 12, fontWeight: "700" },
  error: {
    padding: 16,
    backgroundColor: "#fff0e9",
    color: "#a64930",
    borderRadius: 12,
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    backgroundColor: "#e9f0de",
    borderRadius: 25,
    padding: 24,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: "#28543a",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 25, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 15 },
  stat: {
    flex: 1,
    padding: 24,
    backgroundColor: "#fff",
    borderRadius: 20,
    gap: 6,
  },
  statValue: { fontSize: 29, fontWeight: "700", color: "#315739" },
  logout: {
    alignItems: "center",
    backgroundColor: "#fff0e9",
    padding: 16,
    borderRadius: 17,
  },
  logoutText: { color: "#a04933", fontWeight: "700" },
});
