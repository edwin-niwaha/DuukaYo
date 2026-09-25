import { useFeedback } from "../../lib/feedback";
import Icon from "../../components/Icon";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { ProductPicture } from "./ProductPicture";
import { groupProducts, productName, variantLabel, variantsFor } from "../../lib/variants";
import ProductShowcase from "./ProductShowcase";
import { OrderAttempt, parseAttempt, createOrderAttempt, definiteRejection } from "../../lib/order-attempt";
import { useCustomer } from "./CustomerProvider";
import { publicApi } from "../../lib/api";
import { money } from "../../lib/types";
import {
  ShowcaseProduct,
  GuestOrder,
  ShopCatalog,
  ShopSummary,
  orderMessages,
  orderSteps,
} from "../../lib/storefront";

function Button({
  title,
  onPress,
  disabled,
  light = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  light?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, light && s.lightButton, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.buttonText, light && { color: "#244d35" }]}>{title}</Text>
    </Pressable>
  );
}
const Picture = ProductPicture;
function Header({ back = false }: { back?: boolean }) {
  const router = useRouter();
  return (
    <View style={s.header}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to shops"
          onPress={() => router.replace("/(tabs)/shops")}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="left" /><Text style={s.link}>Shops</Text></View>
        </Pressable>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="catalog" /><Text style={s.brand}>DuukaYo</Text></View>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate("/(tabs)/account")}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={s.link}>Account</Text><Icon name="profile" /></View>
      </Pressable>
    </View>
  );
}
function ErrorBox({ text, retry }: { text: string; retry?: () => void }) {
  return text ? (
    <View accessibilityRole="alert" style={s.error}>
      <Text style={s.errorText}>{text}</Text>
      {retry && <Button title="Try again" onPress={retry} light />}
    </View>
  ) : null;
}
export function ShopHome({ browse = false }: { browse?: boolean } = {}) {
  const router = useRouter();
  const [featured, setFeatured] = useState<ShowcaseProduct[]>([]);
  const [featuredError, setFeaturedError] = useState("");
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredRetry, setFeaturedRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let live = true;
    if (featuredRetry) setFeaturedLoading(true);
    const refresh = () => { if (AppState.currentState === "active") void publicApi<{ products: ShowcaseProduct[] }>("featured-products/").then(data => { if (live) { setFeatured(data.products || []); setFeaturedError(""); } }).catch(() => { if (live) setFeaturedError("Product images could not load. Please try again."); }).finally(() => { if (live) setFeaturedLoading(false); }); };
    refresh(); const timer = setInterval(refresh, 30000); const app = AppState.addEventListener("change", refresh);
    return () => { live = false; clearInterval(timer); app.remove(); };
  }, [featuredRetry]));
  const [heroVisible, setHeroVisible] = useState(true);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useFeedback("error");
  const [lastOrder, setLastOrder] = useState("");
  const scroll = useRef<ScrollView>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await publicApi<{ shops: ShopSummary[]; next_page?: number }>("shops/?q=" + encodeURIComponent(query));
      setShops(data.shops);
      setNextPage(data.next_page || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query, setError]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void SecureStore.getItemAsync("customer-last-order")
        .then((value) => {
          if (live) setLastOrder(value || "");
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, []),
  );
  const results = shops.filter(
    (shop) =>
      [
        shop.name,
        ...shop.categories,
        ...shop.preview_products.map((p) => p.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (activeCategory === "All" || shop.categories.includes(activeCategory)),
  );
  return (
    <SafeAreaView style={s.safe}>
      <Header />
      <ScrollView
        onScroll={e => setHeroVisible(e.nativeEvent.contentOffset.y < 600)} scrollEventThrottle={100}
        ref={scroll}
        contentContainerStyle={[s.content, s.homeContent, { paddingBottom: 120 }]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => { void load(); setFeaturedRetry(value => value + 1); }} />
        }
        keyboardShouldPersistTaps="handled"
      >
          <TextInput
            accessibilityLabel="Search shops"
            placeholder="Search shops or essentials…"
            value={query}
            onChangeText={setQuery}
            style={s.input}
            placeholderTextColor="#82907c"
          />
        {!browse && (
          <View style={s.homeHero}>
            <Text style={s.homeTitle}>Discover more.</Text>
            <ErrorBox text={featuredError} retry={() => setFeaturedRetry(value => value + 1)} />
            {featuredLoading && !featured.length ? <Text>Loading product images…</Text> : (!featuredError || featured.length > 0) && <ProductShowcase visible={heroVisible} products={featured} />}
          </View>
        )}
        <View style={s.quickLinks}>
          <Pressable
            accessibilityRole="button"
            style={s.quickLink}
            onPress={() => router.navigate("/(tabs)/shops")}
          >
            <Icon name="catalog" size={26} />
            <Text style={s.link}>Shops</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={s.quickLink}
            onPress={() => router.navigate("/(tabs)/cart")}
          >
            <Text style={s.quickIcon}>♧</Text>
            <Text style={s.link}>Carts</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={s.quickLink}
            onPress={() => router.navigate("/(tabs)/wishlist")}
          >
            <Icon name="heart" size={26} />
            <Text style={s.link}>Wishlist</Text>
          </Pressable>
        </View>
        {lastOrder ? (
          <Button
            light
            title="Track your latest order →"
            onPress={() =>
              router.push({
                pathname: "/order/[token]",
                params: { token: lastOrder },
              })
            }
          />
        ) : null}
        <View style={s.section}>
          <Text style={s.title}>
            {browse ? "Find a shop" : "Explore shops"}
          </Text>

        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          {["All", ...new Set(shops.flatMap((shop) => shop.categories))].map(
            (name) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: activeCategory === name }}
                key={name}
                onPress={() => setActiveCategory(name)}
                style={[s.chip, activeCategory === name && s.chipActive]}
              >
                <Text
                  style={
                    activeCategory === name ? s.chipTextActive : s.chipText
                  }
                >
                  {name}
                </Text>
              </Pressable>
            ),
          )}
        </ScrollView>
        <ErrorBox text={error} retry={load} />
        {loading && !shops.length && <ActivityIndicator color="#285538" />}
        {!loading && !error && !results.length && (
          <Text style={s.empty}>
            {query
              ? "No matching shops. Try another search."
              : "Shops will appear here when they publish their products."}
          </Text>
        )}
        {results.map((shop) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Visit ${shop.name}`}
            key={shop.slug}
            onPress={() =>
              router.push({
                pathname: "/shop/[slug]",
                params: { slug: shop.slug },
              })
            }
            style={s.shopCard}
          >
            <View style={s.shopArt}>
              {shop.preview_products.slice(0, 3).map((p) => (
                <View key={p.id} style={s.preview}>
                  <Picture uri={p.image} name={p.name} />
                </View>
              ))}
            </View>
            <View style={s.cardCopy}>
              <Text style={s.eyebrow}>
                {shop.delivery_enabled
                  ? "PICKUP + DELIVERY"
                  : "PICKUP AVAILABLE"}
              </Text>
              <Text style={s.shopName}>{shop.name} ↗</Text>
              <Text style={s.muted}>
                {shop.product_count} products ·{" "}
                {shop.categories.slice(0, 2).join(" · ")}
              </Text>
            </View>
          </Pressable>
        ))}
        {nextPage && <Button title="Explore more shops" disabled={loading} onPress={() => {
          setLoading(true);
          void publicApi<{ shops: ShopSummary[]; next_page: number | null }>("shops/?page=" + nextPage + "&q=" + encodeURIComponent(query))
            .then(result => { setShops(old => [...old, ...result.shops]); setNextPage(result.next_page); })
            .catch(e => setError(e.message)).finally(() => setLoading(false));
        }} />}
      </ScrollView>
    </SafeAreaView>
  );
}
export function ShopScreen() {
  const { slug, checkout, product: productId, category: categoryName } = useLocalSearchParams<{
    slug: string;
    checkout?: string;
    category?: string;
    product?: string;
  }>();
  const customer = useCustomer();
  const [galleryPhoto, setGalleryPhoto] = useState<{ id: number; uri: string } | null>(null);
  const router = useRouter();
  const [data, setData] = useState<ShopCatalog | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState(false);
  const [error, setError] = useFeedback("error");
  const [loading, setLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(checkout === "1");
  const [delivery, setDelivery] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<OrderAttempt | null>(null);
  const [attemptReady, setAttemptReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useFeedback("info");
  const [heroVisible, setHeroVisible] = useState(true);
  const attemptKey = "checkout-" + slug;
  useEffect(() => {
    let live = true;
    setAttemptReady(false);
    void SecureStore.getItemAsync(attemptKey).then(raw => {
      if (live) { setAttempt(parseAttempt(raw)); setAttemptReady(true); }
    }).catch(e => { if (live) setStorageError(e.message); });
    return () => { live = false; };
  }, [attemptKey]);
  const submitting = useRef(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const catalog = await publicApi<ShopCatalog>(
        `shop/${encodeURIComponent(slug)}/`,
      );
      setData(catalog);
      const saved =
        data?.shop.slug === slug
          ? cart
          : Object.fromEntries(
              (customer.carts.find((b) => b.slug === slug)?.items || []).map(
                (p) => [p.id, p.quantity],
              ),
            );
      const reconciled = Object.fromEntries(
        catalog.products.map((p) => [
          p.id,
          Math.min(saved[p.id] || 0, p.available),
        ]),
      );
      if (Object.entries(saved).some(([id, qty]) => qty !== (reconciled[Number(id)] || 0)))
        setNotice("Availability changed. Review the updated quantities in your cart.");
      if (data && data.products.some(p => saved[p.id] && catalog.products.find(n => n.id === p.id)?.price !== p.price))
        setNotice("Prices changed. Review the updated prices in your cart.");
      setCart(reconciled);
      customer.saveCart(catalog, reconciled);
      if (!catalog.shop.delivery_enabled) setDelivery(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (customer.ready) void load();
    setCartOpen(checkout === "1");
  }, [slug, customer.ready, checkout]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = data?.products.filter((p) => cart[p.id] > 0) || [];
  const count = lines.reduce((total, p) => total + cart[p.id], 0);
  const subtotal = lines.reduce((total, p) => total + p.price * cart[p.id], 0);
  const fee = delivery ? data?.shop.delivery_fee || 0 : 0;
  const currency = data?.shop.currency || "UGX";
  function quantity(id: number, value: number) {
    const p = data?.products.find((p) => p.id === id);
    if (p && data && !busy && !attempt) {
      const next = {
        ...cart,
        [id]: Math.max(0, Math.min(p.available, 10000, Math.floor(value) || 0)),
      };
      setCart(next);
      customer.saveCart(data, next);
    }
  }
  async function place() {
    if (submitting.current || !lines.length) return;
    if (
      !name.trim() ||
      !/^\+?[0-9 ()-]{7,25}$/.test(phone.trim()) ||
      (delivery && !address.trim())
    ) {
      setError(
        "Please enter your name, a valid phone number, and a delivery address if needed.",
      );
      return;
    }
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      address: delivery ? address.trim() : "",
      delivery,
      lines: lines.map((p) => ({
        product: p.id,
        quantity: cart[p.id],
        price: p.price,
      })),
    };
    if (!attemptReady || attempt || storageError) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const latest = await publicApi<ShopCatalog>("shop/" + encodeURIComponent(slug) + "/");
      const changed = payload.lines.some(line => {
        const p = latest.products.find(p => p.id === line.product);
        return !p || p.price !== line.price || p.available < line.quantity;
      }) || (delivery && (!latest.shop.delivery_enabled || latest.shop.delivery_fee !== fee));
      if (changed) { await load(); setNotice("Your cart changed. Review prices, quantities and delivery before ordering."); return; }
      const confirmed = await new Promise<boolean>(resolve => Alert.alert("Review your order",
        (delivery ? "Delivery" : "Pickup") + " · " + money(subtotal + fee, currency) + ". No online payment will be taken.",
        [{ text: "Keep shopping", style: "cancel", onPress: () => resolve(false) }, { text: "Place order", onPress: () => resolve(true) }],
        { cancelable: true, onDismiss: () => resolve(false) }));
      if (!confirmed) return;
      const next: OrderAttempt = createOrderAttempt(Crypto.randomUUID(), payload);
      await SecureStore.setItemAsync(attemptKey, JSON.stringify(next));
      setAttempt(next);
      await sendAttempt(next);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); submitting.current = false; }
  }
  async function sendAttempt(pending: OrderAttempt) {
    try {
      const result = await publicApi<{ token: string }>("shop/" + encodeURIComponent(slug) + "/", { ...pending.payload, client_id: pending.key });
      await customer.rememberOrder(result.token);
      await SecureStore.deleteItemAsync(attemptKey).catch(() => {});
      customer.clearCart(slug); setCart({}); setCartOpen(false); setAttempt(null);
      router.push({ pathname: "/order/[token]", params: { token: result.token } });
    } catch (e) {
      if (definiteRejection(e)) { await SecureStore.deleteItemAsync(attemptKey); setAttempt(null); }
      throw e;
    }
  }
  async function recover() {
    if (!attempt || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try { await sendAttempt(attempt); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); submitting.current = false; }
  }
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active" && !submitting.current) void loadRef.current();
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (categoryName && data) setCategory(String(data.categories.find(c => c.name === categoryName)?.id || "all"));
  }, [categoryName, data]);
  const wishlistButton = (p: ShopCatalog["products"][number]) => {
    const saved = customer.wishlist?.some(item => item.id === p.id && item.slug === slug);
    return <Pressable accessibilityRole="button" accessibilityLabel={(saved ? "Remove " : "Save ") + p.name + (saved ? " from" : " to") + " wishlist"} accessibilityState={{ selected: !!saved, disabled: !customer.ready }} disabled={!customer.ready} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }} onPress={() => customer.toggleWishlist({ ...p, slug, shop: data!.shop.name, currency })}><Icon name="heart" color={saved ? "#b64353" : "#24543b"} size={26} /></Pressable>;
  };
  const detail = data?.products.find(p => String(p.id) === productId);
  const products = (data?.products || [])
    .filter(
      (p) =>
        productName(p).toLowerCase().includes(query.toLowerCase()) &&
        (category === "all" || String(p.category) === category),
    )
    .sort((a, b) => (sort ? a.price - b.price : a.name.localeCompare(b.name)));
  return (
    <SafeAreaView style={s.safe}>
      <Header back />
      <ScrollView
        onScroll={e => setHeroVisible(e.nativeEvent.contentOffset.y < 600)} scrollEventThrottle={100}
        contentContainerStyle={[s.content, { paddingBottom: 110 }]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.hero}>
          <Text style={s.eyebrow}>YOUR NEXT FAVOURITES</Text>
          {data?.shop.logo && <View style={{ width: 64, height: 64 }}><Picture uri={data.shop.logo} name={data.shop.name + " logo"} /></View>}
          <Text style={s.title}>{data?.shop.name || "Opening the shop…"}</Text>
          <Text style={s.heroBody}>
            {data?.shop.description || "Fill your cart. We’ll take it from here."}
          </Text>
          {data?.shop.website && <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(data.shop.website!).catch(() => setError("Unable to open the shop website.")); }}><Text style={s.link}>Shop website ↗</Text></Pressable>}
          <Text style={s.heroFoot}>
            {data?.shop.delivery_enabled
              ? "Pickup + shop delivery"
              : "Pickup available"}
          </Text>
        </View>
        {data && <ProductShowcase visible={heroVisible && !productId && !cartOpen} products={data.products.slice(0, 8).map(p => ({ ...p, slug, shop: data.shop.name, currency: data.shop.currency }))} />}
        {notice ? <Text accessibilityLiveRegion="polite" style={s.fine}>{notice}</Text> : null}
        <ErrorBox text={error} retry={load} />
        <TextInput
          accessibilityLabel="Search products"
          style={s.input}
          placeholder="What’s on your list?"
          value={query}
          onChangeText={setQuery}
          placeholderTextColor="#82907c"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          {[
            { id: "all", name: "All essentials" },
            ...(data?.categories || []).map((c) => ({
              id: String(c.id),
              name: c.name,
            })),
          ].map((c) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: category === c.id }}
              key={c.id}
              onPress={() => setCategory(c.id)}
              style={[s.chip, category === c.id && s.chipActive]}
            >
              <Text style={category === c.id ? s.chipTextActive : s.chipText}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={() => setSort(!sort)}>
          <Text style={s.link}>
            {sort ? "Sort: lowest price first" : "Sort: name A–Z"} ⇅
          </Text>
        </Pressable>
        <View style={s.productGrid}>
          {groupProducts(products).map((p) => (
            <View key={p.id} style={s.productCard}>
              <Pressable accessibilityRole="link" accessibilityLabel={"View " + p.name} onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug, product: p.id } })} style={s.productArt}>
                <Picture uri={p.image} name={p.name} />
              </Pressable>
              <View style={s.productCopy}>
                <Text style={s.productCategory}>{p.category_name}</Text>
                <Text style={s.productName}>{productName(p)}</Text>
                <Text style={s.price}>{money(p.price, currency)}</Text>
                {wishlistButton(p)}
                <Button
                  title={
                    p.variant_group ? "Choose options" : p.preview ? "Coming soon" : !p.available
                      ? "Sold out"
                      : cart[p.id]
                        ? `Add more · ${cart[p.id]} in cart`
                        : "Add to cart +"
                  }
                  disabled={
                    busy || !!attempt ||
                    (!p.variant_group && (!p.available || cart[p.id] >= Math.min(p.available, 10000)))
                  }
                  onPress={() => p.variant_group ? router.setParams({ product: String(p.id) }) : quantity(p.id, (cart[p.id] || 0) + 1)}
                  light
                />
              </View>
            </View>
          ))}
        </View>
        {!loading && data && !products.length && (
          <Text style={s.empty}>
            No products here yet. Try another search or category.
          </Text>
        )}
        <Text style={s.fine}>{data?.availability_notice}</Text>
      </ScrollView>
      <Modal visible={!!productId} animationType="fade" onRequestClose={() => router.setParams({ product: "" })}>
        <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
          <Button title="Close product details" light onPress={() => router.setParams({ product: "" })} />
          {detail ? <><View style={{ height: 260 }}><Picture uri={galleryPhoto?.id === detail.id ? galleryPhoto.uri : detail.image} name={detail.name} /></View>
            {!!detail.gallery?.length && <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
              {[detail.image, ...detail.gallery].filter(Boolean).map((uri, index) => <Pressable key={uri + index} accessibilityRole="button" accessibilityLabel={"View photo " + (index + 1)} style={{ width: 72, height: 72, padding: 4, backgroundColor: "#fff", borderRadius: 16 }} onPress={() => setGalleryPhoto({ id: detail.id, uri })}><Picture uri={uri} name={detail.name} /></Pressable>)}
            </ScrollView>}
            <Text style={s.eyebrow}>{data?.shop.name} · {detail.category_name}</Text>
            <Text accessibilityRole="header" style={s.title}>{detail.name}</Text>
            <Text style={s.price}>{money(detail.price, currency)}</Text>
            {!!detail.description && <Text style={s.fine}>{detail.description}</Text>}
            {!!detail.variant_group && <View style={{ gap: 10 }}><Text style={s.productName}>Choose your option</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {variantsFor(data!.products, detail).map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={"Select " + variantLabel(option)} accessibilityState={{ selected: option.id === detail.id }} onPress={() => router.setParams({ product: String(option.id) })} style={[s.chip, option.id === detail.id && s.chipActive]}><Text style={option.id === detail.id ? s.chipTextActive : s.chipText}>{variantLabel(option)}{!option.available || option.preview ? " · Unavailable" : ""}</Text></Pressable>)}
            </View></View>}
            {wishlistButton(detail)}
            <Text>{detail.preview ? "Preview · coming soon" : detail.available ? detail.available + " available to order" : "Currently sold out"}</Text>
            <Text style={s.fine}>{data?.availability_notice}</Text>
            <Button title="Add to cart +" disabled={busy || !!attempt || !!detail.preview || !detail.available || (cart[detail.id] || 0) >= detail.available}
              onPress={() => { quantity(detail.id, (cart[detail.id] || 0) + 1); router.setParams({ product: "" }); setNotice("Added to your cart."); }} />
          </> : <Text style={s.title}>{data ? "This product is unavailable" : "Opening product…"}</Text>}
        </ScrollView></SafeAreaView>
      </Modal>
      <View style={s.cartBar}>
        <View>
          <Text style={s.price}>{money(subtotal + fee, currency)}</Text>
          <Text style={s.muted}>{count} items in your cart</Text>
        </View>
        <Button title="View cart →" onPress={() => setCartOpen(true)} />
      </View>
      <Modal
        visible={cartOpen}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setCartOpen(false);
        }}
      >
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={s.header}>
            <Text style={s.title}>Your cart</Text>
            <Button
              title="Close"
              light
              disabled={busy}
              onPress={() => setCartOpen(false)}
            />
          </View>
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <ErrorBox text={error || storageError} retry={busy ? undefined : load} />
            {notice ? <Text accessibilityLiveRegion="polite" style={s.fine}>{notice}</Text> : null}
            {attempt && <View style={s.error}><Text>Resolve your previous checkout before changing or submitting another order.</Text>
              <Button title={busy ? "Checking…" : "Recover order"} disabled={busy} onPress={() => void recover()} /></View>}
            {!!lines.length && <Button title="Clear cart" light disabled={busy || !!attempt} onPress={() => Alert.alert("Clear this cart?", "Remove all items from this shop’s cart.", [
              { text: "Keep cart", style: "cancel" }, { text: "Clear", style: "destructive", onPress: () => { setCart({}); customer.clearCart(slug); } }
            ])} />}
            {!lines.length && (
              <Text style={s.empty}>
                A little room for your favourites. Add something from the
                shelves.
              </Text>
            )}
            {lines.map((p) => (
              <View style={s.cartRow} key={p.id}>
                <View style={{ flex: 1 }}>
                  <Text style={s.productName}>{productName(p)}</Text>
                  <Text style={s.muted}>
                    {money(p.price * cart[p.id], currency)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Decrease ${p.name}`}
                  disabled={busy || !!attempt}
                  style={s.step}
                  onPress={() => quantity(p.id, cart[p.id] - 1)}
                >
                  <Text>−</Text>
                </Pressable>
                <Text>{cart[p.id]}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Increase ${p.name}`}
                  disabled={busy || !!attempt || cart[p.id] >= Math.min(p.available, 10000)}
                  style={s.step}
                  onPress={() => quantity(p.id, cart[p.id] + 1)}
                >
                  <Text>+</Text>
                </Pressable>
              </View>
            ))}
            <Text style={s.subheading}>How would you like it?</Text>
            <View style={s.chips}>
              <Button
                title="Pickup · Free"
                light={delivery}
                disabled={busy || !!attempt}
                onPress={() => setDelivery(false)}
              />
              {data?.shop.delivery_enabled && (
                <Button
                  title={`Delivery · ${money(data.shop.delivery_fee, currency)}`}
                  light={!delivery}
                  disabled={busy || !!attempt}
                  onPress={() => setDelivery(true)}
                />
              )}
            </View>
            <Text style={s.label}>Your name</Text>
            <TextInput
              accessibilityLabel="Your name"
              value={name}
              onChangeText={setName}
              editable={!busy && !attempt}
              autoComplete="name"
              maxLength={100}
              style={s.input}
            />
            <Text style={s.label}>Phone number</Text>
            <TextInput
              accessibilityLabel="Phone number"
              value={phone}
              onChangeText={setPhone}
              editable={!busy && !attempt}
              keyboardType="phone-pad"
              autoComplete="tel"
              maxLength={25}
              placeholder="+256 700 000 000"
              style={s.input}
            />
            {delivery && (
              <>
                <Text style={s.label}>Delivery address</Text>
                <TextInput
                  accessibilityLabel="Delivery address"
                  value={address}
                  onChangeText={setAddress}
                  editable={!busy && !attempt}
                  maxLength={250}
                  multiline
                  placeholder="Street, area and nearby landmark"
                  style={s.input}
                />
              </>
            )}
            <View style={s.summaryRow}>
              <Text>Subtotal</Text>
              <Text>{money(subtotal, currency)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text>{delivery ? "Delivery" : "Pickup"}</Text>
              <Text>{money(fee, currency)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.subheading}>Total</Text>
              <Text style={s.price}>{money(subtotal + fee, currency)}</Text>
            </View>
            <Button
              title={busy ? "Placing your order…" : "Place order →"}
              disabled={busy || !!attempt || !attemptReady || !!storageError || !lines.length}
              onPress={place}
            />
            <Text style={s.fine}>
              No payment taken online. Pay at pickup or arrange payment directly
              with the shop. Orders need the shop’s confirmation.
            </Text>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
export function OrderScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const [order, setOrder] = useState<GuestOrder | null>(null);
  const [error, setError] = useFeedback("error");
  useEffect(() => {
    if (!focused) return;
    let live = true, inFlight = false, terminal = false, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (!live || inFlight || terminal) return;
      clearTimeout(timer);
      if (!(AppState.currentState === "active")) { timer = setTimeout(refresh, 15000); return; }
      inFlight = true;
      try {
        const value = await publicApi<GuestOrder>("guest-orders/" + encodeURIComponent(token) + "/");
        if (live) { setOrder(value); setError(""); }
        terminal = ["completed", "cancelled"].includes(value.status); failures = 0;
      } catch (e) { failures++; if (live) setError((e as Error).message); }
      finally {
        inFlight = false;
        if (live && !terminal) timer = setTimeout(refresh, Math.min(60000, 15000 * Math.pow(2, failures)));
      }
    }
    void refresh();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { live = false; clearTimeout(timer); subscription.remove(); };
  }, [token, focused, setError]);
  return (
    <SafeAreaView style={s.safe}>
      <Header back />
      <ScrollView contentContainerStyle={s.content}>
        <ErrorBox text={error} />
        {!order && !error && <ActivityIndicator color="#285538" />}
        {order && (
          <>
            <View style={s.hero}>
              <Text style={s.eyebrow}>
                ORDER #{order.id} · {order.delivery ? "DELIVERY" : "PICKUP"}
              </Text>
              <Text style={s.title}>{order.shop}</Text>
              <Text style={s.status}>{order.status}</Text>
              <Text accessibilityLiveRegion="polite" style={s.heroBody}>
                {orderMessages[order.status]}
              </Text>
            </View>
            {order.status !== "cancelled" && (
              <View style={s.progress}>
                {orderSteps.map((step, i) => (
                  <View
                    key={step}
                    style={[
                      s.progressStep,
                      i <= orderSteps.indexOf(order.status) && {
                        borderColor: "#527e42",
                      },
                    ]}
                  >
                    <Text style={s.progressText}>{step}</Text>
                  </View>
                ))}
              </View>
            )}
            {order.lines.map((line, i) => (
              <View key={i} style={s.summaryRow}>
                <Text style={{ flex: 1 }}>
                  {line.quantity} × {line.name}
                </Text>
                <Text>{money(line.price * line.quantity, order.currency)}</Text>
              </View>
            ))}
            <View style={s.summaryRow}>
              <Text>{order.delivery ? "Delivery" : "Pickup"}</Text>
              <Text>{money(order.delivery_fee, order.currency)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.subheading}>Total</Text>
              <Text style={s.price}>{money(order.total, order.currency)}</Text>
            </View>
            <Text style={s.muted}>
              Payment: {order.payment_state.replaceAll("_", " ")}
            </Text>
            {order.contact ? (
              <Text style={s.fine}>Contact the shop: {order.contact}</Text>
            ) : null}
            <Text style={s.fine}>
              Status refreshes automatically. Pending orders expire after 30
              minutes unless accepted by the shop. Your latest order is
              available from the home screen.
            </Text>
            <Button
              title="Back to the shop →"
              onPress={() =>
                router.replace({
                  pathname: "/shop/[slug]",
                  params: { slug: order.shop_slug },
                })
              }
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  homeContent: { paddingHorizontal: 16, gap: 16 },
  homeHero: { gap: 12 },
  homeTitle: { fontSize: 28, lineHeight: 34, fontWeight: "700", color: "#244b34" },
  quickLinks: { flexDirection: "row", gap: 10 },
  quickLink: {
    flex: 1,
    alignItems: "center",
    padding: 10,
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e9db",
  },
  quickIcon: { fontSize: 18, color: "#738c53" },
  safe: { flex: 1, backgroundColor: "#f7f8f2" },
  content: { padding: 20, gap: 18 },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 15,
  },
  brand: { fontSize: 25, fontWeight: "800", color: "#234c35" },
  link: {
    fontSize: 12,
    color: "#37563c",
    fontWeight: "600",
    paddingVertical: 8,
  },
  hero: { padding: 26, borderRadius: 23, backgroundColor: "#eaf0dc", gap: 13 },
  eyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: "#56734a",
  },
  heroTitle: {
    fontSize: 39,
    lineHeight: 44,
    letterSpacing: -2,
    color: "#244b34",
    fontWeight: "700",
  },
  heroBody: { fontSize: 14, lineHeight: 23, color: "#576d4e" },
  heroArt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    paddingVertical: 10,
  },
  artTitle: { fontSize: 22, fontWeight: "700", color: "#315537" },
  heroFoot: { fontSize: 10, textAlign: "center", color: "#637654" },
  button: {
    backgroundColor: "#285238",
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 46,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  lightButton: { backgroundColor: "#e9efdd" },
  buttonText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  title: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.7,
    color: "#234a33",
    fontWeight: "700",
  },
  section: { gap: 12, marginTop: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d8dfcd",
    borderRadius: 13,
    padding: 13,
    backgroundColor: "white",
    color: "#244b34",
    fontSize: 14,
  },
  empty: { padding: 30, textAlign: "center", color: "#718368", lineHeight: 23 },
  error: { padding: 16, borderRadius: 12, backgroundColor: "#fff0e8", gap: 12 },
  errorText: { color: "#923b27", lineHeight: 22 },
  shopCard: {
    backgroundColor: "white",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e0e5d7",
    overflow: "hidden",
  },
  shopArt: {
    height: 190,
    backgroundColor: "#e9eddb",
    flexDirection: "row",
    gap: 12,
    padding: 23,
    justifyContent: "center",
  },
  preview: {
    flex: 1,
    backgroundColor: "#fafbf5",
    borderRadius: 12,
    padding: 6,
  },
  picture: { width: "100%", height: "100%" },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  productIcon: { fontSize: 40, color: "#8b9a68" },
  placeholderText: { fontSize: 9, textAlign: "center", color: "#728363" },
  cardCopy: { padding: 18, gap: 8 },
  shopName: { fontSize: 23, fontWeight: "700", color: "#234b33" },
  muted: { fontSize: 12, color: "#73816b", lineHeight: 18 },
  visit: { color: "#285238", fontSize: 12, fontWeight: "700", marginTop: 8 },
  localBanner: {
    backgroundColor: "#244b35",
    borderRadius: 18,
    padding: 28,
    gap: 17,
    marginTop: 16,
  },
  bannerTitle: {
    fontSize: 27,
    color: "#eef1db",
    lineHeight: 33,
    fontWeight: "600",
  },
  bannerBody: { fontSize: 13, lineHeight: 23, color: "#cfdbc1" },
  footer: { textAlign: "center", fontSize: 11, color: "#809072", padding: 15 },
  chips: { flexDirection: "row", gap: 9, paddingVertical: 5, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 17,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: "#ecf0e2",
  },
  chipActive: { backgroundColor: "#285238" },
  chipText: { fontSize: 11, color: "#56704b" },
  chipTextActive: { fontSize: 11, color: "white" },
  productGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  productCard: {
    width: "48%",
    flexGrow: 1,
    maxWidth: "49%",
    borderWidth: 1,
    borderColor: "#e0e5d7",
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "white",
  },
  productArt: { height: 135, padding: 15, backgroundColor: "#edf0e3" },
  productCopy: { padding: 12, gap: 9 },
  productCategory: { fontSize: 9, color: "#7d8b71" },
  productName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2c4e37",
    lineHeight: 19,
  },
  price: { fontSize: 15, fontWeight: "700", color: "#284d35" },
  fine: { fontSize: 11, lineHeight: 19, color: "#7a8770", marginVertical: 10 },
  cartBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#dce3d2",
    padding: 20,
    paddingBottom: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e7ebdf",
  },
  step: {
    width: 36,
    height: 40,
    backgroundColor: "#ecf0e3",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  subheading: { fontSize: 18, color: "#294e34", fontWeight: "600" },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#536a49",
    marginBottom: -9,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e9da",
  },
  status: {
    textTransform: "capitalize",
    color: "#37633f",
    fontWeight: "700",
    fontSize: 15,
  },
  progress: { flexDirection: "row", gap: 5 },
  progressStep: {
    flex: 1,
    borderTopWidth: 4,
    borderColor: "#e0e6d5",
    paddingTop: 9,
  },
  progressText: { fontSize: 9, color: "#5c7450", textTransform: "capitalize" },
});
