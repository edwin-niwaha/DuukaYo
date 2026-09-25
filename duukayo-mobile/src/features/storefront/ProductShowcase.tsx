import Icon from "../../components/Icon";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { ShowcaseProduct } from "../../lib/storefront";
import { money } from "../../lib/types";
import { ProductPicture } from "./ProductPicture";
export default function ProductShowcase({
  products,
  visible = true,
}: {
  products: ShowcaseProduct[];
  visible?: boolean;
}) {
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [reader, setReader] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  const list = useRef<FlatList<ShowcaseProduct>>(null);
  const [width, setWidth] = useState(0);
  const interactionUntil = useRef(0);
  const swiping = useRef(false);
  const safeIndex = products.length ? index % products.length : 0;
  useEffect(() => {
    if (width)
      list.current?.scrollToOffset({
        offset: safeIndex * width,
        animated: !reduced && !reader,
      });
  }, [safeIndex, width, reduced, reader]);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    void AccessibilityInfo.isScreenReaderEnabled().then(setReader);
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    const screenReader = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setReader,
    );
    const app = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => {
      motion.remove();
      screenReader.remove();
      app.remove();
    };
  }, []);
  useEffect(() => {
    if (
      paused ||
      reduced ||
      reader ||
      !active ||
      !focused ||
      !visible ||
      products.length < 2
    )
      return;
    const timer = setInterval(() => {
      if (Date.now() > interactionUntil.current)
        setIndex((i) => (i + 1) % products.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [paused, reduced, reader, active, focused, visible, products.length]);
  const move = (delta: number) => {
    interactionUntil.current = Date.now() + 8000;
    setIndex((i) => (i + delta + products.length) % products.length);
  };
  if (!products.length)
    return (
      <View style={s.card}>
        <Text style={s.title}>Products coming soon</Text>
      </View>
    );
  return (
    <View style={s.card}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ overflow: "hidden" }}
      >
        {width > 0 && (
          <FlatList
            ref={list}
            data={products}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => `${p.slug}:${p.id}`}
            extraData={safeIndex}
            getItemLayout={(_, i) => ({
              length: width,
              offset: i * width,
              index: i,
            })}
            onScrollBeginDrag={() => {
              swiping.current = true;
              interactionUntil.current = Date.now() + 8000;
            }}
            onMomentumScrollEnd={(e) => {
              setIndex(
                Math.min(
                  products.length - 1,
                  Math.max(
                    0,
                    Math.round(e.nativeEvent.contentOffset.x / width),
                  ),
                ),
              );
            }}
            renderItem={({ item: product, index: position }) => (
              <View
                style={{ width }}
                accessibilityElementsHidden={position !== safeIndex}
                importantForAccessibility={
                  position === safeIndex ? "auto" : "no-hide-descendants"
                }
              >
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Explore ${product.name} from ${product.shop}`}
                  onPressIn={() => {
                    swiping.current = false;
                    interactionUntil.current = Date.now() + 8000;
                  }}
                  onPress={() => {
                    if (!swiping.current)
                      router.push({
                        pathname: "/shop/[slug]",
                        params: { slug: product.slug, product: product.id },
                      });
                  }}
                >
                  <View style={s.image}>
                    <ProductPicture uri={product.image} name={product.name} />
                  </View>
                  <Text style={s.label}>{product.shop}{product.preview ? " · Coming soon" : ""}</Text>
                  <Text style={s.title} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text style={s.price}>
                    {money(product.price, product.currency)} ↗
                  </Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </View>
      {products.length > 1 && (
        <View style={s.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous product"
            style={s.control}
            onPress={() => move(-1)}
          >
            <Icon name="left" />
          </Pressable>
          <Text>
            {(index % products.length) + 1} / {products.length}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next product"
            style={s.control}
            onPress={() => move(1)}
          >
            <Icon name="right" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={reduced || reader}
            style={s.control}
            onPress={() => setPaused(!paused)}
          >
            <Text>
              {reduced || reader ? "Motion off" : paused ? "Play" : "Pause"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: "#fffdf5",
    padding: 18,
    borderRadius: 26,
    gap: 16,
    width: "100%",
  },
  label: { color: "#526443", fontSize: 11, letterSpacing: 1 },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    padding: 12,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 23,
    fontWeight: "700",
    color: "#214f38",
    marginVertical: 8,
  },
  price: { fontSize: 19, fontWeight: "600", color: "#214f38" },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  control: {
    minWidth: 44,
    minHeight: 44,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eaf0dc",
    borderRadius: 22,
  },
});
