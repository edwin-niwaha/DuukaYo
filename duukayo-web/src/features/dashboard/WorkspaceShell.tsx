"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Membership } from "@/lib/api";

import Icon from "@/components/Icon";
export default function WorkspaceShell({ memberships, selected, onBusiness, active, tabs, onNavigate, pending, username, busy, onLogout, children }: {
  memberships: Membership[]; selected: number; onBusiness: (value: number) => void;
  active: string; tabs: string[]; onNavigate: (tab: string) => void; pending: number;
  username: string; busy: boolean; onLogout: () => void; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const membership = memberships[selected];
  const business = membership.business;
  useEffect(() => {
    const media = window.matchMedia("(max-width: 850px)");
    const update = () => { setMobile(media.matches); setOpen(false); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusDrawer = () => {
      if (!drawer.current?.contains(document.activeElement)) closeButton.current?.focus();
    };
    const focusFrame = requestAnimationFrame(focusDrawer);
    // Retry after the slide-in has settled; Chromium may reject focus while
    // visibility and inert are changing in the opening frame.
    const focusTimer = window.setTimeout(focusDrawer, 250);
    return () => { cancelAnimationFrame(focusFrame); window.clearTimeout(focusTimer); document.body.style.overflow = previous; };
  }, [mobile, open]);
  function close() { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }
  const branch = business.branches?.find(branch => branch.id === membership.branch)?.name || `Branch ${membership.branch}`;
  return <div className={`workspace workspace-v2 ${collapsed ? "sidebar-collapsed" : ""}`}>
    {mobile && open && <button className="sidebar-backdrop" aria-label="Close navigation overlay" tabIndex={-1} onClick={close} />}
    <aside ref={drawer} id="workspace-navigation" className={`sidebar ${open ? "mobile-open" : ""}`} role={mobile ? "dialog" : undefined} aria-modal={mobile && open ? true : undefined} aria-label="Workspace navigation" inert={mobile && !open}
      onKeyDown={event => {
        if (!mobile || !open) return;
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "Tab") {
          const nodes = Array.from(drawer.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled)') || []).filter(node => node.offsetParent !== null);
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <div className="sidebar-brand-row"><Link className="brand" href="/" aria-label="DuukaYo marketplace"><span aria-hidden="true" className="brand-symbol"><Icon name="Catalog" /></span><span className="nav-label">DuukaYo</span></Link>
        <button ref={closeButton} className="drawer-close" onClick={close} aria-label="Close navigation"><Icon name="close" /></button>
      </div>
      <div className="sidebar-scroll">
        <div className="business-picker"><small>WORKSPACE</small><select aria-label="Business" value={selected} disabled={busy} onChange={e => { onBusiness(Number(e.target.value)); if (mobile) close(); }}>
          {memberships.map((m, i) => <option key={`${m.business.id}:${m.branch}`} value={i}>{m.business.name}</option>)}
        </select><span className="badge">{membership.role}</span></div>
        <button className="collapsed-business" aria-label="Switch business" title="Switch business" onClick={() => setCollapsed(false)}><Icon name="Operations" /></button>
        <p className="sidebar-group nav-label">MANAGE YOUR BUSINESS</p>
        <nav aria-label="Business navigation">{tabs.map(tab => <button key={tab} title={tab} aria-label={tab} aria-current={active === tab ? "page" : undefined} className={active === tab ? "active" : ""} onClick={() => { onNavigate(tab); if (mobile) close(); }}>
          <span className="nav-icon" aria-hidden="true"><Icon name={tab} /></span><span className="nav-label">{tab}</span>{tab === "Orders" && pending > 0 && <b aria-label={`${pending} pending orders`}>{pending}</b>}
        </button>)}</nav>
      </div>
      <div className="sidebar-bottom"><Link href={`/shop/${business.slug}`} target="_blank" title="Visit your storefront" aria-label="Visit your storefront"><span aria-hidden="true"><Icon name="external" /></span><span className="nav-label">View storefront</span></Link>
        <div className="sidebar-person"><span className="avatar">{username[0].toUpperCase()}</span><div className="nav-label"><strong>{username}</strong><small>{membership.role}</small></div></div>
        <button disabled={busy} onClick={onLogout} aria-label="Sign out" title="Sign out"><span aria-hidden="true"><Icon name="logout" /></span><span className="nav-label">Sign out</span></button>
      </div>
    </aside>
    <div className="main-area" inert={mobile && open}>
      <header className="topbar"><button ref={trigger} className="hamburger" aria-controls="workspace-navigation" aria-expanded={mobile ? open : !collapsed} aria-label={mobile ? "Open navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => mobile ? setOpen(!open) : setCollapsed(!collapsed)}><span aria-hidden="true"><Icon name="menu" /></span></button>
        <div className="workspace-context"><strong>{business.name}</strong><span>{branch} <span aria-hidden="true">/</span> {active}</span></div>
        <Link href="/" className="workspace-market-link">Marketplace <Icon name="external" /></Link>
        <button className="workspace-logout" disabled={busy} onClick={onLogout}>{busy ? "Please wait…" : "Log out"}</button>
      </header>
      {children}
    </div>
  </div>;
}
