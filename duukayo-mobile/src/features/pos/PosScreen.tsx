import { useFeedback } from "../../lib/feedback";
import Icon, { type IconName } from "../../components/Icon";
import { productName } from "../../lib/variants";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProductPicture } from "../storefront/ProductPicture";
import { googleConfigured, signInWithGoogle } from "../../lib/google";
import Storage from "expo-sqlite/kv-store";
import { definiteRejection } from "../../lib/order-attempt";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import {
  api,
  ApiError,
  restoreSession,
  signIn,
  signOut,
  subscribeSession,
  verifySession,
} from "../../lib/api";
import {
  Customer,
  Order,
  Product,
  Sale,
  Session,
  money,
  scopeOf,
} from "../../lib/types";
import { database, cacheProducts, cachedProducts } from "../sync/storage";
import {
  enqueue,
  rows,
  synchronize,
  retry,
  QueueRow,
  Payload,
} from "../sync/queue.mjs";
import { onOrderNotification, registerPush } from "../notifications/push";

function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  icon,
}: {
  title: string;
  icon?: IconName;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      {icon && <Icon name={icon} color={secondary ? "#12533b" : "#fff"} />}
      <Text style={[styles.buttonText, secondary && { color: "#12533b" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  numeric = false,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  secret?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? "number-pad" : "default"}
        secureTextEntry={secret}
        autoCapitalize="none"
      />
    </View>
  );
}
const lease = 24 * 60 * 60 * 1000;
const leaseValid = (s: Session) => Date.now() - s.verifiedAt < lease;
export default function PosScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tablet = width >= 800;
  const [session, setSession] = useState<Session | null>(null),
    [selected, setSelected] = useState(0),
    [ready, setReady] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useFeedback("error"),
    [notice, setNotice] = useFeedback("info"),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(false),
    [isSyncing, setIsSyncing] = useState(false);
  const [tab, setTab] = useState("Checkout"),
    [products, setProducts] = useState<Product[]>([]),
    [queue, setQueue] = useState<QueueRow[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [sales, setSales] = useState<Sale[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [cart, setCart] = useState<Record<number, number>>({}),
    [search, setSearch] = useState(""),
    [tendered, setTendered] = useState(""),
    [method, setMethod] = useState("cash"),
    [customer, setCustomer] = useState<number | null>(null),
    [receipt, setReceipt] = useState("");
  const [stockProduct, setStockProduct] = useState<number | null>(null),
    [stockDelta, setStockDelta] = useState(""),
    [reason, setReason] = useState("");
  const saleKey = useRef(Crypto.randomUUID());
  const manualAttempt = useRef<Payload | null>(null);
  const [pendingManual, setPendingManual] = useState<Payload | null>(null);
  const [saleReady, setSaleReady] = useState(false);
  const [reference, setReference] = useState("");
  const [fundsConfirmed, setFundsConfirmed] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [category, setCategory] = useState("");
  type HeldSale = { id: string; cart: Record<number, number>; customer: number | null; discount: string };
  const [held, setHeld] = useState<HeldSale[]>([]);
  const saving = useRef(false);
  const syncing = useRef(false);
  const m = session?.profile.memberships[selected];
  const scope = session && m ? scopeOf(session, m) : "";
  const base = m ? `businesses/${m.business.id}/` : "";
  const currency = m?.business.currency || "UGX";
  const lines = products.filter((p) => cart[p.id]);
  const total = lines.reduce((n, p) => n + p.price * cart[p.id], 0) - Number(discount);
  const manualKey = ["manual-sale", session?.profile.id, m?.business.id, m?.branch].join("-");
  const heldKey = "held-sales-" + scope;
  useEffect(() => {
    let live = true;
    setSaleReady(false); setHeld([]); setPendingManual(null); manualAttempt.current = null; setDiscount("0");
    if (!scope) return;
    void Promise.all([Storage.getItem(heldKey), SecureStore.getItemAsync(manualKey)]).then(([rawHeld, rawManual]) => {
      if (!live) return;
      const drafts = JSON.parse(rawHeld || "[]");
      setHeld(Array.isArray(drafts) ? drafts : []);
      const pending = JSON.parse(rawManual || "null");
      if (pending && !pending.client_id) throw new Error("Saved payment requires review.");
      manualAttempt.current = pending; setPendingManual(pending); setSaleReady(true);
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [scope, heldKey, manualKey, setError]);
  async function holdSale() {
    if (busy || pendingManual || !saleReady || !lines.length) return;
    try {
      if (held.length >= 10) throw new Error("Resume a held sale first.");
      const next = [...held, { id: Crypto.randomUUID(), cart, customer, discount }];
      await Storage.setItem(heldKey, JSON.stringify(next)); setHeld(next);
      setCart({}); setTendered(""); setDiscount("0"); setCustomer(null);
    } catch (e) { setError((e as Error).message); }
  }
  async function resumeSale(draft: HeldSale) {
    if (busy || pendingManual || !saleReady) return;
    if (lines.length) { setError("Hold or clear the current sale before resuming another."); return; }
    try {
      const next = held.filter(d => d.id !== draft.id);
      await Storage.setItem(heldKey, JSON.stringify(next)); setHeld(next);
      setCart(Object.fromEntries(products.filter(p => p.active && Number.isInteger(draft.cart[p.id]) && draft.cart[p.id] > 0).map(p => [p.id, Math.max(0, Math.min(10000, draft.cart[p.id], p.quantity - p.reserved))])));
      setCustomer(customers.some(c => c.id === draft.customer) ? draft.customer : null);
      setDiscount(m?.role === "cashier" ? "0" : draft.discount || "0"); setTendered("");
      setNotice("Held sale restored using current prices and last known stock. Review before payment.");
    } catch (e) { setError((e as Error).message); }
  }
  async function recoverManual() {
    if (!pendingManual || saving.current) return;
    saving.current = true; setBusy(true);
    try {
      const sale = await api<Sale>(base + "sales/", pendingManual);
      setReceipt("Confirmed sale #" + sale.id + "\n" + money(sale.total, sale.currency) + "\nManual payment, not provider-verified");
      await SecureStore.deleteItemAsync(manualKey); setPendingManual(null); manualAttempt.current = null;
      setCart({}); setDiscount("0"); setTendered(""); setReference(""); setFundsConfirmed(false);
      void refreshRef.current();
    } catch (e) {
      if (definiteRejection(e)) { await SecureStore.deleteItemAsync(manualKey); setPendingManual(null); manualAttempt.current = null; }
      setError((e as Error).message);
    } finally { saving.current = false; setBusy(false); }
  }
  const updateQueue = useCallback(async () => {
    if (scope) setQueue(await rows(await database(), scope));
  }, [scope]);
  const refresh = useCallback(async () => {
    if (!scope || !m || syncing.current) return;
    syncing.current = true;
    setIsSyncing(true);
    try {
      const verified = await verifySession();
      if (
        !verified.profile.memberships.some(
          (x) => x.business.id === m.business.id && x.branch === m.branch,
        )
      ) {
        setSession(verified);
        throw new Error("Membership changed. Select an authorized workspace.");
      }
      setSession(verified);
      const db = await database();
      await synchronize(db, scope, (payload) =>
        api<Sale>(base + "sales/", payload),
      );
      const [p, o, s, c] = await Promise.all([
        api<Product[]>(base + "products/"),
        api<Order[]>(base + "orders/"),
        api<Sale[]>(base + "sales/"),
        api<Customer[]>(base + "customers/"),
      ]);
      await cacheProducts(scope, p);
      setProducts(p);
      setOrders(o);
      setSales(s);
      setCustomers(c);
      setOnline(true);
      let device = await SecureStore.getItemAsync("pos-device");
      if (!device) {
        device = Crypto.randomUUID();
        await SecureStore.setItemAsync("pos-device", device);
      }
      const pending = (await rows(db, scope)).filter((r) => !r.response).length;
      await api(base + "devices/", {
        token: `local:${scope}:${device}`,
        pending_sales: pending,
      });
    } catch (e) {
      setOnline(false);
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
        setSession(null);
        setError(
          "Access could not be verified. Sign in again. Pending sales are retained.",
        );
      } else
        setNotice(
          "Offline or server unavailable. Cash sales stay safely on this device.",
        );
    } finally {
      await updateQueue().catch(() => setError("Could not refresh synchronization status."));
      syncing.current = false;
      setIsSyncing(false);
    }
  }, [scope, m, base, updateQueue, setError, setNotice]);
  useEffect(() => {
    let alive = true;
    void restoreSession()
      .then(async (saved) => {
        if (!alive) return;
        if (saved && Date.now() - saved.verifiedAt < lease) {
          setSession(saved);
          setTab(saved.profile.memberships[0]?.role === "cashier" ? "Checkout" : "Overview");
        }
        else if (saved)
          setNotice(
            "Sign in online to renew access. Your pending sales are retained.",
          );
        setReady(true);
      })
      .catch((e) => {
        setError(e.message);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [setError, setNotice]);
  useEffect(() => subscribeSession((next) => { if (!next) { setSession(null); setPassword(""); setCart({}); setReceipt(""); } }), []);
  // Scope changes clear all visible data before reading another user's cache.
  useEffect(() => {
    let active = true;
    setProducts([]);
    setQueue([]);
    setOrders([]);
    setSales([]);
    setCustomers([]);
    setCart({});
    setReceipt("");
    setCustomer(null);
    if (scope) {
      void cachedProducts(scope)
        .then((p) => {
          if (active) setProducts(p);
        })
        .catch((e) => setError(e.message));
      void updateQueue();
    }
    return () => {
      active = false;
    };
  }, [scope, updateQueue, setError]);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    if (!scope) return;
    void refreshRef.current();
    const timer = setInterval(() => void refreshRef.current(), 30000);
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshRef.current();
    });
    const unsubscribe = onOrderNotification(() => void refreshRef.current());
    return () => {
      clearInterval(timer);
      app.remove();
      unsubscribe();
    };
  }, [scope]);
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function changeCart(id: number, delta: number) {
    if (pendingManual || !saleReady || busy) return;
    saleKey.current = Crypto.randomUUID();
    setCart({ ...cart, [id]: Math.max(0, Math.min(10000, (cart[id] || 0) + delta)) });
    setReceipt("");
  }
  async function complete() {
    if (saving.current || !session || !m || pendingManual || !saleReady) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      if (!leaseValid(session))
        throw new Error(
          "Connect and sign in to renew the 24-hour offline access window.",
        );
      if (
        !lines.length ||
        !Number.isSafeInteger(Number(tendered)) ||
        (method === "cash" && Number(tendered) < total)
      )
        throw new Error("Enter sufficient whole-unit cash received.");
      if (!Number.isSafeInteger(Number(discount)) || Number(discount) < 0 || total < 0)
        throw new Error("Enter a valid whole-unit discount.");
      if (method !== "cash" && (!reference.trim() || !fundsConfirmed))
        throw new Error("Enter a payment reference and confirm the received funds.");
      if (lines.some(p => p.cost === null)) throw new Error("A product is missing its purchase cost. Refresh the catalog.");
      const payload: Payload = {
        client_id: saleKey.current,
        branch: m.branch,
        customer,
        method,
        reference: method === "cash" ? "" : reference.trim(),
        tendered: method === "cash" ? Number(tendered) : total,
        offline: method === "cash",
        occurred_at: new Date().toISOString(),
        lines: lines.map((p, index) => ({
          product: p.id,
          quantity: cart[p.id],
          price: p.price,
          cost: p.cost!,
          discount: index === 0 ? Number(discount) : 0,
        })),
      };
      // Persist cash before clearing the cart or showing a completed receipt.
      if (method === "cash") await enqueue(await database(), scope, payload);
      else {
        if (!online)
          throw new Error("Manual mobile-money records require connectivity.");
        if (manualAttempt.current?.client_id !== payload.client_id)
          manualAttempt.current = payload;
        await SecureStore.setItemAsync(manualKey, JSON.stringify(manualAttempt.current));
        setPendingManual(manualAttempt.current);
        try { await api(base + "sales/", manualAttempt.current); }
        catch (e) {
          if (definiteRejection(e)) { await SecureStore.deleteItemAsync(manualKey); setPendingManual(null); manualAttempt.current = null; }
          throw e;
        }
        await SecureStore.deleteItemAsync(manualKey).catch(() => {});
        setPendingManual(null); manualAttempt.current = null;
      }
      setReceipt(
        [
          m.business.name,
          `Receipt ${saleKey.current}`,
          method === "cash"
            ? "Cash received · pending server synchronization"
            : "Manual mobile money · not provider-verified",
          ...lines.map(
            (p) =>
              `${cart[p.id]} × ${productName(p)} — ${money(p.price * cart[p.id], currency)}`,
          ),
          `Total ${money(total, currency)}`,
          `Change ${money(method === "cash" ? Number(tendered) - total : 0, currency)}`,
        ].join("\n"),
      );
      setCart({});
      setDiscount("0"); setReference(""); setFundsConfirmed(false);
      setTendered("");
      saleKey.current = Crypto.randomUUID();
      await updateQueue().catch(() => setError("Sale saved. Queue display could not refresh; do not record it again."));
      void refreshRef.current();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (!ready)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#066449" />
        <Text>Opening DuukaYo…</Text>
      </SafeAreaView>
    );
  if (!session)
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.auth}>
          <Text style={styles.brand}>◈ DuukaYo</Text>
          <Text style={styles.eyebrow}>BY PERPETUAL LABS</Text>
          <Text style={styles.hero}>
            Your shop.{"\n"}A little more in sync.
          </Text>
          <Text style={styles.muted}>
            Sign in online once. Keep cash checkout moving when the connection
            doesn’t.
          </Text>
          {googleConfigured && (
            <Button
              title={busy ? "Signing in…" : "Continue with Google"}
              disabled={busy}
              secondary
              onPress={() =>
                void work(async () => {
                  const nextSession = await signInWithGoogle();
                  if (nextSession) {
                    setSession(nextSession);
                    setTab(nextSession.profile.memberships[0]?.role === "cashier" ? "Checkout" : "Overview");
                    setPassword("");
                    setNotice("");
                    setSelected(0);
                  }
                })
              }
            />
          )}
          <Field label="Username" value={username} onChange={setUsername} />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            secret
          />
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Button
            title={busy ? "Signing in…" : "Open my workspace →"}
            disabled={busy}
            onPress={() =>
              void work(async () => {
                const signedIn = await signIn(username, password);
                setSession(signedIn);
                setTab(signedIn.profile.memberships[0]?.role === "cashier" ? "Checkout" : "Overview");
                setPassword("");
                setNotice("");
                setSelected(0);
              })
            }
          />
          <Button title="Forgot password?" secondary onPress={() => router.push("/recover")} />
          <Text style={styles.muted}>
            Create your business through the web dashboard. Demo:
            kampala-corner-cashier / DemoOnly!2026
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  if (!m)
    return (
      <SafeAreaView style={styles.center}>
        <Text>
          No active membership. Create your business in the web dashboard using
          the same Google account, or contact your business owner.
        </Text>
        <Button
          title="Sign out"
          onPress={() =>
            void work(async () => {
              await signOut();
              setSession(null);
            })
          }
        />
      </SafeAreaView>
    );
  const pending = queue.filter((r) => r.state === "pending").length;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>◈ DuukaYo</Text>
          <Text style={styles.muted}>
            {m.business.name} · {m.role}
          </Text>
        </View>
        <Text style={[styles.badge, !online && styles.amber]}>
          {online ? "Connected" : "Offline"} · {pending} pending
        </Text>
      </View>
      <ScrollView
        horizontal
        style={styles.tabs}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 28 }}
      >
        {[
          "Overview",
          "Checkout",
          "Queue",
          "Orders",
          "Sales",
          ...(m.role !== "cashier" ? ["Stock"] : []),
          "Account",
        ].map((t) => (
          <Button
            key={t}
            icon={({ Overview: "overview", Checkout: "checkout", Queue: "refresh", Orders: "orders", Sales: "sales", Stock: "inventory", Account: "profile" } as Record<string, IconName>)[t]}
            title={t}
            secondary={tab !== t}
            onPress={() => setTab(t)}
          />
        ))}
      </ScrollView>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {tab === "Overview" && <View style={styles.overview}>
          <View style={styles.overviewHero}><Text style={styles.overviewEyebrow}>YOUR WORKSPACE</Text><Text style={styles.overviewTitle}>Ready for what’s next.</Text><Text style={styles.overviewCopy}>{m.business.name}</Text></View>
          <View style={styles.metricGrid}>
            {[{ label: "Pending orders", value: orders.filter(o => o.status === "pending").length, target: "Orders" }, { label: "Waiting to sync", value: pending, target: "Queue" }, { label: "Held sales", value: held.length, target: "Checkout" }, { label: "Active products", value: products.filter(p => p.active).length, target: "Checkout" }].map(metric =>
              <Pressable key={metric.label} accessibilityRole="button" accessibilityLabel={metric.label} onPress={() => setTab(metric.target)} style={styles.metricCard}><Text style={styles.metricValue}>{metric.value}</Text><Text style={styles.muted}>{metric.label} ↗</Text></Pressable>)}
          </View>
          <Text style={styles.small}>{online ? "Showing your latest loaded workspace data." : "Offline · Showing saved data. Reconnect to refresh."}</Text>
          <View style={styles.panel}><Text style={styles.subtitle}>Quick actions</Text><Button title="New sale →" onPress={() => setTab("Checkout")} /><Button title="Review orders" secondary onPress={() => setTab("Orders")} /><Button title="Account settings" secondary onPress={() => router.push("/(tabs)/account")} /></View>
        </View>}
        {tab === "Checkout" && (
          <>
            <View style={styles.checkoutHeading}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>POINT OF SALE</Text><Text style={styles.title}>New sale</Text></View><Text style={styles.badge}>{lines.length} items</Text></View>
            <View style={tablet ? styles.columns : undefined}>
              <View style={{ flex: 1 }}>
                <TextInput
                  accessibilityLabel="Search or scan barcode"
                  style={styles.input}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search or scan barcode ↵"
                  onSubmitEditing={() => {
                    const p = products.find(
                      (p) => p.barcode === search || p.sku === search,
                    );
                    if (p) {
                      changeCart(p.id, 1);
                      setSearch("");
                    }
                  }}
                />
                <View style={styles.grid}>
                  <ScrollView horizontal style={{ width: "100%" }}>
                    <Button title="All categories" secondary={!!category} onPress={() => setCategory("")} />
                    {[...new Set(products.map(p => p.category).filter(Boolean))].map(id => <Button key={id} title={products.find(p => p.category === id)?.category_name || "Other essentials"} secondary={category !== String(id)} onPress={() => setCategory(String(id))} />)}
                  </ScrollView>
                  {products
                    .filter(
                      (p) =>
                        p.active && (!category || String(p.category) === category) &&
                        (productName(p) + " " + p.sku + " " + p.barcode)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map((p, i) => (
                      <Pressable
                        key={p.id}
                        accessibilityRole="button"
                        disabled={busy}
                        style={styles.product}
                        onPress={() => changeCart(p.id, 1)}
                      >
                        <View
                          style={[
                            styles.art,
                            {
                              backgroundColor: [
                                "#e9efdf",
                                "#f4ebd9",
                                "#e8edef",
                                "#f2e5df",
                              ][i % 4],
                            },
                          ]}
                        >
                          <ProductPicture uri={p.image} name={productName(p)} />
                        </View>
                        <Text style={styles.productName}>{productName(p)}</Text>
                        <Text style={styles.price}>
                          {money(p.price, currency)}
                        </Text>
                        <Text style={styles.small}>
                          {p.quantity - p.reserved} last known available
                        </Text>
                      </Pressable>
                    ))}
                </View>
                {!products.length && (
                  <Text style={styles.empty}>
                    Connect and refresh to cache this shop’s catalog.
                  </Text>
                )}
              </View>
              <View style={[styles.panel, tablet && { width: 330 }]}>
                <Text style={styles.subtitle}>Current sale</Text>
                {pendingManual && <View><Text>A manual payment needs confirmation before the next sale.</Text><Button title="Recover payment" disabled={busy} onPress={() => void recoverManual()} /></View>}
                <Button title="Hold sale" secondary disabled={busy || !!pendingManual || !saleReady || !lines.length} onPress={() => void holdSale()} />
                {held.map((draft, i) => <Button key={draft.id} title={"Resume held sale " + (i + 1)} secondary disabled={busy || !!pendingManual || !saleReady} onPress={() => void resumeSale(draft)} />)}
                {lines.length ? (
                  lines.map((p) => (
                    <View style={styles.cartLine} key={p.id}>
                      <View style={{ flex: 1 }}>
                        <Text>{productName(p)}</Text>
                        <Text style={styles.small}>
                          {money(p.price * cart[p.id], currency)}
                        </Text>
                      </View>
                      <Button
                        title="−"
                        secondary
                        disabled={busy || !!pendingManual || !saleReady}
                        onPress={() => changeCart(p.id, -1)}
                      />
                      <Text>{cart[p.id]}</Text>
                      <Button title={"Remove " + productName(p)} secondary disabled={busy || !!pendingManual} onPress={() => changeCart(p.id, -cart[p.id])} />
                      <Button
                        title="+"
                        secondary
                        disabled={busy || !!pendingManual || !saleReady}
                        onPress={() => changeCart(p.id, 1)}
                      />
                    </View>
                  ))
                ) : (
                  <Text style={styles.empty}>Tap a product to begin.</Text>
                )}
                <Text style={styles.label}>Customer</Text>
                <ScrollView horizontal>
                  <Button
                    title="Walk-in"
                    secondary={customer !== null}
                    disabled={busy || !!pendingManual || !saleReady}
                    onPress={() => {
                      setCustomer(null);
                      saleKey.current = Crypto.randomUUID();
                    }}
                  />
                  {customers.map((c) => (
                    <Button
                      key={c.id}
                      title={c.name}
                      disabled={busy || !!pendingManual || !saleReady}
                      secondary={customer !== c.id}
                      onPress={() => {
                        setCustomer(c.id);
                        saleKey.current = Crypto.randomUUID();
                      }}
                    />
                  ))}
                </ScrollView>
                {m.role !== "cashier" && <><Text style={styles.label}>Discount on first line</Text>
                  <TextInput accessibilityLabel="Discount" style={styles.input} keyboardType="number-pad" value={discount} editable={!busy && !pendingManual} onChangeText={value => { setDiscount(value); saleKey.current = Crypto.randomUUID(); }} /></>}
                <Text style={styles.label}>Payment</Text>
                {[
                  ["cash", "Cash · offline capable"],
                  ["manual_mtn", "Manual MTN MoMo"],
                  ["manual_airtel", "Manual Airtel Money"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    title={label}
                    secondary={method !== value}
                    disabled={busy || !!pendingManual || !saleReady || (!online && value !== "cash")}
                    onPress={() => {
                      setMethod(value);
                      saleKey.current = Crypto.randomUUID();
                    }}
                  />
                ))}
                {method !== "cash" && <><Text style={styles.label}>Payment reference</Text>
                  <TextInput accessibilityLabel="Payment reference" style={styles.input} value={reference} editable={!busy && !pendingManual} maxLength={100} onChangeText={setReference} />
                  <Button title={fundsConfirmed ? "✓ Funds checked independently" : "Confirm I checked the funds"} secondary={!fundsConfirmed} disabled={busy || !!pendingManual} onPress={() => setFundsConfirmed(!fundsConfirmed)} /></>}
                {method === "cash" ? (
                  <Field
                    label="Cash received"
                    value={tendered}
                    onChange={(v) => {
                      setTendered(v);
                      saleKey.current = Crypto.randomUUID();
                    }}
                    numeric
                  />
                ) : (
                  <Text style={styles.notice}>
                    Confirm receipt independently. This manual record is not
                    provider-verified.
                  </Text>
                )}
                <Text style={styles.total}>{money(total, currency)}</Text>
                <Text style={styles.muted}>
                  Change:{" "}
                  {money(Math.max(0, Number(tendered) - total), currency)}
                </Text>
                <Button
                  title={busy ? "Saving…" : "Complete sale →"}
                  disabled={busy || !!pendingManual || !saleReady || !lines.length}
                  onPress={() => void complete()}
                />
                <Text style={styles.small}>
                  Cash receipts are saved on this device first. Stock and price
                  conflicts are flagged during upload.
                </Text>
              </View>
            </View>
            {receipt ? (
              <View style={styles.panel}>
                <Text style={styles.subtitle}>Sale saved</Text>
                <Text selectable style={styles.receipt}>
                  {receipt}
                </Text>
                <Button
                  title="Share receipt"
                  onPress={() => void Share.share({ message: receipt })}
                />
              </View>
            ) : null}
          </>
        )}
        {tab === "Queue" && (
          <>
            <Text style={styles.title}>Every sale accounted for.</Text>
            <Button
              title="Synchronize now"
              disabled={busy}
              onPress={() => void work(refresh)}
            />
            <Text style={styles.notice}>
              Pending records survive restarts. Needs-review sales are never
              silently deleted. Contact the owner to resolve conflicts.
            </Text>
            {queue.map((q) => (
              <View key={q.id} style={styles.panel}>
                <Text style={styles.badge}>{q.state}</Text>
                <Text selectable style={styles.small}>
                  {q.id}
                </Text>
                <Text>{new Date(q.created_at).toLocaleString()}</Text>
                {q.error ? <Text style={styles.error}>{q.error}</Text> : null}
                <Button
                  title="Share local sale record"
                  secondary
                  onPress={() =>
                    void Share.share({
                      message: JSON.stringify(
                        {
                          state: q.state,
                          sale: JSON.parse(q.payload),
                          server: q.response ? JSON.parse(q.response) : null,
                        },
                        null,
                        2,
                      ),
                    })
                  }
                />
                {q.state === "needs-review" && !q.response && (
                  <Button
                    title="Retry unchanged upload"
                    onPress={() =>
                      void work(async () => {
                        await retry(await database(), scope, q.id);
                        await refresh();
                      })
                    }
                  />
                )}
              </View>
            ))}
            {!queue.length && (
              <Text style={styles.empty}>No local cash sales yet.</Text>
            )}
          </>
        )}
        {tab === "Orders" && (
          <>
            <Text style={styles.title}>From your online shop.</Text>
            <Button
              title="Refresh orders"
              disabled={busy}
              onPress={() => void work(refresh)}
            />
            {orders.map((o) => (
              <View key={o.id} style={styles.panel}>
                <Text style={styles.badge}>{o.status}</Text>
                <Text style={styles.subtitle}>
                  Order #{o.id} · {o.name}
                </Text>
                <Text>{o.phone}</Text>
                {o.lines.map((l, i) => (
                  <Text key={i}>
                    {l.quantity} × {l.name}
                  </Text>
                ))}
                <Text style={styles.total}>{money(o.total, o.currency)}</Text>
                <Text style={styles.muted}>Payment: {o.payment_state}</Text>
                {m.role !== "cashier" &&
                  !["completed", "cancelled"].includes(o.status) && (
                    <>
                      <Button
                        title={
                          o.status === "ready"
                            ? "Complete · cash received"
                            : {
                                pending: "Accept",
                                accepted: "Start preparing",
                                preparing: "Mark ready",
                              }[o.status] || "Update"
                        }
                        disabled={busy || !online}
                        onPress={() =>
                          void work(async () => {
                            await api(base + `orders/${o.id}/`, {
                              status: {
                                pending: "accepted",
                                accepted: "preparing",
                                preparing: "ready",
                                ready: "completed",
                              }[o.status],
                              method: "cash",
                            });
                            await refresh();
                          })
                        }
                      />
                      <Button
                        title="Cancel order"
                        secondary
                        disabled={busy || !online}
                        onPress={() =>
                          Alert.alert(
                            "Cancel this order?",
                            "Reserved stock will be released.",
                            [
                              { text: "Keep order", style: "cancel" },
                              {
                                text: "Cancel order",
                                onPress: () =>
                                  void work(async () => {
                                    await api(base + `orders/${o.id}/`, {
                                      status: "cancelled",
                                    });
                                    await refresh();
                                  }),
                              },
                            ],
                          )
                        }
                      />
                    </>
                  )}
              </View>
            ))}
            {!orders.length && (
              <Text style={styles.empty}>
                No orders loaded. Refresh while connected.
              </Text>
            )}
          </>
        )}
        {tab === "Sales" && (
          <>
            <Text style={styles.title}>Sales history</Text>
            {sales.map((s) => (
              <View key={s.id} style={styles.panel}>
                <Text style={styles.subtitle}>Receipt #{s.id}</Text>
                <Text style={styles.total}>{money(s.total, s.currency)}</Text>
                <Text>
                  {s.review_reasons.length
                    ? "Needs review: " + s.review_reasons.join(", ")
                    : "Synchronized"}
                </Text>
                <Button
                  title="Share receipt"
                  secondary
                  onPress={() =>
                    void Share.share({
                      message: [
                        m.business.name,
                        `Receipt #${s.id}`,
                        ...s.lines.map((l) => `${l.quantity} × ${l.name}`),
                        money(s.total, s.currency),
                        s.payment.method,
                        `Change ${money(s.payment.change, s.currency)}`,
                      ].join("\n"),
                    })
                  }
                />
              </View>
            ))}
            {!sales.length && (
              <Text style={styles.empty}>
                Connect to load synchronized sales. Local sales are in Queue.
              </Text>
            )}
          </>
        )}
        {tab === "Stock" && (
          <View style={styles.panel}>
            <Text style={styles.title}>Receive stock</Text>
            <Text style={styles.muted}>
              Connected stock receipts. Use the dashboard for opening stock and
              adjustments.
            </Text>
            {products.map((p) => (
              <Button
                key={p.id}
                title={productName(p)}
                secondary={stockProduct !== p.id}
                onPress={() => setStockProduct(p.id)}
              />
            ))}
            <Field
              label="Quantity received"
              numeric
              value={stockDelta}
              onChange={setStockDelta}
            />
            <Field
              label="Reason / supplier"
              value={reason}
              onChange={setReason}
            />
            <Button
              title="Record receipt"
              disabled={busy || !online || !stockProduct}
              onPress={() =>
                void work(async () => {
                  await api(base + "stock/", {
                    client_id: Crypto.randomUUID(),
                    product: stockProduct,
                    delta: Number(stockDelta),
                    kind: "receipt",
                    reason,
                  });
                  setStockDelta("");
                  setReason("");
                  await refresh();
                })
              }
            />
          </View>
        )}
        {tab === "Account" && (
          <View style={styles.panel}>
            <Text style={styles.title}>{session.profile.username}</Text>
            <Text style={styles.muted}>
              Offline access is renewed by online membership verification and
              lasts up to 24 hours.
            </Text>
            {session.profile.memberships.map((member, i) => (
              <Button
                key={member.business.id}
                title={member.business.name}
                secondary={selected !== i}
                disabled={busy || isSyncing}
                onPress={() => {
                  setSelected(i);
                  setTab("Checkout");
                }}
              />
            ))}
            <Button
              title="Enable order notifications"
              secondary
              onPress={() =>
                void work(async () =>
                  setNotice(await registerPush(m.business.id)),
                )
              }
            />
            <Text style={styles.small}>
              Development fallback: refresh orders. No notification payload is
              trusted as order detail.
            </Text>
            <Button
              title="Sign out"
              secondary
              disabled={busy || isSyncing}
              onPress={() =>
                Alert.alert(
                  "Sign out?",
                  "Pending sales stay on this device and can be uploaded when this account signs in again.",
                  [
                    { text: "Stay", style: "cancel" },
                    {
                      text: "Sign out",
                      onPress: () =>
                        void work(async () => {
                          await signOut();
                          setSession(null);
                          setProducts([]);
                          setQueue([]);
                          setReceipt("");
                        }),
                    },
                  ],
                )
              }
            />
          </View>
        )}
        <Text style={styles.footer}>DuukaYo · BY PERPETUAL LABS</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f6f0" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20 },
  auth: {
    padding: 30,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
    gap: 16,
  },
  brand: { fontSize: 23, fontWeight: "700", color: "#173e2e" },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: "#527762" },
  hero: {
    fontSize: 44,
    fontWeight: "600",
    color: "#163d2c",
    lineHeight: 48,
    marginVertical: 24,
  },
  muted: { color: "#637568", fontSize: 13, lineHeight: 20 },
  field: { gap: 8, marginVertical: 10 },
  label: { fontSize: 12, fontWeight: "600", color: "#345a45", marginTop: 8 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccd8ca",
    borderRadius: 9,
    padding: 14,
    minHeight: 50,
    color: "#153b2d",
  },
  button: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#086447",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 4,
  },
  secondary: { backgroundColor: "#e6eee2" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  error: {
    backgroundColor: "#ffede6",
    padding: 15,
    color: "#993718",
    borderRadius: 8,
    marginVertical: 8,
  },
  notice: {
    backgroundColor: "#efefda",
    color: "#5b623d",
    padding: 15,
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    marginVertical: 10,
  },
  header: {
    padding: 20,
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderColor: "#e0e5db",
    flexWrap: "wrap",
  },
  badge: {
    backgroundColor: "#e1eddd",
    color: "#2a6442",
    padding: 8,
    borderRadius: 5,
    fontSize: 11,
    alignSelf: "flex-start",
  },
  amber: { backgroundColor: "#faebce", color: "#835b15" },
  tabs: {
    flexGrow: 0,
    maxHeight: 68,
    paddingHorizontal: 18,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  content: { padding: 18, paddingBottom: 50, maxWidth: 1400, width: "100%", alignSelf: "center" },
  checkoutHeading: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  overview: { gap: 16, paddingTop: 14 },
  overviewHero: { padding: 24, gap: 10, backgroundColor: "#234f39", borderRadius: 24 },
  overviewEyebrow: { fontSize: 10, color: "#c9dbad", letterSpacing: 1.5 },
  overviewTitle: { fontSize: 30, fontWeight: "700", color: "#fffdf2" },
  overviewCopy: { fontSize: 14, color: "#d2e0c9" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: { flexBasis: "46%", flexGrow: 1, padding: 20, gap: 8, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: "#e0e6d7" },
  metricValue: { fontSize: 30, fontWeight: "700", color: "#24543b" },
  title: {
    fontSize: 28,
    color: "#173f2d",
    fontWeight: "600",
    marginVertical: 18,
  },
  columns: { flexDirection: "row", gap: 22, alignItems: "flex-start" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginVertical: 18 },
  product: {
    width: "47%",
    minWidth: 140,
    flexGrow: 1,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e0e5d9",
    padding: 14,
    gap: 9,
  },
  art: {
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  glyph: { fontSize: 46, color: "#72916e" },
  productName: { fontSize: 14, fontWeight: "600", color: "#27432f" },
  price: { color: "#125738", fontSize: 15, fontWeight: "500" },
  small: { fontSize: 11, color: "#687a6c", lineHeight: 17 },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e5db",
    padding: 20,
    marginVertical: 10,
    gap: 12,
  },
  subtitle: { fontSize: 19, fontWeight: "600", color: "#234331" },
  cartLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#e6eadf",
  },
  total: { fontSize: 29, fontWeight: "700", color: "#15432d", marginTop: 16 },
  empty: { padding: 30, color: "#718071", textAlign: "center", lineHeight: 22 },
  receipt: { fontFamily: "monospace", lineHeight: 23, fontSize: 12 },
  footer: {
    textAlign: "center",
    fontSize: 9,
    letterSpacing: 2,
    color: "#748575",
    marginTop: 40,
  },
});
