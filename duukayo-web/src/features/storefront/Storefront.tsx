"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, money, Business } from "@/lib/api";
type Item = { id: number; name: string; price: number; available: number };
type Shop = { shop: Business; products: Item[]; availability_notice: string };
export default function Storefront({ slug }: { slug: string }) {
  const router = useRouter();
  const [data, setData] = useState<Shop | null>(null),
    [cart, setCart] = useState<Record<number, number>>({}),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [delivery, setDelivery] = useState(false),
    [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    api<Shop>(`shop/${encodeURIComponent(slug)}/`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [slug]);
  const lines = data?.products.filter((p) => cart[p.id]) || [];
  const total =
    lines.reduce((n, p) => n + p.price * cart[p.id], 0) +
    (delivery ? data?.shop.delivery_fee || 0 : 0);
  async function place(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ token: string }>(
        `shop/${encodeURIComponent(slug)}/`,
        {
          client_id: key,
          name: form.get("name"),
          phone: form.get("phone"),
          address: form.get("address") || "",
          delivery,
          lines: lines.map((p) => ({
            product: p.id,
            quantity: cart[p.id],
            price: p.price,
          })),
        },
      );
      router.push("/order/" + result.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="store">
      <header>
        <Link className="brand" href="/">
          ◈ DuukaYo
        </Link>
        <span>Local shops. Everyday essentials.</span>
      </header>
      <main>
        <section className="store-hero">
          <p className="eyebrow">Your neighbourhood, online</p>
          <h1>{data?.shop.name || "Welcome to the shop"}</h1>
          <p>Pick your essentials. We’ll get them ready.</p>
          <span className="badge">Pickup available</span>
          {data?.shop.delivery_enabled && (
            <span className="badge">Shop delivery</span>
          )}
          <p>{data?.shop.contact}</p>
        </section>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="checkout-layout">
          <section>
            <input
              aria-label="Search products"
              placeholder="Search your everyday essentials…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="product-grid">
              {data?.products
                .filter((p) =>
                  p.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((p, i) => (
                  <button
                    className="product-card"
                    key={p.id}
                    disabled={!p.available || busy}
                    onClick={() => {
                      setKey(crypto.randomUUID());
                      setCart({
                        ...cart,
                        [p.id]: Math.min(p.available, (cart[p.id] || 0) + 1),
                      });
                    }}
                  >
                    <span className={"product-art tone-" + (i % 4)}>
                      {["◒", "▤", "◈", "▥"][i % 4]}
                    </span>
                    <strong>{p.name}</strong>
                    <span>{money(p.price, data.shop.currency)}</span>
                    <small>
                      {p.available ? "Add to bag +" : "Currently unavailable"}
                    </small>
                  </button>
                ))}
            </div>
            {data && data.products.length === 0 && (
              <p className="empty">
                This shop is preparing its catalog. Please check back soon.
              </p>
            )}
          </section>
          <aside className="panel cart">
            <p className="eyebrow">A little bag of essentials</p>
            <h2>Your order</h2>
            {!lines.length && (
              <p className="empty">Choose something from the shelves.</p>
            )}
            {lines.map((p) => (
              <div className="cart-line" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <small>{money(p.price)}</small>
                </div>
                <input
                  aria-label={"Quantity of " + p.name}
                  type="number"
                  min="0"
                  max={p.available}
                  value={cart[p.id]}
                  disabled={busy}
                  onChange={(e) => {
                    setKey(crypto.randomUUID());
                    setCart({ ...cart, [p.id]: Number(e.target.value) });
                  }}
                />
              </div>
            ))}
            <form onSubmit={place} onChange={() => setKey(crypto.randomUUID())}>
              <fieldset disabled={busy}>
                <label>
                  Your name
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  Phone number
                  <input
                    name="phone"
                    type="tel"
                    required
                    placeholder="+256 7…"
                  />
                </label>
                {data?.shop.delivery_enabled && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={delivery}
                      onChange={(e) => setDelivery(e.target.checked)}
                    />
                    Delivery · {money(data.shop.delivery_fee)}
                  </label>
                )}
                {delivery && (
                  <label>
                    Delivery address
                    <input name="address" required maxLength={250} />
                  </label>
                )}
                <div className="total">
                  <span>Total</span>
                  <strong>{money(total, data?.shop.currency)}</strong>
                </div>
                <button className="wide" disabled={!lines.length || busy}>
                  {busy ? "Placing order…" : "Place order →"}
                </button>
              </fieldset>
              <p className="muted">
                Pay at pickup or arrange payment directly with the shop. No
                online payment is collected here.
              </p>
            </form>
            <p className="notice">{data?.availability_notice}</p>
          </aside>
        </div>
      </main>
      <footer>DuukaYo · Built by Perpetual Labs</footer>
    </div>
  );
}
