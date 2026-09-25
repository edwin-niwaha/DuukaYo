"use client";
import { useFeedback } from "../../lib/feedback";

import { useRef, useState } from "react";
import { api, money, type Product } from "@/lib/api";
import ImageField from "./ImageField";
import Icon from "@/components/Icon";
import SearchField from "@/components/SearchField";
import CatalogPagination from "@/components/CatalogPagination";
import { ProductImage } from "../storefront/ProductShowcase";

type Category = { id: number; name: string };
type Draft = Omit<
  Product,
  "id" | "quantity" | "reserved" | "cost" | "price"
> & { id?: number; key: string; cost: string; price: string };
const blank = (): Draft => ({
  key: crypto.randomUUID(),
  name: "",
  sku: "",
  barcode: "",
  price: "",
  cost: "",
  category: null,
  active: true,
  published: false,
  low_stock_threshold: 5,
  image: "",
  gallery: [],
  description: "",
  variant_group: "",
  attributes: {},
});
const draft = (p: Product): Draft => ({
  ...p,
  key: String(p.id),
  cost: p.cost === null ? "" : String(p.cost),
  price: String(p.price),
});
const label = (p: Product) =>
  Object.entries(p.attributes || {})
    .map(([k, v]) => k + ": " + v)
    .join(" · ");

