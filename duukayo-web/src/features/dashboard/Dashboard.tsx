"use client";
import Link from "next/link";
import GoogleSignIn from "../auth/GoogleSignIn";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  money,
  Profile,
  Membership,
  Product,
  Customer,
  Sale,
  Order,
  Report,
  Business,
} from "@/lib/api";
import Checkout from "../checkout/Checkout";
import Receipt from "../checkout/Receipt";
type Tab =
  | "Overview"
  | "Checkout"
  | "Catalog"
  | "Inventory"
  | "Orders"
  | "Customers"
  | "Sales"
  | "Settings"
  | "Team";
type Category = { id: number; name: string };
type Staff = { id: number; user__username: string; role: string };
type Movement = {
  id: number;
  stock__product__name: string;
  delta: number;
  reason: string;
  created_at: string;
};
export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [selected, setSelected] = useState(0),
    [tab, setTab] = useState<Tab>("Overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [register, setRegister] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [sales, setSales] = useState<Sale[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [report, setReport] = useState<Report | null>(null),
    [staff, setStaff] = useState<Staff[]>([]),
    [movements, setMovements] = useState<Movement[]>([]),
    [receipt, setReceipt] = useState<Sale | null>(null),
    [history, setHistory] = useState<Sale[] | null>(null);
  const membership: Membership | undefined = profile?.memberships[selected];
  const business = membership?.business;
  const base = business ? `businesses/${business.id}/` : "";
  const manage = membership?.role !== "cashier";
  const loadProfile = useCallback(async () => {
    try {
      setProfile(await api<Profile>("auth/me/"));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);
  const reload = useCallback(async () => {
    if (!base) return;
    const [p, c, s, o, v] = await Promise.all([
      api<Product[]>(base + "products/"),
      api<Customer[]>(base + "customers/"),
      api<Sale[]>(base + "sales/"),
      api<Order[]>(base + "orders/"),
      api<Movement[]>(base + "stock/"),
    ]);
    setCategories(await api<Category[]>(base + "categories/"));
    setProducts(p);
    setCustomers(c);
    setSales(s);
    setOrders(o);
    setMovements(v);
    if (manage) setReport(await api<Report>(base + "reports/"));
    if (membership?.role === "owner")
      setStaff(await api<Staff[]>(base + "staff/"));
  }, [base, manage, membership?.role]);
  useEffect(() => {
    setProducts([]);
    setCustomers([]);
    setSales([]);
    setOrders([]);
    setReport(null);
    setReceipt(null);
    setHistory(null);
    void reload().catch((e) => setError(e.message));
  }, [reload]);
  async function run(
    work: () => Promise<unknown>,
    message = "Saved successfully",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await reload();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function auth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      if (register) await api("auth/register/", data);
      await api("auth/session/", {
        username: data.username,
        password: data.password,
      });
      await loadProfile();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <main className="loading">◈ Opening DuukaYo…</main>;
  if (!profile)
    return (
      <main className="auth">
        <section className="auth-story">
          <Link className="brand" href="/">
            ◈ DuukaYo
          </Link>
          <p className="eyebrow">Made for the way you trade</p>
          <h1>
            Your shop.
            <br />A little more
            <br />
            <em>in sync.</em>
          </h1>
          <p>
            From the first sale to the last receipt.
            <br />A simpler day starts here.
          </p>
          <div className="auth-note">
            01 / SELL WITH CONFIDENCE
            <br />
            <br />
            Cash, stock and online orders.
            <br />
            One clear picture.
          </div>
          <footer>By Perpetual Labs · Built for Uganda</footer>
        </section>
        <section className="auth-form">
          <p className="eyebrow">Your business, at a glance</p>
          <h2>{register ? "Start your shop" : "Welcome back."}</h2>
          <p className="muted">
            {register
              ? "Create an owner account and your first branch."
              : "Sign in to open your workspace."}
          </p>
          <GoogleSignIn
            onSuccess={loadProfile}
            onError={setError}
            disabled={busy}
            onBusyChange={setBusy}
          />
          <form onSubmit={auth}>
            <label>
              Username
              <input name="username" autoComplete="username" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 10 : undefined}
                required
              />
            </label>
            {register && (
              <>
                <label>
                  Email for Google sign-in (optional)
                  <input name="email" type="email" autoComplete="email" />
                </label>
                <label>
                  Business name
                  <input name="name" required />
                </label>
                <label>
                  Shop URL name
                  <input
                    name="slug"
                    required
                    pattern="[a-z0-9-]+"
                    placeholder="your-shop"
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="wide" disabled={busy}>
              {busy ? "Opening…" : register ? "Create business →" : "Sign in →"}
            </button>
          </form>
          <button
            className="link-button"
            onClick={() => setRegister(!register)}
          >
            {register
              ? "Already have an account? Sign in"
              : "New here? Create your business"}
          </button>
          <p className="muted small">
            Development demo after seeding:
            <br />
            kampala-corner-owner / DemoOnly!2026
          </p>
        </section>
      </main>
    );
  if (!membership || !business)
    return (
      <main className="panel">
        <h1>Set up your workspace</h1>
        <p>Create your business, or contact its owner to arrange access.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            void run(async () => {
              await api("businesses/", data);
              await loadProfile();
            }, "Business created");
          }}
        >
          <label>
            Business name
            <input name="name" required maxLength={120} />
          </label>
          <label>
            Shop URL name
            <input name="slug" required pattern="[a-z0-9-]+" maxLength={50} />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={busy}>Create business</button>
        </form>
        <button
          className="link-button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api("auth/session/", undefined, "DELETE");
              setProfile(null);
            }, "Signed out")
          }
        >
          Sign out
        </button>
      </main>
    );
  const tabs: Tab[] = manage
    ? [
        "Overview",
        "Checkout",
        "Catalog",
        "Inventory",
        "Orders",
        "Customers",
        "Sales",
        ...(membership.role === "owner" ? (["Settings", "Team"] as Tab[]) : []),
      ]
    : ["Checkout", "Orders", "Customers", "Sales"];
  const active = tabs.includes(tab) ? tab : "Checkout";
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/">
          ◈ Perpetual<span>POS</span>
        </Link>
        <div className="business-picker">
          <small>YOUR WORKSPACE</small>
          <select
            aria-label="Business"
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {profile.memberships.map((m, i) => (
              <option key={m.business.id} value={i}>
                {m.business.name}
              </option>
            ))}
          </select>
          <span className="badge">{membership.role}</span>
        </div>
        <nav>
          {tabs.map((t, i) => (
            <button
              key={t}
              className={active === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                setNotice("");
                setError("");
              }}
            >
              <span>{["◫", "▦", "◇", "▤", "◷", "♙", "▥", "⚙", "♧"][i]}</span>
              {t}
              {t === "Orders" &&
                orders.filter((o) => o.status === "pending").length > 0 && (
                  <b>{orders.filter((o) => o.status === "pending").length}</b>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href={"/shop/" + business.slug} target="_blank" rel="noreferrer">
            Visit your storefront ↗
          </a>
          <small>Perpetual Labs</small>
          <button
            onClick={() =>
              run(async () => {
                await api("auth/session/", undefined, "DELETE");
                setProfile(null);
              }, "Signed out")
            }
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            Main branch <span className="muted">/ {active}</span>
          </span>
          <span className="connection">● Connected workspace</span>
          <span className="avatar">{profile.username[0].toUpperCase()}</span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {new Date().toLocaleDateString("en-UG", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  timeZone: business.timezone,
                })}
              </p>
              <h1>
                {active === "Overview" ? "A good day for business." : active}
              </h1>
              <p className="muted">
                {active === "Overview"
                  ? `Here’s what’s happening at ${business.name}.`
                  : active === "Checkout"
                    ? "Fast sales. Clear totals. Every item accounted for."
                    : "Keep the everyday details in order."}
              </p>
            </div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => run(reload, "Workspace refreshed")}
            >
              ↻ Refresh
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          {active === "Overview" && !report && !error && (
            <section className="panel" role="status">
              Loading today’s totals…
            </section>
          )}
          {active === "Overview" && report && (
            <>
              <div className="stats">
                {[
                  [
                    "Sales today",
                    money(report.total, business.currency),
                    "Synchronized transactions",
                  ],
                  [
                    "Transactions",
                    String(report.transactions),
                    "Completed sales",
                  ],
                  [
                    "Estimated gross profit",
                    money(report.estimated_gross_profit, business.currency),
                    "Based on recorded costs",
                  ],
                  [
                    "Pending orders",
                    String(orders.filter((o) => o.status === "pending").length),
                    "Waiting for your confirmation",
                  ],
                ].map(([label, value, note]) => (
                  <article className="stat" key={label}>
                    <p>{label}</p>
                    <strong>{value}</strong>
                    <small>{note}</small>
                  </article>
                ))}
              </div>
              <p className="notice">
                {report.sync_notice} Known pending uploads:{" "}
                {report.known_pending_sales}.
              </p>
              <div className="two-columns">
                <section className="panel">
                  <div className="section-heading">
                    <h2>Recent sales</h2>
                    <button
                      className="link-button"
                      onClick={() => setTab("Sales")}
                    >
                      View all →
                    </button>
                  </div>
                  {sales.slice(0, 6).map((s) => (
                    <div className="data-row" key={s.id}>
                      <span>
                        Receipt #{s.id}
                        <small>
                          {new Date(s.occurred_at).toLocaleTimeString("en-UG", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: business.timezone,
                          })}
                        </small>
                      </span>
                      <strong>{money(s.total, business.currency)}</strong>
                      <span className="badge">
                        {s.payment.method.replace("manual_", "Manual ")}
                      </span>
                    </div>
                  ))}
                  {!sales.length && (
                    <p className="empty">
                      Your first sale is the start of the story.
                      <br />
                      <button onClick={() => setTab("Checkout")}>
                        Make a sale →
                      </button>
                    </p>
                  )}
                </section>
                <section className="panel">
                  <p className="eyebrow">A little attention</p>
                  <h2>Running low</h2>
                  {report.low_stock.map((p, i) => (
                    <div className="data-row" key={i}>
                      <span>{p.name}</span>
                      <span className="badge amber">
                        {p.quantity - p.reserved} left
                      </span>
                    </div>
                  ))}
                  {!report.low_stock.length && (
                    <p className="empty">Your shelves are looking good.</p>
                  )}
                  <h3>Sales by payment</h3>
                  {Object.entries(report.by_payment_method).map(
                    ([method, value]) => (
                      <div className="data-row" key={method}>
                        <span>{method.replace("manual_", "Manual ")}</span>
                        <b>{money(value, business.currency)}</b>
                      </div>
                    ),
                  )}
                </section>
              </div>
            </>
          )}
          {active === "Checkout" && (
            <Checkout
              key={business.id}
              products={products}
              customers={customers}
              membership={membership}
              reload={reload}
            />
          )}
          {active === "Catalog" && (
            <>
              <section className="panel">
                <h2>Categories</h2>
                <form
                  className="form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const name = new FormData(f).get("name");
                    void run(async () => {
                      await api(base + "categories/", { name });
                      f.reset();
                    });
                  }}
                >
                  <label>
                    Category name
                    <input name="name" required maxLength={80} />
                  </label>
                  <button disabled={busy}>Add category</button>
                </form>
                <p className="muted">
                  {categories.map((c) => c.name).join(" · ") ||
                    "No categories yet."}
                </p>
              </section>
              <section className="panel">
                <h2>Add a product</h2>
                <form
                  className="form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const d = Object.fromEntries(new FormData(f));
                    void run(async () => {
                      await api(base + "products/", {
                        ...d,
                        category: d.category ? Number(d.category) : null,
                        price: Number(d.price),
                        cost: Number(d.cost),
                        low_stock_threshold: Number(d.low_stock_threshold),
                        published: d.published === "on",
                      });
                      f.reset();
                    });
                  }}
                >
                  <label>
                    Name
                    <input name="name" required />
                  </label>
                  <label>
                    SKU
                    <input name="sku" required />
                  </label>
                  <label>
                    Barcode
                    <input name="barcode" />
                  </label>
                  <label>
                    Category
                    <select name="category">
                      <option value="">Uncategorized</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Price ({business.currency})
                    <input
                      type="number"
                      min="0"
                      step="1"
                      name="price"
                      required
                    />
                  </label>
                  <label>
                    Cost ({business.currency})
                    <input
                      type="number"
                      min="0"
                      step="1"
                      name="cost"
                      required
                    />
                  </label>
                  <label>
                    Low stock threshold
                    <input
                      type="number"
                      min="0"
                      name="low_stock_threshold"
                      defaultValue="5"
                    />
                  </label>
                  <label>
                    Image URL
                    <input type="url" name="image" />
                  </label>
                  <label className="check">
                    <input type="checkbox" name="published" />
                    Publish online
                  </label>
                  <button disabled={busy}>Add product</button>
                </form>
              </section>
              <section className="panel">
                <h2>Your catalog</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product / SKU</th>
                        <th>Price</th>
                        <th>Available</th>
                        <th>Online store</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td>
                            {p.name}
                            <small>{p.sku}</small>
                          </td>
                          <td>
                            <input
                              aria-label={"Price of " + p.name}
                              type="number"
                              min="0"
                              defaultValue={p.price}
                              onBlur={(e) => {
                                if (Number(e.target.value) !== p.price)
                                  void run(() =>
                                    api(
                                      base + `products/${p.id}/`,
                                      { price: Number(e.target.value) },
                                      "PATCH",
                                    ),
                                  );
                              }}
                            />
                          </td>
                          <td>{p.quantity - p.reserved}</td>
                          <td>
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                run(() =>
                                  api(
                                    base + `products/${p.id}/`,
                                    { published: !p.published },
                                    "PATCH",
                                  ),
                                )
                              }
                            >
                              {p.published ? "Published" : "Hidden"}
                            </button>
                          </td>
                          <td>
                            <button
                              className="link-button"
                              disabled={busy}
                              onClick={() =>
                                run(() =>
                                  api(
                                    base + `products/${p.id}/`,
                                    { active: !p.active },
                                    "PATCH",
                                  ),
                                )
                              }
                            >
                              {p.active ? "Archive" : "Restore"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {active === "Inventory" && (
            <>
              <section className="panel">
                <h2>Record a stock movement</h2>
                <p className="muted">
                  Every change keeps a reason and audit trail.
                </p>
                <form
                  className="form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget,
                      d = Object.fromEntries(new FormData(f));
                    void run(async () => {
                      await api(base + "stock/", {
                        ...d,
                        client_id: crypto.randomUUID(),
                        product: Number(d.product),
                        delta: Number(d.delta),
                      });
                      f.reset();
                    });
                  }}
                >
                  <label>
                    Product
                    <select name="product">
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Operation
                    <select name="kind">
                      <option value="receipt">Stock receipt</option>
                      <option value="opening">Opening stock</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </label>
                  <label>
                    Quantity change
                    <input name="delta" type="number" step="1" required />
                  </label>
                  <label>
                    Reason
                    <input name="reason" minLength={3} required />
                  </label>
                  <button disabled={busy || !products.length}>
                    Record movement
                  </button>
                </form>
              </section>
              <section className="panel">
                <h2>Movement history</h2>
                {movements.map((m) => (
                  <div className="data-row" key={m.id}>
                    <span>
                      {m.stock__product__name}
                      <small>{m.reason}</small>
                    </span>
                    <b>
                      {m.delta > 0 ? "+" : ""}
                      {m.delta}
                    </b>
                    <small>
                      {new Date(m.created_at).toLocaleString("en-UG", {
                        timeZone: business.timezone,
                      })}
                    </small>
                  </div>
                ))}
              </section>
            </>
          )}
          {active === "Orders" && (
            <div className="order-grid">
              {orders.map((o) => (
                <section key={o.id} className="panel">
                  <div className="section-heading">
                    <h2>Order #{o.id}</h2>
                    <span className="badge">{o.status}</span>
                  </div>
                  <p>
                    {o.name} · {o.phone}
                  </p>
                  <p className="muted">
                    {o.delivery ? "Delivery: " + o.address : "Pickup at shop"}
                  </p>
                  {o.lines.map((l) => (
                    <p key={l.product}>
                      {l.quantity} × {l.name}
                    </p>
                  ))}
                  <div className="total">
                    <strong>{money(o.total, o.currency)}</strong>
                    <small>{o.payment_state}</small>
                  </div>
                  {manage && !["completed", "cancelled"].includes(o.status) && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const d = Object.fromEntries(
                          new FormData(e.currentTarget),
                        );
                        void run(() =>
                          api(base + `orders/${o.id}/`, {
                            ...d,
                            status: {
                              pending: "accepted",
                              accepted: "preparing",
                              preparing: "ready",
                              ready: "completed",
                            }[o.status],
                          }),
                        );
                      }}
                    >
                      {o.status === "ready" && (
                        <label>
                          Received payment
                          <select name="method">
                            <option value="cash">Cash</option>
                            <option value="manual_mtn">
                              Manual MTN · unverified
                            </option>
                            <option value="manual_airtel">
                              Manual Airtel · unverified
                            </option>
                          </select>
                        </label>
                      )}
                      <button disabled={busy}>
                        {
                          {
                            pending: "Accept order",
                            accepted: "Start preparing",
                            preparing: "Mark ready",
                            ready: "Record payment & complete",
                          }[o.status]
                        }
                      </button>
                      <button
                        disabled={busy}
                        type="button"
                        className="secondary"
                        onClick={() =>
                          run(() =>
                            api(base + `orders/${o.id}/`, {
                              status: "cancelled",
                            }),
                          )
                        }
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                </section>
              ))}
              {!orders.length && (
                <p className="empty">
                  New storefront orders will appear here. Refresh to check.
                </p>
              )}
            </div>
          )}
          {active === "Customers" && (
            <>
              <section className="panel">
                <h2>Add a customer</h2>
                <form
                  className="form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget,
                      d = Object.fromEntries(new FormData(f));
                    void run(async () => {
                      await api(base + "customers/", d);
                      f.reset();
                    });
                  }}
                >
                  <label>
                    Name
                    <input name="name" required />
                  </label>
                  <label>
                    Phone
                    <input name="phone" required type="tel" />
                  </label>
                  <button disabled={busy}>Save customer</button>
                </form>
              </section>
              <section className="panel">
                {customers.map((c) => (
                  <div className="data-row" key={c.id}>
                    <strong>{c.name}</strong>
                    <span>{c.phone}</span>
                    <button
                      className="secondary"
                      onClick={() =>
                        run(
                          async () =>
                            setHistory(
                              await api<Sale[]>(
                                base + `customers/${c.id}/purchases/`,
                              ),
                            ),
                          "Purchase history loaded",
                        )
                      }
                    >
                      Purchase history
                    </button>
                  </div>
                ))}
                {history && (
                  <>
                    <h3>Purchase history</h3>
                    {history.length ? (
                      history.map((s) => (
                        <p key={s.id}>
                          Receipt #{s.id} · {money(s.total, s.currency)}
                        </p>
                      ))
                    ) : (
                      <p>No purchases yet.</p>
                    )}
                  </>
                )}
              </section>
            </>
          )}
          {active === "Sales" && (
            <>
              <section className="panel">
                <h2>Completed sales</h2>
                {sales.map((s) => (
                  <div className="data-row" key={s.id}>
                    <span>
                      Receipt #{s.id}
                      <small>
                        {new Date(s.occurred_at).toLocaleString("en-UG", {
                          timeZone: business.timezone,
                        })}
                      </small>
                    </span>
                    <strong>{money(s.total, s.currency)}</strong>
                    <span
                      className={
                        "badge " + (s.review_reasons.length ? "amber" : "")
                      }
                    >
                      {s.review_reasons.length
                        ? "Needs review"
                        : "Synchronized"}
                    </span>
                    <button className="secondary" onClick={() => setReceipt(s)}>
                      Receipt
                    </button>
                  </div>
                ))}
                {!sales.length && (
                  <p className="empty">Completed sales will appear here.</p>
                )}
              </section>
              {receipt && <Receipt sale={receipt} shop={business.name} />}
            </>
          )}
          {active === "Settings" && (
            <section className="panel">
              <h2>Shop details</h2>
              <form
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = Object.fromEntries(new FormData(e.currentTarget));
                  void run(async () => {
                    const b = await api<Business>(
                      base,
                      {
                        ...d,
                        delivery_enabled: d.delivery_enabled === "on",
                        delivery_fee: Number(d.delivery_fee),
                        safety_buffer: Number(d.safety_buffer),
                      },
                      "PATCH",
                    );
                    setProfile({
                      ...profile,
                      memberships: profile.memberships.map((m, i) =>
                        i === selected ? { ...m, business: b } : m,
                      ),
                    });
                  });
                }}
              >
                {(["name", "slug", "contact", "logo", "timezone"] as const).map(
                  (k) => (
                    <label key={k}>
                      {k}
                      <input
                        name={k}
                        defaultValue={business[k]}
                        required={["name", "slug", "timezone"].includes(k)}
                      />
                    </label>
                  ),
                )}
                <label>
                  Currency
                  <input value={business.currency} readOnly />
                  <small>
                    Pilot uses integer UGX. Currency changes require a new
                    ledger.
                  </small>
                </label>
                <label>
                  Delivery fee
                  <input
                    type="number"
                    min="0"
                    name="delivery_fee"
                    defaultValue={business.delivery_fee}
                  />
                </label>
                <label>
                  Online safety buffer
                  <input
                    type="number"
                    min="0"
                    name="safety_buffer"
                    defaultValue={business.safety_buffer}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="delivery_enabled"
                    defaultChecked={business.delivery_enabled}
                  />
                  Enable shop-managed delivery
                </label>
                <button disabled={busy}>Save settings</button>
              </form>
            </section>
          )}
          {active === "Team" && (
            <section className="panel">
              <h2>Create a staff account</h2>
              <form
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = e.currentTarget,
                    d = Object.fromEntries(new FormData(f));
                  void run(async () => {
                    await api(base + "staff/", d);
                    f.reset();
                  });
                }}
              >
                <label>
                  Username
                  <input name="username" required />
                </label>
                <label>
                  Email for Google sign-in (optional)
                  <input name="email" type="email" />
                </label>
                <label>
                  Initial password
                  <input
                    name="password"
                    type="password"
                    minLength={10}
                    required
                  />
                </label>
                <label>
                  Role
                  <select name="role">
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                  </select>
                </label>
                <button disabled={busy}>Create staff</button>
              </form>
              <h3>Your team</h3>
              {staff.map((s) => (
                <div className="data-row" key={s.id}>
                  <span>{s.user__username}</span>
                  <span className="badge">{s.role}</span>
                </div>
              ))}
            </section>
          )}
          <footer>
            DuukaYo{" "}
            <span>Built for the everyday. By Perpetual Labs.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
