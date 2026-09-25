"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { cartKeys, readCart, saveCart } from "@/lib/shopping-cart";
import type { ShopCatalog } from "@/lib/storefront";
import { ProductImage } from "./ProductShowcase";
import { productName } from "@/lib/variants";

type Group = { slug: string; quantities: Record<number, number>; catalog?: ShopCatalog };
export default function CartItems({ locked, onCountChange }: { locked: boolean; onCountChange: (count: number) => void }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true, revision = 0;
    const load = async () => {
      const version = ++revision;
      try {
        const entries = cartKeys().map(key => ({ slug: key.slice("duukayo-cart:".length), quantities: readCart(key.slice("duukayo-cart:".length)) })).filter(group => Object.keys(group.quantities).length);
        const next = await Promise.all(entries.map(async group => {
          try { return { ...group, catalog: await api<ShopCatalog>(`shop/${encodeURIComponent(group.slug)}/`) }; }
          catch { return group; }
        }));
        if (live && version === revision) { setGroups(next); onCountChange(next.reduce((total, group) => total + Object.values(group.quantities).reduce((sum, quantity) => sum + quantity, 0), 0)); setError(""); }
      } catch { if (live) setError("Your cart could not be read. Please check browser storage and reload."); }
      finally { if (live) setLoading(false); }
    };
    void load();
    const update = () => { void load(); };
    ["cart-change", "cart-refreshed", "storage"].forEach(event => window.addEventListener(event, update));
    return () => { live = false; ["cart-change", "cart-refreshed", "storage"].forEach(event => window.removeEventListener(event, update)); };
  }, [onCountChange]);
  function change(group: Group, id: number, quantity: number) {
    try { saveCart(group.slug, { ...readCart(group.slug), [id]: quantity }); }
    catch { setError("Could not save this change. Please try again."); }
  }
  const count = groups.reduce((total, group) => total + Object.values(group.quantities).reduce((sum, q) => sum + q, 0), 0);
  return <section className="cart-products" aria-label="Products in your cart">
    <div className="collection-section-title"><h2>Items</h2><span>{count} {count === 1 ? "item" : "items"}</span></div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Opening your cart…</p> : !groups.length ? <div className="collection-empty"><span className="collection-empty-icon">◈</span><h2>Your cart is empty</h2><p>Find products from local shops.</p><Link className="collection-primary" href="/#shops">Browse shops →</Link><Link href="/wishlist">Wishlist</Link></div> : groups.map(group => <article className="cart-shop" key={group.slug}>
      <header><div><h3><Link href={`/shop/${encodeURIComponent(group.slug)}`}>{group.catalog?.shop.name || group.slug} ↗</Link></h3></div><span>{Object.keys(group.quantities).length} {Object.keys(group.quantities).length === 1 ? "product" : "products"}</span></header>
      {!group.catalog && <p className="cart-unavailable">This shop could not be loaded. Try refreshing, or remove its items to continue.</p>}
      {Object.entries(group.quantities).map(([id, quantity]) => {
        const product = group.catalog?.products.find(p => p.id === Number(id));
        const name = product ? productName(product) : `Unavailable product #${id}`;
        return <div className="collection-cart-line" key={id}>
          <Link className="collection-thumbnail" href={`/shop/${encodeURIComponent(group.slug)}?product=${id}`}><ProductImage src={product?.image} name={name} /></Link>
          <div className="collection-line-copy"><Link href={`/shop/${encodeURIComponent(group.slug)}?product=${id}`}><h4>{name}</h4></Link><p>{product ? money(product.price, group.catalog!.shop.currency) + " each" : "Availability needs checking"}</p>{product && quantity > product.available && <small className="cart-unavailable">Only {product.available} available. Update this quantity.</small>}<button className="collection-remove" disabled={locked} onClick={() => change(group, Number(id), 0)} aria-label={`Remove ${name}`}>Remove</button></div>
          <div className="collection-line-controls"><div className="collection-quantity"><button aria-label={`Decrease ${name}`} disabled={locked || quantity <= 1} onClick={() => change(group, Number(id), quantity - 1)}>−</button><span aria-label={`Quantity of ${name}`}>{quantity}</span><button aria-label={`Increase ${name}`} disabled={locked || !product || quantity >= Math.min(product.available, 10000)} onClick={() => change(group, Number(id), quantity + 1)}>+</button></div><strong>{product ? money(product.price * quantity, group.catalog!.shop.currency) : "—"}</strong></div>
        </div>;
      })}
      {group.catalog && <footer><span>Shop subtotal</span><strong>{money(group.catalog.products.reduce((total, product) => total + product.price * (group.quantities[product.id] || 0), 0), group.catalog.shop.currency)}</strong></footer>}
    </article>)}
  </section>;
}
