"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import SearchField from "@/components/SearchField";
import { Feedback, Pager, useData, type Page } from "./shared";

type AuditRow = { id: number; actor: string; shop: string; action: string; reference: string; created_at: string; detail: unknown };

export default function AuditTrail() {
  const [input, setInput] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const state = useData<Page<AuditRow>>(`platform/audit/?q=${encodeURIComponent(query)}&page=${page}`);
  function clear() { setInput(""); setQuery(""); setPage(1); }

  return <div className="audit-page">
    <header className="management-page-heading"><div><h1>Audit trail</h1><p>Track administrative actions and shop activity.</p></div><span className="management-page-badge"><Icon name="shield" />Read-only history</span></header>
    <section className="audit-directory" aria-label="Audit records">
      <div className="audit-toolbar"><form role="search" aria-label="Search audit records" onSubmit={event => { event.preventDefault(); setQuery(input.trim()); setPage(1); }}><SearchField label="Search audit trail" placeholder="Search events…" title="Find events by actor, shop or action" name="q" value={input} onChange={event => setInput(event.target.value)} /><button type="submit" aria-label="Search audit">Search</button></form><button type="button" className="secondary audit-refresh" disabled={state.loading} onClick={() => void state.reload()}><Icon name="refresh" />Refresh</button></div>
      <div className="audit-results-heading"><p>{state.data ? `${state.data.count} ${state.data.count === 1 ? "event" : "events"}` : "Loading events…"}{query && <span> matching “{query}”</span>}</p>{(input || query) && <button className="secondary" onClick={clear}><Icon name="close" />Clear search</button>}</div>
      <Feedback {...state} />
      <div className="audit-list">{state.data?.results.map(row => <details className="audit-event" key={row.id}>
        <summary><span className="audit-event-icon"><Icon name="Orders" /></span><span className="audit-event-description"><strong>{row.action}</strong><span><b>{row.actor || "System"}</b><span aria-hidden="true"> · </span>{row.shop || "Platform"}</span></span><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleDateString()}<small>{new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></time><span className="audit-expand"><Icon name="right" /></span></summary>
        <div className="audit-event-body"><dl><div><dt>Event</dt><dd>#{row.id}</dd></div><div><dt>Reference</dt><dd>{row.reference || "—"}</dd></div><div><dt>Recorded at</dt><dd>{new Date(row.created_at).toLocaleString()}</dd></div></dl><h3>Event details</h3><pre className="platform-json" tabIndex={0} aria-label={`Details for event ${row.id}`}>{JSON.stringify(row.detail, null, 2) ?? "No additional details."}</pre></div>
      </details>)}</div>
      {state.data?.count === 0 && <div className="audit-empty"><Icon name="search" /><h2>{query ? "No matching events" : "No activity yet"}</h2><p>{query ? "Try a different actor, shop name or action." : "Administrative and shop activity will appear here."}</p>{query && <button className="secondary" onClick={clear}>Show all events</button>}</div>}
      {!!state.data?.count && <Pager data={state.data} page={page} setPage={setPage} />}
    </section>
  </div>;
}
