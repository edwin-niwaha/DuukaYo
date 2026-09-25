"use client";
import { useFeedback } from "../../lib/feedback";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ShopProduct } from "@/lib/storefront";
import { ProductImage } from "./ProductShowcase";
import { productName } from "@/lib/variants";
import { api, money } from "@/lib/api";
import type { ShopCatalog } from "@/lib/storefront";
import { readCart, saveCart } from "@/lib/shopping-cart";
import { ShopHeader } from "./Marketplace";
export type SavedProduct = ShopProduct & {
  slug: string;
  shop: string;
  currency: string;
};
const storageKey = "duukayo-wishlist-v1";
function read(): SavedProduct[] {
  const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
  return Array.isArray(value)
    ? value.filter(
        (p) =>
          p &&
          Number.isInteger(p.id) &&
          typeof p.slug === "string" &&
          typeof p.name === "string",
      )
    : [];
}
function useWishlist() {
  const [items, setItems] = useState<SavedProduct[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useFeedback("error");
  useEffect(() => {
    const update = () => {
      try {
        setItems(read());
        setError("");
      } catch {
        setError("Saved favourites could not be read.");
      }
      setReady(true);
    };
    update();
    window.addEventListener("storage", update);
    window.addEventListener("wishlist-change", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("wishlist-change", update);
    };
  }, [setError]);
  function toggle(item: SavedProduct) {
    try {
      const current = read(),
        found = current.some((p) => p.slug === item.slug && p.id === item.id);
      localStorage.setItem(
        storageKey,
        JSON.stringify(
          found
            ? current.filter((p) => p.slug !== item.slug || p.id !== item.id)
            : [...current, item],
        ),
      );
      window.dispatchEvent(new Event("wishlist-change"));
      setError("");
    } catch {
      setError(
        "Could not save your wishlist. Check browser storage and try again.",
      );
    }
  }
  return { items, ready, error, toggle };
}
export function WishlistButton({ product }: { product: SavedProduct }) {
  const { items, ready, error, toggle } = useWishlist();
  const saved = items.some(
    (p) => p.slug === product.slug && p.id === product.id,
  );
  return (
    <span className="wishlist-control">
      <button
        type="button"
        className={"wishlist-heart" + (saved ? " saved" : "")}
        aria-pressed={saved}
        aria-label={
          (saved ? "Remove " : "Save ") +
          productName(product) +
          (saved ? " from" : " to") +
          " wishlist"
        }
        disabled={!ready}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(product);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
      </button>
      {error && <small>{error}</small>}
    </span>
  );
}
export default function Wishlist() {
  const { items, ready, error } = useWishlist();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("saved");
  const visibleItems = items.filter(p => `${productName(p)} ${p.shop}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "name" ? productName(a).localeCompare(productName(b)) : sort === "shop" ? a.shop.localeCompare(b.shop) : 0);
  const [adding, setAdding] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  async function add(p: SavedProduct) {
    setAdding(p.id); setNotice("");
    try {
      const catalog = await api<ShopCatalog>(`shop/${encodeURIComponent(p.slug)}/`);
      const product = catalog.products.find(item => item.id === p.id);
      const cart = readCart(p.slug);
      if (!product || Math.min(product.available, 10000) <= (cart[p.id] || 0)) throw new Error("This product is no longer available in the requested quantity.");
      saveCart(p.slug, { ...cart, [p.id]: (cart[p.id] || 0) + 1 });
      setNotice(`${productName(p)} added to your cart.`);
    } catch (e) { setNotice((e as Error).message); }
    finally { setAdding(null); }
  }
  return <><ShopHeader /><main className="collection-page wishlist-page">
    <header className="collection-heading"><h1>Wishlist <span className="collection-count">{items.length}</span></h1><div className="collection-links"><Link href="/#shops">Continue shopping</Link><Link href="/cart">Cart →</Link></div></header>
    {items.length > 0 && <div className="collection-toolbar"><label className="collection-search"><span className="sr-only">Search wishlist</span><input type="search" placeholder="Search products or shops" value={query} onChange={e => setQuery(e.target.value)} /></label><label><span className="sr-only">Sort wishlist</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="saved">Saved order</option><option value="name">Product name</option><option value="shop">Shop</option></select></label><span>{visibleItems.length} saved</span></div>}
    {(error || notice) && <p className="collection-note" role="status">{error || notice} {notice.includes("added") && <Link href="/cart">Cart →</Link>}</p>}
    {!ready ? <p role="status">Opening your wishlist…</p> : !items.length ? <div className="collection-empty"><span className="collection-empty-icon">♡</span><h2>Your wishlist is empty</h2><p>Tap a product’s heart to save it.</p><Link className="collection-primary" href="/#shops">Browse shops →</Link></div> : !visibleItems.length ? <div className="collection-empty"><h2>No matches</h2><button onClick={() => setQuery("")}>Clear search</button></div> : <div className="collection-wishlist-grid">
      {visibleItems.map(p => <article className="collection-wishlist-card" key={p.slug + ":" + p.id}>
        <div className="collection-wishlist-image"><Link href={"/shop/" + encodeURIComponent(p.slug) + "?product=" + p.id}><ProductImage src={p.image} name={productName(p)} /></Link><WishlistButton product={p} /></div>
        <div className="collection-wishlist-copy"><Link className="eyebrow" href={"/shop/" + encodeURIComponent(p.slug)}>{p.shop} ↗</Link><Link href={"/shop/" + encodeURIComponent(p.slug) + "?product=" + p.id}><h2>{productName(p)}</h2></Link><strong>{money(p.price, p.currency)}</strong><button disabled={adding !== null || p.preview} onClick={() => void add(p)}>{adding === p.id ? "Adding…" : p.preview ? "Coming soon" : "Add to cart +"}</button></div>
      </article>)}
    </div>}
  </main></>;
}
