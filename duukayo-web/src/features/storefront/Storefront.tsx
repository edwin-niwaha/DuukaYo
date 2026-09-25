"use client";
import { useFeedback } from "../../lib/feedback";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { readCart, saveCart } from "@/lib/shopping-cart";
import { api, money } from "@/lib/api";
import type { ShopCatalog } from "@/lib/storefront";
import { ProductImage, ShopHeader } from "./Marketplace";

import ProductShowcase from "./ProductShowcase";
import ProductDetail from "./ProductDetail";
import { WishlistButton } from "./Wishlist";
import { groupProducts, productName } from "@/lib/variants";
import { rememberOrder } from "./CustomerLibrary";
import { OrderAttempt, OrderPayload, parseAttempt, createOrderAttempt, definiteRejection } from "@/lib/order-attempt";

export default function Storefront({ slug, productId }: { slug: string; productId?: string }) {
  const router = useRouter();
  const [data, setData] = useState<ShopCatalog | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("name");
  const [error, setError] = useFeedback("error");
  const [delivery, setDelivery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useFeedback("info");
  const [attempt, setAttempt] = useState<OrderAttempt | null>(null);
  const [storageError, setStorageError] = useState("");
  const attemptKey = "duukayo-checkout:" + slug;
  useEffect(() => {
    try { setAttempt(parseAttempt(localStorage.getItem(attemptKey))); }
    catch (e) { setStorageError((e as Error).message); }
  }, [attemptKey]);
  const submitting = useRef(false);
  const storageKey = `duukayo-cart:${slug}`;
  useEffect(() => {
    let active = true;
    api<ShopCatalog>(`shop/${encodeURIComponent(slug)}/`)
      .then((catalog) => {
        if (!active) return;
        setData(catalog);
        try {
          const saved = readCart(slug);
          const restored: Record<number, number> = {};
          for (const p of catalog.products)
            if (Number.isInteger(saved[p.id]) && saved[p.id] > 0)
              restored[p.id] = Math.min(p.available, saved[p.id], 10000);
          setCart(restored);
          if (Object.entries(saved).some(([id, quantity]) => quantity !== (restored[Number(id)] || 0)))
            setNotice("Availability changed while you were away. Review the updated quantities in your cart.");
          const previousPrices = JSON.parse(localStorage.getItem(storageKey + ":prices") || "{}");
          if (catalog.products.some(p => restored[p.id] && previousPrices[p.id] !== undefined && previousPrices[p.id] !== p.price))
            setNotice("Prices changed while you were away. Review your cart before ordering.");
          localStorage.setItem(storageKey + ":prices", JSON.stringify(Object.fromEntries(catalog.products.map(p => [p.id, p.price]))));
        } catch {
          /* Storage is optional. */
        }
        setReady(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [slug, storageKey, setError, setNotice]);
  useEffect(() => {
    if (ready) {
      try {
        saveCart(slug, cart);
      } catch {
        /* Storage is optional. */
      }
    }
  }, [cart, ready, storageKey, slug]);
  useEffect(() => {
    const update = () => { try { setCart(readCart(slug)); } catch { setError("Your saved cart could not be read."); } };
    window.addEventListener("cart-refreshed", update);
    return () => window.removeEventListener("cart-refreshed", update);
  }, [slug, setError]);
  const lines = data?.products.filter((p) => cart[p.id] > 0) || [];
  const count = lines.reduce((n, p) => n + cart[p.id], 0);
  const subtotal = lines.reduce((n, p) => n + p.price * cart[p.id], 0);
  const fee = delivery ? data?.shop.delivery_fee || 0 : 0;
  const products = groupProducts((data?.products || [])
    .filter(
      (p) =>
        productName(p).toLowerCase().includes(query.toLowerCase()) &&
        (category === "all" || String(p.category) === category),
    ))
    .sort((a, b) =>
      sort === "low"
        ? a.price - b.price
        : sort === "high"
          ? b.price - a.price
          : a.name.localeCompare(b.name),
    );
  function quantity(id: number, value: number) {
    const p = data?.products.find((item) => item.id === id);
    if (p && !busy && !attempt)
      setCart((old) => ({
        ...old,
        [id]: Math.max(0, Math.min(p.available, 10000, Math.floor(value) || 0)),
      }));
  }
  async function place(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length || submitting.current) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      phone: form.get("phone"),
      address: delivery ? form.get("address") : "",
      delivery,
      lines: lines.map((p) => ({
        product: p.id,
        quantity: cart[p.id],
        price: p.price,
      })),
    };
    if (attempt || storageError) return;
    submitting.current = true;
    setBusy(true);
    try {
      const latest = await api<ShopCatalog>("shop/" + encodeURIComponent(slug) + "/");
      const changed = payload.lines.some(line => {
        const p = latest.products.find(p => p.id === line.product);
        return !p || p.price !== line.price || p.available < line.quantity;
      }) || (delivery && (!latest.shop.delivery_enabled || latest.shop.delivery_fee !== fee));
      if (changed) { await refresh(); setNotice("Your cart changed. Review the updated prices, quantities and delivery before ordering."); return; }
      if (!window.confirm("Place this " + (delivery ? "delivery" : "pickup") + " order for " + money(subtotal + fee, latest.shop.currency) + "? No online payment will be taken.")) return;
      const next: OrderAttempt = createOrderAttempt(crypto.randomUUID(), payload as OrderPayload);
      localStorage.setItem(attemptKey, JSON.stringify(next));
      setAttempt(next);
      await sendAttempt(next);
    } catch (e) { setError((e as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function sendAttempt(pending: OrderAttempt) {
    setError("");
    try {
      const result = await api<{ token: string }>(
        "shop/" + encodeURIComponent(slug) + "/",
        { ...pending.payload, client_id: pending.key },
      );
      try { rememberOrder(result.token); } catch { /* The private link is still displayed. */ }
      try {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(attemptKey);
      } catch { /* The confirmed order link remains available. */ }
      setCart({});
      setAttempt(null);
      router.push("/order/" + result.token);
    } catch (e) {
      if (definiteRejection(e)) {
        localStorage.removeItem(attemptKey); setAttempt(null);
      }
      throw e;
    }
  }
  async function recover() {
    if (!attempt || submitting.current) return;
    submitting.current = true; setBusy(true);
    try { await sendAttempt(attempt); }
    catch (e) { setError((e as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function refresh() {
    setError("");
    try {
      const latest = await api<ShopCatalog>(
        `shop/${encodeURIComponent(slug)}/`,
      );
      setData(latest);
      setReady(true);
      setCart((old) =>
        Object.fromEntries(
          latest.products.map((p) => [
            p.id,
            Math.min(old[p.id] || 0, p.available),
          ]),
        ),
      );
      if (!latest.shop.delivery_enabled) setDelivery(false);
      setNotice("Prices and availability refreshed. Please review your cart.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });
  useEffect(() => {
    const visible = () => { if (!document.hidden && !submitting.current) void refreshRef.current(); };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, []);
  return (
    <div className="marketplace">
      <ShopHeader />
      {data && productId && <ProductDetail key={productId} id={productId} catalog={data}
        close={() => router.push("/shop/" + slug, { scroll: false })}
        disabled={busy || !!attempt} quantities={cart}
        add={id => { quantity(id, (cart[id] || 0) + 1); setNotice("Added to your cart."); }} />}
      {count > 0 && <a className="phone-cart-bar" href="#cart"><span>{count} items · {money(subtotal + fee, data?.shop.currency)}</span><strong>Review cart →</strong></a>}
      <main className="market-main">
        <div className="shop-breadcrumb">
          <Link href="/">All shops</Link>
          <span>/</span>
          <span>{data?.shop.name || "Shop"}</span>
          <a href="#cart">Your cart ({count}) ↓</a>
        </div>
        <section className="shop-welcome">
          <div>

            {data?.shop.logo && <div className="shop-logo"><ProductImage src={data.shop.logo} name={data.shop.name + " logo"} /></div>}
            <h1>{data?.shop.name || "Welcome to the shop"}</h1>
            {data?.shop.description && <p>{data.shop.description}</p>}
            {data?.shop.website && <a href={data.shop.website} target="_blank" rel="noopener noreferrer">Shop website ↗</a>}
            <div className="hero-proof">
              <span>✓ Pickup available</span>
              {data?.shop.delivery_enabled && (
                <span>
                  ✓ Delivery from{" "}
                  {money(data.shop.delivery_fee, data.shop.currency)}
                </span>
              )}
            </div>
          </div>
          {data && <ProductShowcase products={data.products.slice(0, 8).map(p => ({ ...p, slug, shop: data.shop.name, currency: data.shop.currency }))} />}
        </section>
        {error && (
          <div className="error">
            {error}
            <button className="secondary" disabled={busy || !!attempt} onClick={refresh}>
              Refresh availability
            </button>
          </div>
        )}
        {notice && (
          <p className="success">
            {notice}
          </p>
        )}
        {!data && !error && (
          <p className="empty" role="status">
            Opening the shelves…
          </p>
        )}
        {data && (
          <div className="shopping-layout">
            <section aria-label="Products">
              <div className="catalog-title">
                <div>
                  <p className="eyebrow">THE GOOD STUFF</p>
                  <h2>Something for every day.</h2>
                </div>
                <span>{data.products.length} products</span>
              </div>
              <div className="catalog-tools">
                <input
                  aria-label="Search products"
                  placeholder="What’s on your list?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Sort products"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="name">Name: A–Z</option>
                  <option value="low">Price: low to high</option>
                  <option value="high">Price: high to low</option>
                </select>
              </div>
              <div className="category-tabs" aria-label="Product categories">
                <button
                  aria-pressed={category === "all"}
                  onClick={() => setCategory("all")}
                >
                  All essentials
                </button>
                {data.categories.map((c) => (
                  <button
                    key={c.id}
                    aria-pressed={category === String(c.id)}
                    onClick={() => setCategory(String(c.id))}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              {!products.length && (
                <p className="market-empty">
                  {data.products.length
                    ? "Nothing matches yet. Try another search or category."
                    : "This shop is preparing its shelves. Check back soon."}
                </p>
              )}
              <div className="shelf-grid">
                {products.map((p, i) => (
                  <article
                    className={`shelf-card shop-tone-${i % 3}`}
                    key={p.id}
                  >
                    <Link href={"/shop/" + slug + "?product=" + p.id} scroll={false} className="shelf-image" aria-label={"View " + p.name}>
                      <ProductImage src={p.image} name={p.name} />
                      <span className="stock-label">
                        {p.preview ? "Coming soon" : p.available ? "Available" : "Sold out"}
                      </span>
                    </Link>
                    <div className="shelf-copy">
                      <small>{p.category_name}</small>
                      <h3>{p.name}</h3>
                      <WishlistButton product={{ ...p, slug, shop: data.shop.name, currency: data.shop.currency }} />
                      <div className="shelf-price">
                        <strong>{money(p.price, data.shop.currency)}</strong>
                        <button
                          aria-label={p.variant_group ? "Choose options for " + p.name : `Add ${p.name} to cart`}
                          disabled={
                            busy || !!attempt ||
                            (!p.variant_group && (!p.available || (cart[p.id] || 0) >= Math.min(p.available, 10000)))
                          }
                          onClick={() => {
                            if (p.variant_group) { router.push("/shop/" + slug + "?product=" + p.id, { scroll: false }); return; }
                            quantity(p.id, (cart[p.id] || 0) + 1);
                            setNotice(`${p.name} added to your cart.`);
                          }}
                        >
                          {p.variant_group ? "Choose options" : "+"}
                        </button>
                      </div>
                      {cart[p.id] > 0 && (
                        <small>{cart[p.id]} in your cart</small>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <aside className="shopping-cart" id="cart">
              <p className="eyebrow">PICKED BY YOU</p>
              <h2>
                Your cart <span>{count}</span>
              </h2>
              {!lines.length && (
                <div className="cart-empty">
                  <span>♧</span>
                  <p>
                    A little room for
                    <br />
                    your favourites.
                  </p>
                  <small>Add something from the shelves.</small>
                </div>
              )}
              {lines.map((p) => (
                <div className="cart-line" key={p.id}>
                  <div>
                    <strong>{productName(p)}</strong>
                    <small>
                      {money(p.price * cart[p.id], data.shop.currency)}
                    </small>
                  </div>
                  <div className="quantity-stepper">
                    <button
                      aria-label={`Decrease ${p.name}`}
                      disabled={busy || !!attempt}
                      onClick={() => quantity(p.id, cart[p.id] - 1)}
                    >
                      −
                    </button>
                    <span aria-label={`Quantity of ${p.name}`}>
                      {cart[p.id]}
                    </span>
                    <button
                      aria-label={`Increase ${p.name}`}
                      disabled={
                        busy || cart[p.id] >= Math.min(p.available, 10000)
                      }
                      onClick={() => quantity(p.id, cart[p.id] + 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="remove-item"
                    aria-label={`Remove ${p.name}`}
                    disabled={busy || !!attempt}
                    onClick={() => quantity(p.id, 0)}
                  >
                    ×
                  </button>
                </div>
              ))}
              {lines.length > 0 && <button className="secondary" disabled={busy || !!attempt} onClick={() => {
                if (window.confirm("Clear this shop’s cart?")) setCart({});
              }}>Clear cart</button>}
              {storageError && <p role="alert" className="error">{storageError}</p>}
              {attempt && <div className="notice" role="status"><strong>Resolve your previous checkout</strong>
                <p>Its result has not been confirmed. Recover the original order before changing or submitting another one.</p>
                <button type="button" disabled={busy} onClick={() => void recover()}>{busy ? "Checking…" : "Recover order"}</button>
              </div>}
              <form onSubmit={place}>
                <fieldset disabled={busy || !!attempt || !!storageError}>
                  <h3>How would you like it?</h3>
                  <div className="fulfilment-options">
                    <button
                      type="button"
                      aria-pressed={!delivery}
                      onClick={() => setDelivery(false)}
                    >
                      Pick up
                      <br />
                      <small>No delivery fee</small>
                    </button>
                    {data.shop.delivery_enabled && (
                      <button
                        type="button"
                        aria-pressed={delivery}
                        onClick={() => setDelivery(true)}
                      >
                        Delivery
                        <br />
                        <small>
                          {money(data.shop.delivery_fee, data.shop.currency)}
                        </small>
                      </button>
                    )}
                  </div>
                  <label>
                    Your name
                    <input
                      autoComplete="name"
                      name="name"
                      required
                      maxLength={100}
                      placeholder="Your full name"
                    />
                  </label>
                  <label>
                    Phone number
                    <input
                      autoComplete="tel"
                      name="phone"
                      type="tel"
                      required
                      maxLength={25}
                      pattern="\+?[0-9 ()\-]{7,25}"
                      placeholder="+256 700 000 000"
                    />
                  </label>
                  {delivery && (
                    <label>
                      Delivery address
                      <input
                        name="address"
                        autoComplete="street-address"
                        required
                        maxLength={250}
                        placeholder="Street, area and a nearby landmark"
                      />
                    </label>
                  )}
                  <div className="cart-summary">
                    <span>Subtotal</span>
                    <span>{money(subtotal, data.shop.currency)}</span>
                  </div>
                  <div className="cart-summary">
                    <span>{delivery ? "Delivery" : "Pickup"}</span>
                    <span>{fee ? money(fee, data.shop.currency) : "Free"}</span>
                  </div>
                  <div className="total">
                    <span>Total</span>
                    <strong>{money(subtotal + fee, data.shop.currency)}</strong>
                  </div>
                  <button className="wide" disabled={!lines.length || busy || !!attempt || !!storageError}>
                    {busy ? "Placing your order…" : "Place order →"}
                  </button>
                </fieldset>
              </form>
              <p className="payment-note">
                No payment taken online. Pay at pickup or arrange payment with
                the shop.
              </p>
              <details>
                <summary>About availability</summary>
                <p>{data.availability_notice}</p>
              </details>
              {data.shop.contact && (
                <p className="shop-contact">Questions? {data.shop.contact}</p>
              )}
            </aside>
          </div>
        )}
      </main>
      <footer className="market-footer">
        <span>◈ DuukaYo · Good things, closer to home.</span>
        <Link href="/">Explore more shops ↗</Link>
      </footer>
    </div>
  );
}
