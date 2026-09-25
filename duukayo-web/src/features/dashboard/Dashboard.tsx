"use client";
import { useFeedback } from "../../lib/feedback";

import { productName } from "@/lib/variants";
import ImageField from "./ImageField";
import CatalogManager from "./CatalogManager";
import Icon from "@/components/Icon";
import MetricCard from "@/components/MetricCard";
import Link from "next/link";
import GoogleSignIn from "../auth/GoogleSignIn";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  logoutWeb,
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
import WorkspaceShell from "./WorkspaceShell";
import OperationsPanel from "./OperationsPanel";
import Checkout from "../checkout/Checkout";
import Receipt from "../checkout/Receipt";
import PlatformAdmin from "../platform/PlatformAdmin";
type Tab =
  | "Operations"
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
type Staff = { id: number; user__username: string; role: string; active: boolean; branch: number };
type Movement = {
  id: number;
  stock__product__name: string;
  delta: number;
  reason: string;
  created_at: string;
};
export default function Dashboard() {
  const [platformMode, setPlatformMode] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null),
    [selected, setSelected] = useState(0),
    [tab, setTab] = useState<Tab>("Overview"),
    [error, setError] = useFeedback("error"),
    [notice, setNotice] = useFeedback("info"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [register, setRegister] = useState(false);
  const [loadedBase, setLoadedBase] = useState("");
  const loadGeneration = useRef(0);
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
    if (!base || (profile?.can_manage_platform && platformMode)) return;
    const generation = ++loadGeneration.current;
    const [p, c, s, o, v, cats, summary, team] = await Promise.all([
      api<Product[]>(base + "products/"),
      api<Customer[]>(base + "customers/"),
      api<Sale[]>(base + "sales/"),
      api<Order[]>(base + "orders/"),
      api<Movement[]>(base + "stock/"),
      api<Category[]>(base + "categories/"),
      manage ? api<Report>(base + "reports/") : Promise.resolve(null),
      membership?.role === "owner" ? api<Staff[]>(base + "staff/") : Promise.resolve([]),
    ]);
    if (generation !== loadGeneration.current) return;
    setCategories(cats);
    setProducts(p);
    setCustomers(c);
    setSales(s);
    setOrders(o);
    setMovements(v);
    setReport(summary);
    setStaff(team);
    setLoadedBase(base);
  }, [base, manage, membership?.role, profile?.can_manage_platform, platformMode]);
  useEffect(() => {
    const generation = loadGeneration;
    setLoadedBase("");
    setProducts([]);
    setCustomers([]);
    setSales([]);
    setOrders([]);
    setReport(null);
    setReceipt(null);
    setHistory(null);
    setCategories([]);
    setStaff([]);
    void reload().catch((e) => setError(e.message));
    return () => { generation.current++; };
  }, [reload, setError]);
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
  useEffect(() => {
    const endSession = (event: StorageEvent) => {
      if (event.key === "duukayo-session-ended") window.location.replace("/");
    };
    window.addEventListener("storage", endSession);
    return () => window.removeEventListener("storage", endSession);
  }, []);
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
          <p><Link href="/signup">Create a personal account</Link> to shop or join a team.</p>
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
              <p className="error">
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
  if (profile.can_manage_platform && platformMode)
    return <PlatformAdmin profile={profile} onShopWorkspace={() => setPlatformMode(false)} />;
  if ((!membership || !business) && profile.is_staff && profile.admin_url)
    return (
      <main className="panel">
        <h1>Platform administration</h1>
        <p>Signed in as {profile.username}. Manage shops, users and catalog records in Django Admin. You do not need to create a shop workspace.</p>
        <p><a className="button" href={profile.admin_url}>Open Django Admin</a></p>
        <p><Link href="/">Browse the marketplace</Link></p>
        {error && <p className="error">{error}</p>}
        <button className="link-button" disabled={busy} onClick={() => void logout()}>Sign out</button>
      </main>
    );
  if (!membership || !business)
    return (
      <main className="panel">
        <h1>Your account is ready</h1>
        <p>Signed in as <strong>{profile.username}</strong>. Share this username with your administrator to join a team.</p>
        <p><Link href="/">Explore shops →</Link></p>
        <details><summary>Start your own business (optional)</summary>
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
            <p className="error">
              {error}
            </p>
          )}
          <button disabled={busy}>Create business</button>
        </form>
        </details>
        <button
          className="link-button"
          disabled={busy}
          onClick={() => void logout()}
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
        "Operations",
        "Orders",
        "Customers",
        "Sales",
        ...(membership.role === "owner" ? (["Settings", "Team"] as Tab[]) : []),
      ]
    : ["Checkout", "Operations", "Orders", "Customers", "Sales"];
  const active = tabs.includes(tab) ? tab : "Checkout";
  return (
    <WorkspaceShell memberships={profile.memberships} selected={selected} onBusiness={setSelected} active={active} tabs={tabs}
      onNavigate={value => { setTab(value as Tab); setNotice(""); setError(""); }} pending={orders.filter(o => o.status === "pending").length}
      username={profile.username} busy={busy} onLogout={() => void logout()}>
        <main className="content" key={base}>
          {profile.can_manage_platform && <button className="secondary" onClick={() => setPlatformMode(true)}>Platform administration</button>}
          {profile.is_staff && profile.admin_url && <p><a href={profile.admin_url}>Open Django Admin</a></p>}
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
                {active === "Overview" ? "Your business, at a glance." : active}
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
              <Icon name="refresh" /> Refresh
            </button>
          </div>
          {error && (
            <p className="error">
              {error}
            </p>
          )}
          {notice && (
            <p className="success">
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
              <section className="dashboard-actions" aria-label="Quick actions">
                <div><p className="eyebrow">READY WHEN YOU ARE</p><h2>Make your next move.</h2></div>
                <button onClick={() => setTab("Checkout")}><Icon name="plus" /> New sale</button>
                <button className="secondary" onClick={() => setTab("Orders")}><Icon name="Orders" />Review orders</button>
                <button className="secondary" onClick={() => setTab("Catalog")}><Icon name="Catalog" />Manage products</button>
              </section>
              <div className="stats">
                {[
                  [
                    "Sales today",
                    money(report.total, business.currency),
                    "Synchronized transactions", "wallet",
                  ],
                  [
                    "Transactions",
                    String(report.transactions),
                    "Completed sales", "Orders",
                  ],
                  [
                    "Estimated gross profit",
                    money(report.estimated_gross_profit, business.currency),
                    "Based on recorded costs", "Sales",
                  ],
                  [
                    "Pending orders",
                    String(orders.filter((o) => o.status === "pending").length),
                    "Waiting for your confirmation", "Orders",
                  ],
                ].map(([label, value, note, icon], index) => (
                  <MetricCard key={label} label={label} value={value} note={note} icon={icon} tone={(["green", "blue", "purple", "amber"] as const)[index]} />
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
                      <span>{productName(p)}</span>
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
          {active === "Operations" && <OperationsPanel key={`${base}:${membership.branch}`} membership={membership} userId={profile.id} products={products} sales={sales} reload={reload} />}
          {active === "Checkout" && (
            <Checkout
              key={profile.id + ":" + membership.business.id + ":" + membership.branch}
              cashierId={profile.id}
              products={products}
              inventoryReady={loadedBase === base}
              customers={customers}
              membership={membership}
              reload={reload}
            />
          )}
          {active === "Catalog" && (
            <>
              <CatalogManager key={business.id} products={products} categories={categories} businessId={business.id} currency={business.currency} reload={reload} />
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
                          {productName(p)}
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
              <p>{business.published ? "Published storefront" : "Draft — hidden from customers"}</p>
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
                        published: d.published === "on",
                        delivery_enabled: d.delivery_enabled === "on",
                        delivery_fee: Number(d.delivery_fee),
                        safety_buffer: Number(d.safety_buffer),
                        storefront_branch: d.storefront_branch ? Number(d.storefront_branch) : null,
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
                {(["name", "slug", "contact", "website", "timezone"] as const).map(
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
                  Online fulfilment branch
                  <select name="storefront_branch" defaultValue={business.storefront_branch || ""}>
                    <option value="">First branch</option>
                    {business.branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
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
                <label>Description<textarea name="description" maxLength={2000} defaultValue={business.description} /></label>
                <ImageField businessId={business.id} name="logo" initial={business.logo} />
                <label className="check"><input type="checkbox" name="published" defaultChecked={business.published} />Publish storefront</label>
                <button disabled={busy}>Save settings</button>
              </form>
              <form className="form-grid" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const name = new FormData(form).get("name"); void run(async () => { await api(base + "branches/", { name }); const updated = await api<Business>(base); setProfile({ ...profile, memberships: profile.memberships.map((m, i) => i === selected ? { ...m, business: updated } : m) }); form.reset(); }); }}><label>New branch<input name="name" required maxLength={100} /></label><button disabled={busy}>Add branch</button></form>
            </section>
          )}
          {active === "Team" && (
            <section className="panel">
              <h2>Add an existing account</h2>
              <p>Give an existing customer or shop owner access to this shop. Their password, shopping account and other shops stay unchanged.</p>
              <form className="form-grid" onSubmit={e => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = Object.fromEntries(new FormData(form));
                void run(async () => {
                  await api(base + "staff/", { ...data, existing_account: true, branch: Number(data.branch) });
                  form.reset();
                }, "Shop access added");
              }}>
                <label>Existing username<input name="username" required /></label>
                <label>Shop role<select name="role"><option value="cashier">Cashier</option><option value="manager">Manager</option></select></label>
                <label>Assigned branch<select name="branch" defaultValue={membership.branch}>{business.branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
                <button disabled={busy}>Add shop access</button>
              </form>
              <h2>New team members</h2>
              <p>New team members should <Link href="/signup">register their own account</Link>, then share their username with you.</p>
              <h3>Your team</h3>
              {staff.map((s) => (
                <div className="data-row" key={s.id}>
                  <span>{s.user__username}</span>
                  <span className="badge">{s.role}</span>
                  {s.role !== "owner" && <form className="form-grid" key={`${s.id}:${s.role}:${s.branch}:${s.active}`} onSubmit={e => {
                    e.preventDefault();
                    const data = Object.fromEntries(new FormData(e.currentTarget));
                    void run(() => api(base + `staff/${s.id}/`, { role: data.role, branch: Number(data.branch), active: data.active === "on" }, "PATCH"), "Shop access updated");
                  }}>
                    <label>Role for {s.user__username}<select name="role" defaultValue={s.role}><option value="cashier">Cashier</option><option value="manager">Manager</option></select></label>
                    <label>Branch for {s.user__username}<select name="branch" defaultValue={s.branch}>{business.branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
                    <label className="check"><input type="checkbox" name="active" defaultChecked={s.active} />Active access for {s.user__username}</label>
                    <button disabled={busy}>Save access for {s.user__username}</button>
                  </form>}
                </div>
              ))}
            </section>
          )}
          <footer>
            DuukaYo <span>Built for the everyday. By Perpetual Labs.</span>
          </footer>
        </main>
    </WorkspaceShell>
  );
}
