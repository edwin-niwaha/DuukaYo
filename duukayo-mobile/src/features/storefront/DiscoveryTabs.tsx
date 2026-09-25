import { useFeedback } from "../../lib/feedback";
import Icon from "../../components/Icon";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { publicApi } from "../../lib/api";
import type { ShopSummary } from "../../lib/storefront";
import { money } from "../../lib/types";
import { productName } from "../../lib/variants";
import { useCustomer } from "./CustomerProvider";
import { ProductPicture } from "./ProductPicture";

export function CategoriesTab() {
  const router = useRouter();
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useFeedback("error");
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let live = true;
    setLoading(true); setError("");
    void (async () => {
      const all: ShopSummary[] = [];
      let page: number | null = 1;
      const visited = new Set<number>();
      while (page && !visited.has(page)) {
        visited.add(page);
        const result: { shops: ShopSummary[]; next_page: number | null } = await publicApi("shops/?page=" + page);
        if (!live) return;
        all.push(...result.shops);
        page = result.next_page;
      }
      if (live) setShops(all);
    })().catch(() => { if (live) setError("Categories could not load. Please try again."); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // Recreate the focus callback when the user retries a failed load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]));
  const categories = [...new Set(shops.flatMap(shop => shop.categories))].sort();
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Text style={s.title}>Categories</Text>
    <Text style={s.muted}>Find what you need, then choose a shop.</Text>
    <TextInput accessibilityLabel="Search categories" placeholder="Search categories…" value={query} onChangeText={setQuery} style={s.input} />
    {loading && <ActivityIndicator />}
    {!!error && <View><Text accessibilityRole="alert">{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={s.action}><Text>Try again</Text></Pressable></View>}
    {!loading && !error && !categories.filter(c => c.toLowerCase().includes(query.toLowerCase())).length && <Text style={s.muted}>No matching categories.</Text>}
    <View style={s.grid}>{categories.filter(c => c.toLowerCase().includes(query.toLowerCase())).map(category => <Pressable key={category} accessibilityRole="button" accessibilityState={{ selected: selected === category }} onPress={() => setSelected(category)} style={[s.category, selected === category && s.selected]}>
      <Icon name="overview" size={32} /><Text style={s.name}>{category}</Text><Text style={s.muted}>{shops.filter(shop => shop.categories.includes(category)).length} shops</Text>
    </Pressable>)}</View>
    {!!selected && <Text style={s.name}>Shop {selected}</Text>}
    {shops.filter(shop => shop.categories.includes(selected)).map(shop => <Pressable key={shop.slug} accessibilityRole="button" accessibilityLabel={"Browse " + selected + " at " + shop.name} style={s.card} onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: shop.slug, category: selected } })}><Text style={s.name}>{shop.name} →</Text><Text style={s.muted}>Browse {selected}</Text></Pressable>)}
  </ScrollView></SafeAreaView>;
}

export function WishlistTab() {
  const router = useRouter();
  const { wishlist, ready, toggleWishlist } = useCustomer();
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Text style={s.title}>Wishlist</Text><Text style={s.muted}>Your favourites, saved on this device for later.</Text>
    {!ready && <ActivityIndicator />}
    {ready && !wishlist.length && <View style={s.card}><Icon name="heart" size={32} /><Text style={s.name}>Keep your favourites close.</Text><Text style={s.muted}>Tap the heart on a product to save it here.</Text><Pressable accessibilityRole="button" style={s.action} onPress={() => router.navigate("/(tabs)/home")}><Text>Discover products →</Text></Pressable></View>}
    {wishlist.map(item => <View style={s.card} key={item.slug + ":" + item.id}>
      <Pressable accessibilityRole="button" accessibilityLabel={"View " + item.name} onPress={() => router.push({ pathname: "/shop/[slug]", params: { slug: item.slug, product: item.id } })}>
        <View style={s.photo}><ProductPicture uri={item.image} name={item.name} /></View>
        <Text style={s.muted}>{item.shop}</Text><Text style={s.name}>{productName(item)}</Text><Text style={s.name}>{money(item.price, item.currency)}</Text>
      </Pressable>
      <Text style={s.muted}>Current price and availability are confirmed when you open the product.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={"Remove " + item.name + " from wishlist"} style={s.action} onPress={() => toggleWishlist(item)}><Icon name="heart" color="#b64353" /><Text>Remove from wishlist</Text></Pressable>
    </View>)}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f8f2" },
  content: { padding: 22, paddingBottom: 120, gap: 18 },
  title: { fontSize: 32, fontWeight: "700", color: "#234c34", marginTop: 18 },
  muted: { color: "#69775f", fontSize: 13, lineHeight: 21 },
  name: { color: "#234c34", fontSize: 17, fontWeight: "700" },
  input: { padding: 16, borderRadius: 16, backgroundColor: "white", borderWidth: 1, borderColor: "#dce4d6" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  category: { width: "47%", padding: 18, borderRadius: 20, backgroundColor: "white", borderWidth: 2, borderColor: "#e4e8da", gap: 8 },
  selected: { borderColor: "#24543b", backgroundColor: "#eaf0df" },
  symbol: { fontSize: 34, color: "#24543b" },
  card: { padding: 20, borderRadius: 22, backgroundColor: "white", gap: 12 },
  action: { padding: 14, borderRadius: 14, backgroundColor: "#eaf0df", alignItems: "center" },
  photo: { width: "100%", aspectRatio: 4 / 3, padding: 12 },
});
