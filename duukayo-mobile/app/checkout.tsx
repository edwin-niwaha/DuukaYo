import { useFeedback } from "../src/lib/feedback";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { publicApi } from "../src/lib/api";
import { money } from "../src/lib/types";
import { definiteRejection } from "../src/lib/order-attempt";
import { useCustomer } from "../src/features/storefront/CustomerProvider";
type Cart = { id: number; token: string };
type Quote = {
  id: number;
  total: number;
  currency: string;
  expires_at: string;
  groups: {
    shop: string;
    total: number;
    delivery_fee: number;
    lines: { product: number; name: string; quantity: number; price: number }[];
  }[];
};
type Attempt = {
  cart: Cart;
  body: { client_id: string; quote: number };
  carts: Record<string, string>;
};
type Result = {
  total: number;
  currency: string;
  orders: { id: number; token: string; shop: string }[];
};
const pendingKey = "marketplace-checkout-pending";
function Button({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
export default function MarketplaceCheckoutScreen() {
  const router = useRouter();
  const { carts, ready, clearCart, rememberOrder } = useCustomer();
  const [cart, setCart] = useState<Cart | null>(null),
    [quote, setQuote] = useState<Quote | null>(null),
    [pending, setPending] = useState<Attempt | null>(null),
    [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState(""),
    [delivery, setDelivery] = useState(false);
  const [busy, setBusy] = useState(false),
    [restored, setRestored] = useState(false),
    [error, setError] = useFeedback("error");
  const running = useRef(false);
  useEffect(() => {
    void SecureStore.getItemAsync(pendingKey)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw);
          if (!saved.carts && saved.bags) { saved.carts = saved.bags; delete saved.bags; }
          setPending(saved);
        }
        setRestored(true);
      })
      .catch(() =>
        setError(
          "Saved checkout could not be read. Resolve it before placing another order.",
        ),
      );
  }, [setError]);
  async function review() {
    if (running.current || pending || !ready || !restored) return;
    running.current = true;
    setBusy(true);
    setError("");
    setQuote(null);
    try {
      if (!carts.length)
        throw new Error("Add items from a shop before checkout.");
      const next = cart || (await publicApi<Cart>("carts/", {}));
      setCart(next);
      const headers = { "X-Cart-Token": next.token };
      await publicApi(
        `carts/${next.id}/`,
        {
          lines: carts.flatMap((b) =>
            b.items.map((p) => ({ product: p.id, quantity: p.quantity })),
          ),
        },
        "PUT",
        headers,
      );
      setQuote(
        await publicApi<Quote>(
          `carts/${next.id}/quotes/`,
          { name, phone, address, delivery },
          "POST",
          headers,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function complete() {
    if (running.current || (!pending && (!quote || !cart))) return;
    running.current = true;
    setBusy(true);
    setError("");
    const attempt = pending || {
      cart: cart!,
      body: { client_id: Crypto.randomUUID(), quote: quote!.id },
      carts: Object.fromEntries(
        carts.map((b) => [
          b.slug,
          JSON.stringify(b.items.map((p) => [p.id, p.quantity])),
        ]),
      ),
    };
    try {
      await SecureStore.setItemAsync(pendingKey, JSON.stringify(attempt));
      setPending(attempt);
      const confirmed = await publicApi<Result>(
        `carts/${attempt.cart.id}/checkout/`,
        attempt.body,
        "POST",
        { "X-Cart-Token": attempt.cart.token },
      );
      setResult(confirmed);
      for (const order of confirmed.orders) await rememberOrder(order.token);
      for (const cart of carts)
        if (
          attempt.carts[cart.slug] ===
          JSON.stringify(cart.items.map((p) => [p.id, p.quantity]))
        )
          clearCart(cart.slug);
      await SecureStore.deleteItemAsync(pendingKey);
      setPending(null);
      setQuote(null);
    } catch (e) {
      if (
        definiteRejection(e) &&
        ![401, 403, 404].includes((e as { status: number }).status)
      ) {
        await SecureStore.deleteItemAsync(pendingKey);
        setPending(null);
        setQuote(null);
      }
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const locked = busy || !!pending || !restored;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button
          title="Back to carts"
          onPress={() => router.back()}
          disabled={busy}
        />
        <Text style={styles.title}>All your favourites. One checkout.</Text>
        <Text>
          Each shop confirms its order. Arrange payment at fulfilment.
        </Text>
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        {busy && <ActivityIndicator />}
        {result ? (
          <View style={styles.card}>
            <Text style={styles.heading}>Your orders are with the shops</Text>
            <Text>{money(result.total, result.currency)}</Text>
            {result.orders.map((o) => (
              <Button
                key={o.id}
                title={`Track ${o.shop} · #${o.id}`}
                onPress={() =>
                  router.push({
                    pathname: "/order/[token]",
                    params: { token: o.token },
                  })
                }
              />
            ))}
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text>Your name</Text>
              <TextInput
                accessibilityLabel="Customer name"
                style={styles.input}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setQuote(null);
                }}
                editable={!locked}
                maxLength={100}
              />
              <Text>Phone number</Text>
              <TextInput
                accessibilityLabel="Phone number"
                style={styles.input}
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  setQuote(null);
                }}
                editable={!locked}
                keyboardType="phone-pad"
                maxLength={25}
              />
              <Text>Delivery from every shop</Text>
              <Switch
                accessibilityLabel="Delivery from every shop"
                value={delivery}
                onValueChange={(v) => {
                  setDelivery(v);
                  setQuote(null);
                }}
                disabled={locked}
              />
              {delivery && (
                <TextInput
                  accessibilityLabel="Delivery address"
                  placeholder="Delivery address"
                  style={styles.input}
                  value={address}
                  onChangeText={(v) => {
                    setAddress(v);
                    setQuote(null);
                  }}
                  editable={!locked}
                  maxLength={250}
                />
              )}
              <Button
                title="Review prices & availability"
                onPress={() => void review()}
                disabled={locked || !ready || !name.trim() || !phone.trim()}
              />
            </View>
            {quote && (
              <View style={styles.card}>
                {quote.groups.map((g) => (
                  <View key={g.shop} style={{ gap: 8 }}>
                    <Text style={styles.heading}>{g.shop}</Text>
                    {g.lines.map((l) => (
                      <Text key={l.product}>
                        {l.quantity} × {l.name} ·{" "}
                        {money(l.quantity * l.price, quote.currency)}
                      </Text>
                    ))}
                    <Text>
                      Delivery {money(g.delivery_fee, quote.currency)}
                    </Text>
                  </View>
                ))}
                <Text style={styles.heading}>
                  Total {money(quote.total, quote.currency)}
                </Text>
                <Text>
                  Quote valid until{" "}
                  {new Date(quote.expires_at).toLocaleTimeString()}.
                </Text>
              </View>
            )}
            {(quote || pending) && (
              <Button
                title={
                  pending ? "Recover pending checkout" : "Place all orders"
                }
                onPress={() => void complete()}
                disabled={busy}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ef" },
  content: { padding: 20, gap: 18 },
  title: { fontSize: 28, fontWeight: "800", color: "#203d2c" },
  heading: { fontSize: 20, fontWeight: "700", color: "#203d2c" },
  card: { backgroundColor: "white", padding: 20, borderRadius: 20, gap: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#c4d0c0",
    borderRadius: 12,
    padding: 14,
  },
  button: { backgroundColor: "#24543b", padding: 15, borderRadius: 12 },
  buttonText: { color: "white", fontWeight: "700", textAlign: "center" },
  error: { color: "#a32929" },
});
