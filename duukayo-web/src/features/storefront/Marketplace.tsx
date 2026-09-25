"use client";
import { useFeedback } from "../../lib/feedback";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { api, money, logoutWeb } from "@/lib/api";
import type { ShowcaseProduct, ShopSummary } from "@/lib/storefront";

import ProductShowcase, { ProductImage } from "./ProductShowcase";
export { ProductImage } from "./ProductShowcase";
import CustomerLibrary from "./CustomerLibrary";
export function ShopHeader() {
  const [platform, setPlatform] = useState<{ name?: string; notice?: string; support_email?: string; orders_enabled?: boolean }>({});
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useFeedback("error");
  useEffect(() => {
    let live = true;
    void api<typeof platform>("public/settings/").then(data => { if (live && data) setPlatform(data); }).catch(() => {});
    void api<{ username?: string }>("auth/me/")
      .then((profile) => {
        if (live) setUsername(profile.username || "");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await logoutWeb();
      window.location.replace("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <header className="market-nav">
      <Link className="brand" href="/">
        ◈ {platform.name || "DuukaYo"}<span className="brand-dot">.</span>
      </Link>
      <nav aria-label="Main navigation">
        {username && <span className="nav-user">Hi, {username}</span>}
        <Link href="/#shops">Explore shops</Link>
        <Link href="/wishlist">♡ Wishlist</Link>
        <Link href="/cart">Cart</Link>
        <Link className="merchant-link" href="/dashboard">
          {username ? "My dashboard ↗" : "Sign in ↗"}
        </Link>
        {!username && <Link href="/signup">Create account</Link>}
        {username && (
          <button
            className="nav-logout"
            disabled={busy}
            onClick={() => void logout()}
          >
            {busy ? "Logging out…" : "Log out"}
          </button>
        )}
      </nav>
      {(platform.notice || platform.orders_enabled === false) && <p className="platform-public-notice" role="status">{platform.notice}{platform.orders_enabled === false && " New orders are temporarily paused."}{platform.support_email && <> <a href={`mailto:${platform.support_email}`}>Contact support</a></>}</p>}
      {error && (
        <p className="nav-error">
          {error}
        </p>
      )}
    </header>
  );
}
export default function Marketplace() {
  const [featured, setFeatured] = useState<ShowcaseProduct[]>([]);
  const [featuredError, setFeaturedError] = useState("");
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredRetry, setFeaturedRetry] = useState(0);
  useEffect(() => {
    let live = true;
    if (featuredRetry) setFeaturedLoading(true);
    const refresh = () => { if (!document.hidden) void api<{ products: ShowcaseProduct[] }>("featured-products/").then(data => { if (live) { setFeatured(data.products || []); setFeaturedError(""); } }).catch(() => { if (live) setFeaturedError("Product images could not load. Please try again."); }).finally(() => { if (live) setFeaturedLoading(false); }); };
    refresh(); const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [featuredRetry]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All shops");
  const [error, setError] = useFeedback("error");
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api<{ shops: ShopSummary[]; next_page?: number }>("shops/?q=" + encodeURIComponent(query))
      .then((data) => { setShops(data.shops); setNextPage(data.next_page || null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [query, setError]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);
  const filtered = shops.filter(
    (s) =>
      [s.name, ...s.categories, ...s.preview_products.map((p) => p.name)]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (category === "All shops" || s.categories.includes(category)),
  );
  return (
    <div className="marketplace marketplace-v2 landing-page" id="top">
      <ShopHeader />
      <main className="market-main">
        <section className="market-hero" aria-label="Discover DuukaYo">
          <div className="hero-copy">
            <span className="landing-kicker">YOUR LOCAL MARKETPLACE</span>
            <h1>
              Discover<br /><em>more.</em>
            </h1>
            <p>
              Shop local. Order for pickup or delivery.
            </p>
            <div className="landing-actions"><a className="market-cta" href="#shops">Browse shops <span>↗</span></a><Link href="/cart">View cart →</Link></div>
            <div className="hero-proof">
              <span>✓ No account needed</span>
              <span>✓ Pay at fulfilment</span>
            </div>
          </div>
          <div className="landing-featured">
            {featuredError && <p role="alert">{featuredError} <button type="button" onClick={() => setFeaturedRetry(value => value + 1)}>Try again</button></p>}
            {featuredLoading && !featured.length ? <p role="status">Loading product images…</p> : (!featuredError || featured.length > 0) && <ProductShowcase products={featured} />}
          </div>
        </section>
        <CustomerLibrary />
        <section id="shops" className="shop-discovery">
          <div className="discovery-heading">
            <div><h2>Explore shops</h2><span className="landing-shop-count">{loading ? "Loading shops…" : `${filtered.length} ${filtered.length === 1 ? "shop" : "shops"}${nextPage ? " loaded" : ""}`}</span></div>
            <label className="landing-shop-search"><span className="sr-only">Search shops</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" placeholder="Search shops, products or categories" value={query} onChange={e => setQuery(e.target.value)} /></label>
          </div>
          {loading && (
            <p role="status" className="empty">
              Loading shops…
            </p>
          )}
          {error && (
            <div className="error">
              {error}
              <button className="secondary" onClick={load}>
                Try again
              </button>
            </div>
          )}
          {!loading && !error && !filtered.length && (
            <div className="market-empty">
              <h3>
                {query || category !== "All shops"
                  ? "No shops match your search"
                  : "Good things are on their way"}
              </h3>
              <p>
                {query
                  ? "Try a shop name or another essential."
                  : "Shops will appear here when they publish their products."}
              </p>
              {(query || category !== "All shops") && <button onClick={() => { setQuery(""); setCategory("All shops"); }}>Clear filters</button>}
            </div>
          )}
          <div className="discovery-categories" aria-label="Shop categories">
            {[
              "All shops",
              ...new Set(shops.flatMap((shop) => shop.categories)),
            ].map((name) => (
              <button
                key={name}
                aria-pressed={category === name}
                onClick={() => setCategory(name)}
              >
                {name === "All shops" ? "◈ " : "+ "}
                {name}
              </button>
            ))}
          </div>
          <div className="shop-grid">
            {filtered.map((shop, i) => (
              <Link
                className={`shop-card shop-tone-${i % 3}`}
                href={`/shop/${shop.slug}`}
                key={shop.slug}
              >
                <div className="shop-card-art">
                  {shop.preview_products.slice(0, 3).map((p) => (
                    <div key={p.id}>
                      <ProductImage src={p.image} name={p.name} />
                    </div>
                  ))}
                  <span className="shop-delivery">
                    {shop.delivery_enabled
                      ? "Pickup + delivery"
                      : "Pickup available"}
                  </span>
                </div>
                <div className="shop-card-copy">
                  <small>
                    {shop.categories.slice(0, 2).join(" · ") ||
                      "Everyday essentials"}
                  </small>
                  <h3>
                    {shop.name}
                    <span>↗</span>
                  </h3>
                  <p>{shop.product_count} products to explore</p>
                  <div className="shop-card-bottom">
                    <span>
                      {shop.delivery_enabled
                        ? `Delivery ${money(shop.delivery_fee, shop.currency)}`
                        : "Order ahead. Collect in store."}
                    </span>
                    <strong>Visit shop →</strong>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
        {nextPage && <button disabled={loading} onClick={async () => {
          setLoading(true);
          try { const result = await api<{ shops: ShopSummary[]; next_page: number | null }>("shops/?page=" + nextPage + "&q=" + encodeURIComponent(query));
            setShops(previous => [...previous, ...result.shops]); setNextPage(result.next_page);
          } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
        }}>Explore more shops</button>}
      </main>
      <footer className="market-footer landing-footer">
        <div><Link className="brand" href="/">◈ DuukaYo</Link><p>Local shops. One marketplace.</p></div>
        <div className="landing-footer-owner"><span className="landing-owner-logo"><Image src="/logo.png" alt="" width={1024} height={1024} /></span><p>Crafted by <strong>Perpetual Labs</strong></p></div>
        <nav aria-label="Footer navigation"><Link href="/wishlist">Wishlist</Link><Link href="/cart">Cart</Link><Link href="/dashboard">Manage your shop ↗</Link></nav>
      </footer>
    </div>
  );
}
