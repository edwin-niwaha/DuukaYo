import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Storage from "expo-sqlite/kv-store";
import * as SecureStore from "expo-secure-store";
import type { ShopCatalog, ShopProduct } from "../../lib/storefront";
export type SavedCart = {
  slug: string;
  name: string;
  currency: string;
  items: (ShopProduct & { quantity: number })[];
};
export type WishlistItem = ShopProduct & { slug: string; shop: string; currency: string };
type CustomerState = {
  wishlist: WishlistItem[];
  toggleWishlist: (item: WishlistItem) => void;
  carts: SavedCart[];
  tokens: string[];
  ready: boolean;
  saveCart: (catalog: ShopCatalog, quantities: Record<number, number>) => void;
  clearCart: (slug: string) => void;
  rememberOrder: (token: string) => Promise<void>;
};
const Context = createContext<CustomerState | null>(null);
export function CustomerProvider({ children }: { children: ReactNode }) {
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const wishlistRef = useRef<WishlistItem[]>([]);
  const wishlistWrites = useRef(Promise.resolve());
  const [carts, setCarts] = useState<SavedCart[]>([]);
  const [tokens, setTokens] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const cartRef = useRef<SavedCart[]>([]);
  const tokenRef = useRef<string[]>([]);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let live = true;
    void (async () => {
      let restored: SavedCart[] = [];
      let history: string[] = [];
      try {
        let saved = await Storage.getItem("customer-carts-v1");
        if (saved === null) {
          saved = await Storage.getItem("customer-bags-v1");
          if (saved !== null) {
            await Storage.setItem("customer-carts-v1", saved);
            await Storage.removeItem("customer-bags-v1");
          }
        }
        const value = JSON.parse(saved || "[]");
        if (Array.isArray(value))
          restored = value.filter(
            (b) =>
              b &&
              typeof b.slug === "string" &&
              Array.isArray(b.items) &&
              b.items.every(
                (p: ShopProduct & { quantity: number }) =>
                  Number.isInteger(p.id) &&
                  Number.isInteger(p.quantity) &&
                  p.quantity > 0,
              ),
          );
      } catch {
        /* Start with an empty cart if storage is unavailable. */
      }
      try {
        const value = JSON.parse(
          (await SecureStore.getItemAsync("customer-order-history")) || "[]",
        );
        if (Array.isArray(value))
          history = value.filter((t) => typeof t === "string");
        const latest = await SecureStore.getItemAsync("customer-last-order");
        if (latest) history = [...new Set([latest, ...history])].slice(0, 20);
      } catch {
        /* Guest checkout does not depend on history. */
      }
      let savedWishlist: WishlistItem[] = [];
      try {
        const value = JSON.parse((await Storage.getItem("customer-wishlist-v1")) || "[]");
        if (Array.isArray(value)) savedWishlist = value.filter(item => item && Number.isInteger(item.id) && typeof item.slug === "string" && typeof item.name === "string");
      } catch { /* A corrupt saved list must not prevent shopping. */ }
      if (live) {
        wishlistRef.current = savedWishlist;
        setWishlist(savedWishlist);
        cartRef.current = restored;
        tokenRef.current = history;
        setCarts(restored);
        setTokens(history);
        setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  function persist(next: SavedCart[]) {
    cartRef.current = next;
    setCarts(next);
    writes.current = writes.current
      .then(() => Storage.setItem("customer-carts-v1", JSON.stringify(next)))
      .catch(() => {});
  }
  function saveCart(catalog: ShopCatalog, quantities: Record<number, number>) {
    const items = catalog.products
      .filter((p) => quantities[p.id] > 0)
      .map((p) => ({
        ...p,
        quantity: Math.min(10000, p.available, quantities[p.id]),
      }))
      .filter((p) => p.quantity > 0);
    const rest = cartRef.current.filter((b) => b.slug !== catalog.shop.slug);
    persist(
      items.length
        ? [
            ...rest,
            {
              slug: catalog.shop.slug,
              name: catalog.shop.name,
              currency: catalog.shop.currency,
              items,
            },
          ]
        : rest,
    );
  }
  async function rememberOrder(token: string) {
    const next = [...new Set([token, ...tokenRef.current])].slice(0, 20);
    tokenRef.current = next;
    setTokens(next);
    await SecureStore.setItemAsync(
      "customer-order-history",
      JSON.stringify(next),
    ).catch(() => {});
    await SecureStore.setItemAsync("customer-last-order", token).catch(
      () => {},
    );
  }
  return (
    <Context.Provider
      value={{
        wishlist,
        toggleWishlist: (item) => {
          if (!ready) return;
          const exists = wishlistRef.current.some(p => p.id === item.id && p.slug === item.slug);
          const next = exists ? wishlistRef.current.filter(p => p.id !== item.id || p.slug !== item.slug) : [...wishlistRef.current, item];
          wishlistRef.current = next;
          setWishlist(next);
          wishlistWrites.current = wishlistWrites.current.then(() => Storage.setItem("customer-wishlist-v1", JSON.stringify(next))).catch(() => {});
        },
        carts,
        tokens,
        ready,
        saveCart,
        clearCart: (slug) =>
          persist(cartRef.current.filter((b) => b.slug !== slug)),
        rememberOrder,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCustomer() {
  const value = useContext(Context);
  if (!value) throw new Error("CustomerProvider is missing");
  return value;
}
