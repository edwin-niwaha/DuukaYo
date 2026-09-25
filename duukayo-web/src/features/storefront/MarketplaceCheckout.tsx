"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, money } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import { definiteRejection } from "@/lib/order-attempt";
import { cartKeys, cartLines, cartChanged, syncCart, migrateCartStorage } from "@/lib/shopping-cart";
import { rememberOrder } from "./CustomerLibrary";
import { ShopHeader } from "./Marketplace";
import CartItems from "./CartItems";

type Quote = { id: number; expires_at: string; total: number; currency: string; groups: { shop: string; total: number; delivery_fee: number; lines: { product: number; name: string; quantity: number; price: number }[] }[] };
type Cart = { id: number; token: string };
type Attempt = { cart: Cart; body: { client_id: string; quote: number }; carts: Record<string, string> };
type Result = { orders: { id: number; token: string; shop: string; total: number }[]; total: number; currency: string };
const pendingKey = "duukayo-marketplace-pending";
export default function MarketplaceCheckout() {
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [delivery, setDelivery] = useState(false);
  const [address, setAddress] = useState("");
  const [error, setError] = useFeedback("error");
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [reviewedCarts, setReviewedCarts] = useState<Record<string, string>>({});
  const running = useRef(false);
  useEffect(() => {
    try { migrateCartStorage(); const saved = localStorage.getItem(pendingKey); if (saved) setPending(JSON.parse(saved)); }
    catch { setStorageError(true); setError("Saved checkout could not be read. Contact the shops before placing another order."); }
    const changed = () => setQuote(null);
    window.addEventListener("cart-change", changed);
    window.addEventListener("cart-refreshed", changed);
    return () => { window.removeEventListener("cart-change", changed); window.removeEventListener("cart-refreshed", changed); };
  }, [setError]);
  async function review() {
    if (running.current || pending || storageError) return;
    running.current = true; setBusy(true); setError(""); setQuote(null);
    try {
      await syncCart();
      const lines = cartLines().map(({ product, quantity }) => ({ product, quantity }));
      if (!lines.length) throw new Error("Your cart is empty. Add items from a shop first.");
      const next = cart || await api<Cart>("carts/", {});
      setCart(next);
      const carts = Object.fromEntries(cartKeys().map(key => [key, localStorage.getItem(key) || "{}"]));
      const headers = { "X-Cart-Token": next.token };
      await api(`carts/${next.id}/`, { lines }, "PUT", headers);
      const value = await api<Quote>(`carts/${next.id}/quotes/`, { name, phone, delivery, address }, "POST", headers);
      if (Object.entries(carts).some(([key, saved]) => localStorage.getItem(key) !== saved)) throw new Error("Your cart changed. Please review it again.");
      setReviewedCarts(carts); setQuote(value);
    } catch (e) { setError((e as Error).message); }
    finally { running.current = false; setBusy(false); }
  }
  async function complete() {
    if (running.current || (!pending && (!quote || !cart))) return;
    running.current = true; setBusy(true); setError("");
    const attempt = pending || { cart: cart!, body: { client_id: crypto.randomUUID(), quote: quote!.id }, carts: reviewedCarts };
    try {
      if (!pending && Object.entries(attempt.carts).some(([key, saved]) => localStorage.getItem(key) !== saved)) throw new Error("Your cart changed. Review current prices again.");
      localStorage.setItem(pendingKey, JSON.stringify(attempt)); setPending(attempt);
      const confirmed = await api<Result>(`carts/${attempt.cart.id}/checkout/`, attempt.body, "POST", { "X-Cart-Token": attempt.cart.token });
      setResult(confirmed);
      for (const order of confirmed.orders) rememberOrder(order.token);
      for (const [key, saved] of Object.entries(attempt.carts)) {
        if (localStorage.getItem(key) === saved) { localStorage.removeItem(key); localStorage.removeItem(key + ":prices"); }
      }
      cartChanged(); localStorage.removeItem(pendingKey); setPending(null); setQuote(null);
    } catch (e) {
      if (definiteRejection(e) && ![401, 403, 404].includes((e as { status: number }).status)) { localStorage.removeItem(pendingKey); setPending(null); setQuote(null); }
      setError((e as Error).message);
    } finally { running.current = false; setBusy(false); }
  }
  return <><ShopHeader /><main className="collection-page marketplace-checkout">
    <header className="collection-heading"><h1>Cart</h1><div className="collection-links"><Link href="/wishlist">Wishlist</Link><Link href="/#shops">Continue shopping →</Link></div></header>
    {error && <p className="error" role="alert">{error}</p>}
    {result ? <section className="marketplace-confirmation"><span className="checkout-success-mark" aria-hidden="true">✓</span><h2>Your orders are with the shops</h2><p>{money(result.total, result.currency)} · Payment due at fulfilment</p>{result.orders.map(order => <p key={order.id}><Link className="checkout-order-link" href={`/order/${order.token}`}>Track {order.shop} · Order #{order.id} →</Link></p>)}<Link href="/">Continue shopping →</Link></section> : <div className={"collection-cart-layout" + (itemCount === 0 && !pending ? " is-empty" : "")}>
      <CartItems locked={busy || !!pending} onCountChange={setItemCount} />
      {(itemCount !== 0 || pending) && <aside className="collection-checkout"><div className="collection-section-title"><h2>Checkout</h2><span>{quote ? "02" : "01"} / 02</span></div>
        <form onSubmit={e => { e.preventDefault(); void review(); }}><fieldset disabled={busy || !!pending || storageError} onChange={() => setQuote(null)}>
          <label>Your name<input required maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /></label>
          <label>Phone number<input required type="tel" maxLength={25} autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +256 700 000 000" /></label>
          <label className="collection-delivery"><input type="checkbox" checked={delivery} onChange={e => setDelivery(e.target.checked)} /><span>Delivery<small>Leave off for pickup.</small></span></label>
          {delivery && <label>Delivery address<input required maxLength={250} autoComplete="street-address" value={address} onChange={e => setAddress(e.target.value)} /></label>}
          <button type="submit">{busy ? "Checking…" : "Review order →"}</button>
        </fieldset></form>
        {quote && <section className="collection-quote"><h3>Review your order</h3>{quote.groups.map(group => <article key={group.shop}><h4>{group.shop}</h4>{group.lines.map(line => <p key={line.product}><span>{line.quantity} × {line.name}</span><strong>{money(line.quantity * line.price, quote.currency)}</strong></p>)}<p><span>Delivery</span><span>{money(group.delivery_fee, quote.currency)}</span></p></article>)}<div className="collection-total"><span>Total</span><strong>{money(quote.total, quote.currency)}</strong></div><small>Valid until {new Date(quote.expires_at).toLocaleTimeString()}. Stock is reserved when you place the order.</small></section>}
        {(quote || pending) && <button className="collection-confirm" disabled={busy} onClick={() => void complete()}>{busy ? "Confirming…" : pending ? "Recover pending checkout" : "Place all orders"}</button>}
        <p className="collection-footnote">Pay at pickup or delivery. No account required.</p>
      </aside>}
    </div>}
  </main></>;
}
