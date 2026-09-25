"use client";
import { useFeedback } from "../../lib/feedback";

import { productName } from "@/lib/variants";
import { useEffect, useRef, useState } from "react";
import { api, money, Product, Customer, Sale, Membership } from "@/lib/api";
import { definiteRejection } from "@/lib/order-attempt";
import { ProductImage } from "../storefront/ProductShowcase";
import Receipt from "./Receipt";
import SearchField from "@/components/SearchField";
type Draft = { id: string; cart: Record<number, number>; customer: string; discount: string };
type SalePayload = { payments?: { method: string; amount: number; tendered: number; reference?: string }[]; client_id: string; branch: number; customer: number | null; method: string; tendered: number; reference: string; lines: { product: number; quantity: number; price: number; discount: number }[] };
export default function Checkout({ products, customers, membership, reload, cashierId, inventoryReady = true }: {
  products: Product[]; customers: Customer[]; membership: Membership; reload: () => Promise<void>; cashierId: number; inventoryReady?: boolean;
}) {
  const [cart, setCart] = useState<Record<number, number>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [method, setMethod] = useState("cash");
  const [cashPart, setCashPart] = useState("");
  const [splitProvider, setSplitProvider] = useState("manual_mtn");
  const [tendered, setTendered] = useState("");
  const [customer, setCustomer] = useState("");
  const [discount, setDiscount] = useState("0");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [error, setError] = useFeedback("error");
  const [notice, setNotice] = useFeedback("info");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [attempt, setAttempt] = useState<SalePayload | null>(null);
  const saving = useRef(false);
  const scope = [cashierId, membership.business.id, membership.branch].join(":");
  const draftKey = "duukayo-held:" + scope;
  const attemptKey = "duukayo-sale:" + scope;
  useEffect(() => {
    try {
      const held = JSON.parse(localStorage.getItem(draftKey) || "[]");
      setDrafts(Array.isArray(held) ? held.filter(d => d && typeof d.id === "string" && d.cart) : []);
      const pending = JSON.parse(localStorage.getItem(attemptKey) || "null");
      if (pending && (!pending.client_id || !Array.isArray(pending.lines))) throw new Error("Saved sale needs review before another sale can start.");
      setAttempt(pending); setReady(true);
    } catch (e) { setError((e as Error).message); }
  }, [draftKey, attemptKey, setError]);
  const lines = products.filter(p => cart[p.id] > 0);
  const total = lines.reduce((n, p) => n + p.price * cart[p.id], 0) - Number(discount);
  const currency = membership.business.currency;
  const locked = busy || !!attempt || !ready || !inventoryReady;
  function quantity(p: Product, value: number) {
    if (locked) return;
    setCart(old => ({ ...old, [p.id]: Math.max(0, Math.min(10000, p.quantity - p.reserved, Math.floor(value) || 0)) }));
    setReceipt(null);
  }
  function saveDrafts(next: Draft[]) { localStorage.setItem(draftKey, JSON.stringify(next)); setDrafts(next); }
  function hold() {
    if (locked || !lines.length) return;
    try {
      if (drafts.length >= 10) throw new Error("Resume a held sale before holding another.");
      saveDrafts([...drafts, { id: crypto.randomUUID(), cart, customer, discount }]);
      setCart({}); setTendered(""); setDiscount("0"); setCustomer(""); setNotice("Sale held on this device. Stock is not reserved.");
    } catch (e) { setError((e as Error).message); }
  }
  function resume(draft: Draft) {
    if (locked) return;
    if (lines.length && !window.confirm("Replace the current unsaved sale with this held sale?")) return;
    try {
      const restored: Record<number, number> = {};
      for (const p of products) if (p.active && Number.isInteger(draft.cart[p.id]) && draft.cart[p.id] > 0)
        restored[p.id] = Math.max(0, Math.min(draft.cart[p.id], p.quantity - p.reserved, 10000));
      saveDrafts(drafts.filter(d => d.id !== draft.id));
      setCart(restored); setCustomer(customers.some(c => String(c.id) === draft.customer) ? draft.customer : "");
      setDiscount(membership.role === "cashier" ? "0" : draft.discount); setTendered("");
      setNotice("Held sale restored with current prices and available stock. Review before payment.");
    } catch (e) { setError((e as Error).message); }
  }
  async function pay(recover = false) {
    if (saving.current || !ready) return;
    if (attempt && !recover) return;
    if (!recover && (!lines.length || !Number.isSafeInteger(total) || total < 0 ||
      !Number.isSafeInteger(Number(discount)) || Number(discount) < 0 ||
      (method === "cash" && (!Number.isSafeInteger(Number(tendered)) || Number(tendered) < total)) ||
      (method === "split" && (!Number.isSafeInteger(Number(cashPart)) || Number(cashPart) <= 0 || Number(cashPart) >= total)) ||
      (method !== "cash" && (!confirmed || !reference.trim())))) {
      setError("Review quantities, discount, cash received or the manual payment reference."); return;
    }
    saving.current = true; setBusy(true); setError("");
    let result: Sale | null = null;
    try {
      const payload = attempt || {
        client_id: crypto.randomUUID(), branch: membership.branch,
        customer: customer ? Number(customer) : null, method,
        ...(method === "split" ? { payments: [
          { method: "cash", amount: Number(cashPart), tendered: Number(cashPart) },
          { method: splitProvider, amount: total - Number(cashPart), tendered: total - Number(cashPart), reference: reference.trim() },
        ] } : {}),
        tendered: method === "cash" ? Number(tendered) : total, reference: method === "cash" ? "" : reference.trim(),
        lines: lines.map((p, i) => ({ product: p.id, quantity: cart[p.id], price: p.price, discount: i === 0 ? Number(discount) : 0 })),
      };
      localStorage.setItem(attemptKey, JSON.stringify(payload)); setAttempt(payload);
      result = await api<Sale>("businesses/" + membership.business.id + "/sales/", payload);
      setReceipt(result); setCart({}); setTendered(""); setDiscount("0"); setReference(""); setConfirmed(false);
      try { localStorage.removeItem(attemptKey); } catch { /* Retry resolves to the same sale. */ }
      setAttempt(null); setNotice("Sale completed. Receipt is ready.");
    } catch (e) {
      if (definiteRejection(e)) { localStorage.removeItem(attemptKey); setAttempt(null); }
      setError((e as Error).message);
    } finally { saving.current = false; setBusy(false); }
    if (result) {
      try { await reload(); } catch { setNotice("Sale completed. Products could not refresh; the receipt below is confirmed. Refresh before the next sale."); }
    }
  }
  return <>
    {notice && <p className="notice">{notice}</p>}
    {attempt && <div className="notice"><strong>A sale needs confirmation.</strong><p>Recover this transaction before recording another payment.</p>
      <button disabled={busy} onClick={() => void pay(true)}>Recover sale</button></div>}
    {drafts.length > 0 && <div className="held-sales"><strong>Held sales</strong>{drafts.map((draft, i) => <button className="secondary" disabled={locked} key={draft.id} onClick={() => resume(draft)}>Resume sale {i + 1}</button>)}</div>}
    <div className="checkout-layout"><section>
      <form onSubmit={e => { e.preventDefault(); const p = products.find(p => p.active && (p.barcode === query || p.sku === query)); if (p) { quantity(p, (cart[p.id] || 0) + 1); setQuery(""); } }}>
        <SearchField autoFocus label="Search or scan" placeholder="Search products or scan a barcode ↵" value={query} onChange={e => setQuery(e.target.value)} />
      </form>
      <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>
        {[...new Set(products.map(p => p.category).filter(Boolean))].map(id => <option key={id} value={String(id)}>{products.find(p => p.category === id)?.category_name || "Other essentials"}</option>)}
      </select></label>
      <div className="product-grid">{products.filter(p => p.active && (!category || String(p.category) === category) && (productName(p) + " " + p.sku + " " + p.barcode).toLowerCase().includes(query.toLowerCase())).map(p =>
        <button className="product-card" key={p.id} disabled={locked || (cart[p.id] || 0) >= p.quantity - p.reserved} onClick={() => quantity(p, (cart[p.id] || 0) + 1)}>
          <span className="pos-product-art"><ProductImage src={p.image} name={productName(p)} /></span><strong>{productName(p)}</strong><span>{money(p.price, currency)}</span><small>{Math.max(0, p.quantity - p.reserved)} available</small>
        </button>)}</div>
      {!products.length && <p className="empty">{inventoryReady ? "Add products in Catalog, then receive opening stock." : "Loading products and stock…"}</p>}
    </section><aside className="panel cart">
      <div className="section-heading"><h2>Current sale</h2><span className="badge">{lines.reduce((n,p) => n + cart[p.id],0)} items</span></div>
      {!lines.length && <p className="empty">Tap a product to start a sale.</p>}
      {lines.map(p => <div className="cart-line" key={p.id}><div><strong>{productName(p)}</strong><small>{money(p.price, currency)}</small></div>
        <input aria-label={"Quantity of " + productName(p)} type="number" min="0" max={Math.max(0, p.quantity - p.reserved)} step="1" disabled={locked} value={cart[p.id]} onChange={e => quantity(p, Number(e.target.value))} />
        <button className="secondary" aria-label={"Remove " + productName(p)} disabled={locked} onClick={() => quantity(p, 0)}>×</button>
      </div>)}
      <button className="secondary" disabled={locked || !lines.length} onClick={hold}>Hold sale</button>
      <fieldset disabled={locked}>
        <label>Customer<select value={customer} onChange={e => setCustomer(e.target.value)}><option value="">Walk-in customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {membership.role !== "cashier" && <label>Discount on first line ({currency})<input type="number" min="0" max={lines[0] ? lines[0].price * cart[lines[0].id] : 0} step="1" value={discount} onChange={e => setDiscount(e.target.value)} /></label>}
        <label>Payment method<select value={method} onChange={e => { setMethod(e.target.value); setConfirmed(false); }}>
          <option value="cash">Cash</option><option value="manual_mtn">MTN MoMo · manual, unverified</option><option value="manual_airtel">Airtel Money · manual, unverified</option><option value="split">Split · cash + mobile money</option>
        </select></label>
        {method === "split" && <><label>Cash portion<input type="number" min="1" max={Math.max(1, total - 1)} step="1" value={cashPart} onChange={e => setCashPart(e.target.value)} /></label><label>Mobile money provider<select value={splitProvider} onChange={e => setSplitProvider(e.target.value)}><option value="manual_mtn">MTN MoMo</option><option value="manual_airtel">Airtel Money</option></select></label><p>Mobile money portion: {money(Math.max(0, total - Number(cashPart)), currency)}</p></>}
        {method === "cash" ? <label>Cash received<input type="number" min={total} step="1" value={tendered} onChange={e => setTendered(e.target.value)} /></label> :
          <><label>Payment reference<input maxLength={100} value={reference} onChange={e => setReference(e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I checked the funds independently.</label><p className="notice">Manual record; not provider verification.</p></>}
      </fieldset>
      <div className="total"><span>Total due</span><strong>{money(total, currency)}</strong></div>
      {method === "cash" && <p className="muted">Change: {money(Math.max(0, Number(tendered) - total), currency)}</p>}
      {error && <p className="error">{error}</p>}
      <button className="wide" disabled={locked || !lines.length || total < 0 || (method === "cash" ? Number(tendered) < total : !confirmed || !reference.trim())} onClick={() => void pay()}>{busy ? "Completing…" : "Complete sale →"}</button>
      <p className="muted">Connected checkout · server-validated prices</p>
    </aside></div>
    {receipt && <Receipt sale={receipt} shop={membership.business.name} />}
  </>;
}
