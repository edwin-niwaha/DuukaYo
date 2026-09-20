"use client";
import { useState } from "react";
import { api, money, Product, Customer, Sale, Membership } from "@/lib/api";
import Receipt from "./Receipt";
export default function Checkout({
  products,
  customers,
  membership,
  reload,
}: {
  products: Product[];
  customers: Customer[];
  membership: Membership;
  reload: () => Promise<void>;
}) {
  const [cart, setCart] = useState<Record<number, number>>({}),
    [query, setQuery] = useState(""),
    [method, setMethod] = useState("cash"),
    [tendered, setTendered] = useState(""),
    [customer, setCustomer] = useState(""),
    [discount, setDiscount] = useState("0"),
    [receipt, setReceipt] = useState<Sale | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID());
  const lines = products.filter((p) => cart[p.id]);
  const total =
    lines.reduce((n, p) => n + p.price * cart[p.id], 0) - Number(discount);
  const currency = membership.business.currency;
  function add(p: Product) {
    setKey(crypto.randomUUID());
    setReceipt(null);
    setCart({ ...cart, [p.id]: (cart[p.id] || 0) + 1 });
  }
  async function pay() {
    setBusy(true);
    setError("");
    try {
      const sale = await api<Sale>(
        `businesses/${membership.business.id}/sales/`,
        {
          client_id: key,
          branch: membership.branch,
          customer: customer ? Number(customer) : null,
          method,
          tendered: method === "cash" ? Number(tendered) : total,
          lines: lines.map((p, i) => ({
            product: p.id,
            quantity: cart[p.id],
            price: p.price,
            discount: i === 0 ? Number(discount) : 0,
          })),
        },
      );
      setReceipt(sale);
      setCart({});
      setTendered("");
      setDiscount("0");
      setKey(crypto.randomUUID());
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="checkout-layout">
        <section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const p = products.find(
                (p) => p.barcode === query || p.sku === query,
              );
              if (p) {
                add(p);
                setQuery("");
              }
            }}
          >
            <input
              autoFocus
              aria-label="Search or scan"
              value={query}
              placeholder="Search products or scan a barcode ↵"
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <div className="product-grid">
            {products
              .filter(
                (p) =>
                  p.active &&
                  (p.name + " " + p.sku + " " + p.barcode)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((p, i) => (
                <button
                  key={p.id}
                  className="product-card"
                  disabled={busy}
                  onClick={() => add(p)}
                >
                  <span className={"product-art tone-" + (i % 4)}>
                    {["◒", "▤", "◈", "▥"][i % 4]}
                  </span>
                  <strong>{p.name}</strong>
                  <span>{money(p.price, currency)}</span>
                  <small
                    className={
                      p.quantity - p.reserved <= p.low_stock_threshold
                        ? "low"
                        : ""
                    }
                  >
                    {p.quantity - p.reserved} available
                  </small>
                </button>
              ))}
          </div>
          {!products.length && (
            <p className="empty">
              Add products in Catalog, then receive opening stock.
            </p>
          )}
        </section>
        <aside className="panel cart">
          <div className="section-heading">
            <h2>Current sale</h2>
            <span className="badge">{lines.length} items</span>
          </div>
          {!lines.length && (
            <p className="empty">Tap a product to start a sale.</p>
          )}
          {lines.map((p) => (
            <div className="cart-line" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <small>{money(p.price, currency)}</small>
              </div>
              <input
                aria-label={"Quantity of " + p.name}
                type="number"
                min="0"
                step="1"
                disabled={busy}
                value={cart[p.id]}
                onChange={(e) => {
                  setCart({ ...cart, [p.id]: Number(e.target.value) });
                  setKey(crypto.randomUUID());
                }}
              />
            </div>
          ))}
          <fieldset
            disabled={busy}
            onChange={() => setKey(crypto.randomUUID())}
          >
            <label>
              Customer
              <select
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
              >
                <option value="">Walk-in customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {membership.role !== "cashier" && (
              <label>
                Discount on first line ({currency})
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </label>
            )}
            <label>
              Payment method
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="manual_mtn">
                  MTN MoMo · manual, unverified
                </option>
                <option value="manual_airtel">
                  Airtel Money · manual, unverified
                </option>
              </select>
            </label>
            {method === "cash" ? (
              <label>
                Cash received
                <input
                  type="number"
                  min={total}
                  step="1"
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                />
              </label>
            ) : (
              <p className="notice">
                Confirm funds independently before recording. This is not
                provider verification.
              </p>
            )}
          </fieldset>
          <div className="total">
            <span>Total due</span>
            <strong>{money(total, currency)}</strong>
          </div>
          <p className="muted">
            Change: {money(Math.max(0, Number(tendered) - total), currency)}
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="wide"
            disabled={
              busy ||
              !lines.length ||
              total < 0 ||
              (method === "cash" && Number(tendered) < total)
            }
            onClick={pay}
          >
            {busy ? "Completing…" : "Complete sale →"}
          </button>
          <p className="muted">Connected checkout · server-validated prices</p>
        </aside>
      </div>
      {receipt && <Receipt sale={receipt} shop={membership.business.name} />}
    </>
  );
}
