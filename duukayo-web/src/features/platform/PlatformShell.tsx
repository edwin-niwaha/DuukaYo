"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "@/components/Icon";

export default function PlatformShell({ active, tabs, adminUrl, onNavigate, header, children }: {
  active: string; tabs: readonly string[]; adminUrl?: string | null; onNavigate: (tab: string) => void;
  header: ReactNode; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = matchMedia("(max-width: 850px)");
    const update = () => { setMobile(media.matches); setOpen(false); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobile || !open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => closeButton.current?.focus());
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previous; };
  }, [mobile, open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  return <div className={`platform-shell platform-shell-v2 ${collapsed ? "platform-collapsed" : ""}`}>
    <header className="platform-header" inert={mobile && open}>
      <button ref={trigger} className="platform-menu" aria-label={mobile ? "Open navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-controls="platform-navigation" aria-expanded={mobile ? open : !collapsed}
        onClick={() => mobile ? setOpen(true) : setCollapsed(value => !value)}><Icon name="menu" /></button>
      {header}
    </header>
    {mobile && open && <button className="platform-backdrop" aria-label="Close navigation overlay" tabIndex={-1} onClick={close} />}
    <div className="platform-layout">
      <aside ref={drawer} id="platform-navigation" className={`platform-sidebar ${open ? "is-open" : ""}`}
        role={mobile ? "dialog" : undefined} aria-modal={mobile && open ? true : undefined} aria-label="Platform menu" inert={mobile && !open}
        onKeyDown={event => {
          if (!mobile || !open) return;
          if (event.key === "Escape") { event.preventDefault(); close(); }
          if (event.key === "Tab") {
            const nodes = Array.from(drawer.current?.querySelectorAll<HTMLElement>('a[href], button') || []).filter(node => node.offsetParent !== null);
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <div className="platform-sidebar-heading"><span className="platform-nav-label">PLATFORM</span><button ref={closeButton} className="platform-drawer-close" aria-label="Close navigation" onClick={close}><Icon name="close" /></button></div>
        <nav className="platform-nav" aria-label="Platform navigation">
          {tabs.map(name => <button key={name} title={name} aria-label={name} aria-current={active === name ? "page" : undefined}
            className={active === name ? "active" : "secondary"} onClick={() => { onNavigate(name); if (mobile) close(); }}>
            <Icon name={name === "Users" ? "Customers" : name === "Audit" ? "Orders" : name} /><span className="platform-nav-label">{name}</span>
          </button>)}
          {adminUrl && <a href={adminUrl} title="Django maintenance" aria-label="Django maintenance"><Icon name="external" /><span className="platform-nav-label">Django maintenance</span></a>}
        </nav>
      </aside>
      <div className="platform-main" inert={mobile && open}>{children}</div>
    </div>
  </div>;
}