export default function CatalogManager({
  products,
  categories,
  businessId,
  currency,
  reload,
  apiBase,
  uploadEndpoint,
}: {
  products: Product[];
  categories: Category[];
  businessId: number;
  currency: string;
  reload: () => Promise<void>;
  apiBase?: string;
  uploadEndpoint?: string;
}) {
  const base = (apiBase || "businesses/" + businessId + "/") + "products/";
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [category, setCategory] = useState("");
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [listPage, setListPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const listHeading = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState([{ name: "Size", values: "" }]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useFeedback("error"),
    [notice, setNotice] = useFeedback("info");
  const working = useRef(false);
  const editor = useRef<HTMLElement>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  function open(p?: Product, duplicate = false) {
    if (rows && !window.confirm("Discard the open product edits?")) return;
    const family = p
      ? p.variant_group
        ? products.filter(
            (x) =>
              x.variant_group?.toLowerCase() === p.variant_group?.toLowerCase(),
          )
        : [p]
      : [];
    const group =
      duplicate && p?.variant_group ? crypto.randomUUID() : p?.variant_group;
    setRows(
      p
        ? family.map((x) => ({
            ...draft(x),
            ...(duplicate
              ? {
                  id: undefined,
                  key: crypto.randomUUID(),
                  sku: "",
                  barcode: "",
                  published: false,
                  showcase: false,
                  variant_group: group,
                }
              : {}),
          }))
        : [blank()],
    );
    const names = Object.keys(p?.attributes || {});
    setOptions(names.length ? names.map(name => ({
      name,
      values: [...new Set(family.map(x => x.attributes?.[name]).filter(Boolean))].join(", "),
    })) : [{ name: "Size", values: "" }]);
    setError("");
    setNotice("");
    setEditorVersion((n) => n + 1);
    requestAnimationFrame(() =>
      editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  function update(index: number, patch: Partial<Draft>) {
    setRows((old) =>
      old!.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }
  function generate() {
    if (!rows) return;
    const definitions = options.map((o) => ({
      name: o.name.trim(),
      values: [
        ...new Set(
          o.values
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ],
    }));
    if (
      definitions.some((o) => !o.name || !o.values.length) ||
      new Set(definitions.map((o) => o.name.toLowerCase())).size !==
        definitions.length
    ) {
      setError("Enter unique option names and comma-separated values.");
      return;
    }
    if (definitions.reduce((n, o) => n * o.values.length, 1) > 100) {
      setError("Create at most 100 combinations at a time.");
      return;
    }
    const existingFamily = rows.some(r => r.id && r.variant_group);
    if (existingFamily && rows.some(r =>
      Object.keys(r.attributes || {}).sort().join("|") !== definitions.map(o => o.name).sort().join("|")
    )) {
      setError(
        "Keep the existing option names when extending this family. Edit each variant's values below, or duplicate the product to use different options.",
      );
      return;
    }
    if (
      !existingFamily && rows.length > 1 &&
      !window.confirm(
        "Regenerate combinations and replace the unsaved variant rows?",
      )
    )
      return;
    const combinations = definitions.reduce<Record<string, string>[]>(
      (all, o) =>
        all.flatMap((a) => o.values.map((v) => ({ ...a, [o.name]: v }))),
      [{}],
    );
    const group = rows[0].variant_group || crypto.randomUUID();
    const signature = (attributes: Record<string, string>) => JSON.stringify(
      Object.entries(attributes).map(([k, v]) => [k.toLowerCase(), v.trim().toLowerCase()]).sort(([a], [b]) => a.localeCompare(b)),
    );
    const kept = existingFamily ? rows : [];
    const additions = combinations.filter(attributes => !kept.some(row => signature(row.attributes || {}) === signature(attributes)));
    if (kept.length + additions.length > 100) {
      setError("A product family can contain at most 100 variants.");
      return;
    }
    const usedSkus = new Set([...products, ...kept].map(row => row.sku.toLowerCase()));
    let suffix = 1;
    const nextSku = () => {
      if (!rows[0].sku) return "";
      const stem = rows[0].sku.slice(0, 54);
      let value;
      do { value = stem + "-" + suffix++; } while (usedSkus.has(value.toLowerCase()));
      usedSkus.add(value.toLowerCase());
      return value;
    };
    setRows([
      ...kept,
      ...additions.map((attributes, i) => ({
        ...rows[0],
        key: crypto.randomUUID(),
        id: !existingFamily && i === 0 ? rows[0].id : undefined,
        sku: !existingFamily && i === 0 && rows[0].id ? rows[0].sku : nextSku(),
        barcode: !existingFamily && i === 0 && rows[0].id ? rows[0].barcode : "",
        variant_group: group,
        attributes,
      })),
    ]);
    setEditorVersion((n) => n + 1);
    setError("");
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rows || working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = new FormData(event.currentTarget);
      const payload = rows.map((row, i) => ({
        ...(row.id ? { id: row.id } : {}),
        name: row.name.trim(),
        sku: row.sku.trim(),
        barcode: row.barcode.trim(),
        category: row.category,
        cost: row.cost === "" ? null : Number(row.cost),
        price: Number(row.price),
        active: row.active,
        published: row.published,
        showcase: !!row.showcase,
        description: row.description || "",
        variant_group: row.variant_group || "",
        attributes: row.attributes || {},
        image: String(data.get("image-" + i) || ""),
        gallery: (row.gallery || []).map((url) => url.trim()).filter(Boolean),
        low_stock_threshold: row.low_stock_threshold,
      }));
      await api(base + "variant-set/", { products: payload });
      setRows(null);
      setNotice("Products saved.");
      try {
        await reload();
      } catch {
        setError(
          "Saved, but the catalog could not refresh. Reload the page to see the changes.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function action(p: Product, kind: "archive" | "delete") {
    if (working.current) return;
    if (rows) {
      setError(
        "Save or cancel your open edits before changing another product.",
      );
      return;
    }
    if (
      kind === "delete" &&
      !window.confirm(
        "Permanently delete " +
          p.name +
          "? Products with inventory or transaction records must be archived instead.",
      )
    )
      return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(
        base + p.id + "/",
        kind === "delete"
          ? undefined
          : { active: !(p.active || p.showcase), ...((p.active || p.showcase) ? { published: false, showcase: false } : {}) },
        kind === "delete" ? "DELETE" : "PATCH",
      );
      setNotice(
        kind === "delete"
          ? "Product deleted."
          : (p.active || p.showcase)
            ? "Product archived."
            : "Product restored.",
      );
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const visible = products.filter(
    (p) =>
      [p.name, p.sku, p.barcode, label(p)]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!category || String(p.category) === category) &&
      (status === "all" ||
        (status === "active" && p.active) ||
        (status === "archived" && !p.active && !p.showcase) ||
        (status === "published" && p.active && p.published) ||
        (status === "draft" && p.active && !p.published && !p.showcase) ||
        (status === "preview" && p.showcase)),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(listPage, pageCount);
  const pageProducts = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  function navigateList(next: number) {
    setListPage(next);
    requestAnimationFrame(() => { listHeading.current?.scrollIntoView({ block: "start" }); listHeading.current?.focus({ preventScroll: true }); });
  }
  return (
    <section className="panel catalog-manager">
      <div className="catalog-toolbar">
        <div>
          <p className="eyebrow">YOUR CATALOG</p>
          <h2>Products & variants</h2>
        </div>
        <button onClick={() => open()} disabled={busy}>
          <Icon name="plus" /> Add product
        </button>
      </div>
      <nav className="catalog-status-nav" aria-label="Catalog views">
        {[["all", "All products"], ["active", "Active"], ["published", "Published"], ["draft", "Drafts"], ["preview", "Coming soon"], ["archived", "Archived"]].map(([value, title]) => <button key={value} className={status === value ? "active" : "secondary"} aria-pressed={status === value} onClick={() => { setStatus(value); setListPage(1); }}>{title}</button>)}
      </nav>
      <div className="catalog-filters">
        <SearchField label="Search products"
            placeholder="Name, SKU, barcode or variant…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setListPage(1); }}
          />
        <label>
          Category
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setListPage(1); }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

      </div>
      {error && (
        <p className="error">
          {error}
        </p>
      )}
      {notice && <p>{notice}</p>}
      {rows && (
        <section
          ref={editor}
          className="catalog-editor"
          aria-label="Product editor"
        >
          <header className="catalog-editor-heading"><h3>{rows.some((r) => r.id) ? "Edit products" : "New product"}</h3><button type="button" className="secondary" disabled={busy} onClick={() => { if (window.confirm("Discard these unsaved edits?")) { setRows(null); requestAnimationFrame(() => listHeading.current?.focus()); } }}><Icon name="left" />Back to products</button></header>
          <form key={editorVersion} onSubmit={save}>
            <fieldset disabled={busy} className="variant-generator">
              <legend>Variant options</legend>
              <p>
                Optional: create sizes, volumes, colours or other combinations.
                Each variant has its own SKU and stock.
                Existing combinations are preserved when you add more values.
              </p>
              {rows.length === 1 && rows[0].id && (
                <p>
                  The existing SKU and stock stay with the first combination
                  when you generate variants.
                </p>
              )}
              {options.map((o, i) => (
                <div className="catalog-filters" key={i}>
                  <label>
                    Option name
                    <input
                      maxLength={60}
                      value={o.name}
                      onChange={(e) =>
                        setOptions((old) =>
                          old.map((x, j) =>
                            i === j ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Values, separated by commas
                    <input
                      value={o.values}
                      placeholder="Small, Medium, Large"
                      onChange={(e) =>
                        setOptions((old) =>
                          old.map((x, j) =>
                            i === j ? { ...x, values: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={options.length === 1}
                    onClick={() =>
                      setOptions((old) => old.filter((_, j) => i !== j))
                    }
                  >
                    Remove option
                  </button>
                </div>
              ))}
              <div className="catalog-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={options.length >= 4}
                  onClick={() =>
                    setOptions((old) => [...old, { name: "", values: "" }])
                  }
                >
                  <Icon name="plus" /> Add option
                </button>
                <button type="button" onClick={generate}>
                  Generate variants
                </button>
              </div>
            </fieldset>
            {rows.map((row, i) => (
              <fieldset
                key={row.key}
                disabled={busy}
                className="variant-editor"
              >
                <legend>
                  {rows.length > 1 ? "Variant " + (i + 1) : "Product details"}
                </legend>
                <div className="form-grid">
                  <label>
                    Product name
                    <input
                      required
                      maxLength={120}
                      value={row.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    SKU
                    <input
                      required
                      maxLength={60}
                      value={row.sku}
                      onChange={(e) => update(i, { sku: e.target.value })}
                    />
                  </label>
                  <label>
                    Barcode
                    <input
                      maxLength={100}
                      value={row.barcode}
                      onChange={(e) => update(i, { barcode: e.target.value })}
                    />
                  </label>
                  <label>
                    Category
                    <select
                      value={row.category || ""}
                      onChange={(e) =>
                        update(i, {
                          category: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Price
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      max="100000000000"
                      value={row.price}
                      onChange={(e) => update(i, { price: e.target.value })}
                    />
                  </label>
                  <label>
                    Cost
                    <input
                      required={row.active || row.published}
                      type="number"
                      min="0"
                      step="1"
                      max="100000000000"
                      value={row.cost}
                      onChange={(e) => update(i, { cost: e.target.value })}
                    />
                  </label>
                  <label>
                    Low stock threshold
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={row.low_stock_threshold}
                      onChange={(e) =>
                        update(i, {
                          low_stock_threshold: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={(e) =>
                        update(i, {
                          active: e.target.checked,
                          ...(!e.target.checked ? { published: false } : {}),
                        })
                      }
                    />{" "}
                    Active
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={row.published}
                      disabled={!row.active}
                      onChange={(e) =>
                        update(i, { published: e.target.checked })
                      }
                    />{" "}
                    Published
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    maxLength={5000}
                    value={row.description || ""}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                </label>
                {Object.entries(row.attributes || {}).map(([name, value]) => (
                  <label key={name}>
                    {name}
                    <input
                      required
                      maxLength={100}
                      value={value}
                      onChange={(e) =>
                        update(i, {
                          attributes: {
                            ...row.attributes,
                            [name]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
                <label><input type="checkbox" checked={!!row.showcase} onChange={e => update(i, { showcase: e.target.checked })} />Show as coming soon when not published</label>
              <ImageField
                  uploadEndpoint={uploadEndpoint}
                  businessId={businessId}
                  name={"image-" + i}
                  initial={row.image}
                  onSave={async (url) => update(i, { image: url })}
                />
                <label>
                  Additional image URLs (one per line, up to 8)
                  <textarea
                    value={(row.gallery || []).join("\n")}
                    onChange={(e) =>
                      update(i, { gallery: e.target.value.split("\n") })
                    }
                  />
                </label>
                {!row.id && rows.length > 1 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setRows((old) => old!.filter((_, j) => i !== j))
                    }
                  >
                    Remove this combination
                  </button>
                )}
              </fieldset>
            ))}
            {rows[0].variant_group && (
              <button
                type="button"
                className="secondary"
                disabled={busy || rows.length >= 100}
                onClick={() =>
                  setRows((old) => [
                    ...old!,
                    {
                      ...old![0],
                      id: undefined,
                      key: crypto.randomUUID(),
                      sku: "",
                      barcode: "",
                      attributes: Object.fromEntries(
                        Object.keys(old![0].attributes || {}).map((key) => [
                          key,
                          "",
                        ]),
                      ),
                    },
                  ])
                }
              >
                <Icon name="plus" /> Add another variant
              </button>
            )}
            <div className="catalog-actions">
              <button disabled={busy}>
                <Icon name="save" /> {busy ? "Saving…" : "Save products"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Discard these unsaved edits?"))
                    setRows(null);
                }}
              >
                Cancel
              </button>
            </div>
            <p className="muted">
              Stock is updated through Inventory after saving. Existing orders
              retain their original product details.
            </p>
          </form>
        </section>
      )}
      <div ref={listHeading} tabIndex={-1} className="catalog-list-heading"><p role="status">{visible.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, visible.length)} of ${visible.length}` : "0"} {visible.length === 1 ? "product" : "products"}</p><div className="catalog-list-tools">{(search || category || status !== "all") && <button className="secondary" onClick={() => { setSearch(""); setCategory(""); setStatus("all"); setListPage(1); }}>Clear filters</button>}<label className="catalog-page-size">Per page<select aria-label="Per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setListPage(1); }}>{[12, 24, 48].map(size => <option key={size} value={size}>{size}</option>)}</select></label></div></div>
      {visible.length > 0 && <CatalogPagination page={currentPage} pages={pageCount} onPage={navigateList} label="Product pages, top" />}
      <div className="catalog-list">
        {pageProducts.map((p) => (
          <article key={p.id} className="catalog-row">
            <div className="catalog-photo">
              <ProductImage src={p.image} name={p.name} />
            </div>
            <div className="catalog-product-info">
              <h3>{p.name}</h3>
              {label(p) && <p className="catalog-variant-label">{label(p)}</p>}
              <small>
                {p.sku} · {p.category_name || "Uncategorized"}
              </small>
            </div>
            <div className="catalog-product-meta">
              <strong className="catalog-product-price">{money(p.price, currency)}</strong>
              <span className={p.quantity - p.reserved > 0 ? "catalog-stock" : "catalog-stock is-empty"}>{p.quantity - p.reserved} available</span>
              <span className={`catalog-product-state ${p.published && p.active ? "is-published" : ""}`}>
                {p.showcase && !p.published ? "Coming soon" : !p.active ? "Archived" : p.published ? "Published" : "Draft"}
              </span>
            </div>
            <div className="catalog-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => open(p)}
              >
                <Icon name="edit" /> {p.variant_group ? "Edit variants" : "Edit"}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => open(p, true)}
              >
                <Icon name="copy" /> Duplicate
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void action(p, "archive")}
              >
                <Icon name="archive" /> {p.active || p.showcase ? "Archive" : "Restore"}
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => void action(p, "delete")}
              >
                <Icon name="trash" /> Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      {visible.length > 0 && <CatalogPagination page={currentPage} pages={pageCount} onPage={navigateList} label="Product pages" />}
      {!visible.length && <p>{products.length ? "No products match these filters." : "Your catalog is empty. Add your first product, then create sizes, colours or other variants."}</p>}
    </section>
  );
}
