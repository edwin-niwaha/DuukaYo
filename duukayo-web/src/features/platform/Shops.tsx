"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import SearchField from "@/components/SearchField";
import { api } from "@/lib/api";
import { EditorDialog } from "./Users";
import { Feedback, Pager, formData, useAction, useData, type Page, type Shop } from "./shared";

function CreateShop({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const action = useAction();
  return <EditorDialog title="Create shop" eyebrow="NEW STOREFRONT" onClose={() => { if (!action.busy) onClose(); }}>
    <form className="person-form create-shop-form" onSubmit={event => {
      event.preventDefault();
      const data = formData(event.currentTarget);
      void action.run(async () => { const shop = await api<Shop>("platform/shops/", data); onCreated(shop.id); });
    }}><Feedback {...action} /><p>Create a workspace for an existing account. The owner can manage its products, staff and orders.</p><fieldset disabled={action.busy}><div className="person-fields">
      <label>Shop name<input name="name" required maxLength={120} placeholder="e.g. Kampala Corner" /></label>
      <label>Shop URL name<input name="slug" pattern="[a-zA-Z0-9_-]+" required maxLength={50} placeholder="kampala-corner" aria-describedby="shop-url-help" /></label>
      <label>Owner username<input name="owner" required maxLength={150} autoComplete="off" placeholder="Existing account username" /></label>
      <label>First branch name<input name="branch_name" defaultValue="Main branch" required maxLength={100} /></label>
    </div><p id="shop-url-help">Use letters, numbers, hyphens or underscores for the URL. Ask the owner to register before creating their shop.</p><footer><button className="secondary" type="button" onClick={onClose}>Cancel</button><button disabled={action.busy}><Icon name="plus" />{action.busy ? "Creating…" : "Create shop"}</button></footer></fieldset></form>
  </EditorDialog>;
}

export default function Shops({ onOpen }: { onOpen: (id: number) => void }) {
  const [input, setInput] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1), [creating, setCreating] = useState(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const state = useData<Page<Shop>>(`platform/shops/?q=${encodeURIComponent(query)}&page=${page}`);
  function clear() { setInput(""); setQuery(""); setPage(1); }
  function close() { setCreating(false); requestAnimationFrame(() => createButton.current?.focus()); }

  return <div className="shops-directory shops-directory-v2">
    <header className="shops-directory-heading"><div><h1>Shops</h1><p>Manage storefronts, people and daily operations.</p></div><button ref={createButton} className="shops-create-button" onClick={() => setCreating(true)}><Icon name="plus" />Create shop</button></header>
    <section className="shops-search-panel" aria-label="Find shops"><form role="search" aria-label="Shop directory search" onSubmit={event => { event.preventDefault(); setQuery(input.trim()); setPage(1); }}><SearchField label="Search shops" name="q" placeholder="Search…" value={input} onChange={event => setInput(event.target.value)} /><button aria-label="Search shops">Search</button></form><button className="secondary shops-refresh" aria-label="Refresh shops" disabled={state.loading} onClick={() => void state.reload()}><Icon name="refresh" /><span>Refresh</span></button></section>
    <div className="shops-results-heading"><p><strong>{state.data?.count ?? "—"}</strong> {state.data?.count === 1 ? "shop" : "shops"}{query && <span> matching “{query}”</span>}</p>{(input || query) && <button className="secondary" onClick={clear}><Icon name="close" />Clear search</button>}</div>
    <Feedback {...state} />
    <div className="platform-cards shop-management-grid">{state.data?.results.map(shop => <section className="shop-management-card" key={shop.id}>
      <header><span className="shop-directory-symbol"><Icon name="Shops" /></span><span className={`shop-state ${shop.suspended ? "is-paused" : shop.published ? "is-published" : ""}`}><i aria-hidden="true" />{shop.suspended ? "Suspended" : shop.published ? "Published" : "Draft"}</span></header>
      <div className="shop-card-identity"><h2>{shop.name}</h2><p className="shop-handle">/{shop.slug}</p></div>
      <dl className="shop-directory-meta"><div><dt><Icon name="Team" />Owner</dt><dd>{shop.owners.join(", ") || "No active owner"}</dd></div>{shop.branches && <div><dt><Icon name="Shops" />Branches</dt><dd>{shop.branches.length}</dd></div>}{shop.currency && <div><dt><Icon name="wallet" />Currency</dt><dd>{shop.currency}</dd></div>}</dl>
      <div className="shop-directory-actions"><button onClick={() => onOpen(shop.id)} aria-label={`Manage ${shop.name}`}>Manage shop<Icon name="right" /></button>{shop.published && !shop.suspended && <Link href={`/shop/${encodeURIComponent(shop.slug)}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${shop.name} storefront in a new tab`} title="View storefront in a new tab"><Icon name="external" /></Link>}</div>
    </section>)}</div>
    {state.data?.count === 0 && <div className="shops-empty"><Icon name="Shops" /><h2>No shops found.</h2><p>{query ? "Try a different shop name or clear your search." : "Create your first shop to start managing its storefront and team."}</p>{query ? <button className="secondary" onClick={clear}>Show all shops</button> : <button onClick={() => setCreating(true)}><Icon name="plus" />Create your first shop</button>}</div>}
    {!!state.data?.count && <Pager data={state.data} page={page} setPage={setPage} />}
    {creating && <CreateShop onClose={close} onCreated={id => { setCreating(false); onOpen(id); }} />}
  </div>;
}
