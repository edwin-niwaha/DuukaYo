"use client";
import Link from "next/link";
import PlatformShell from "./PlatformShell";
import Icon from "@/components/Icon";
import Shops from "./Shops";
import MetricCard from "@/components/MetricCard";
import { useState } from "react";
import { logoutWeb, money, type Profile } from "@/lib/api";
import PlatformShop from "./PlatformShop";
import PlatformSettings from "./PlatformSettings";
import Audit from "./AuditTrail";
import Users from "./Users";
import { Feedback, formData, useAction, useData } from "./shared";

const tabs = ["Overview", "Shops", "Users", "Settings", "Audit"] as const;
export default function PlatformAdmin({ profile, onShopWorkspace }: { profile: Profile; onShopWorkspace: () => void }) {
  const [tab, setTab] = useState<typeof tabs[number]>("Overview");
  const [shopId, setShopId] = useState<number | null>(null);
  const action = useAction();
  return <PlatformShell active={tab} tabs={tabs} adminUrl={profile.admin_url} onNavigate={name => { setTab(name as typeof tab); setShopId(null); }} header={
    <><div><Link href="/" className="brand">DuukaYo</Link><p>Platform administration</p></div><div className="platform-actions"><span>{profile.username}</span><Link href="/">Marketplace</Link>{profile.memberships.length > 0 && <button className="secondary" onClick={onShopWorkspace}>My shop workspace</button>}<button className="secondary" disabled={action.busy} onClick={() => void action.run(async () => { await logoutWeb(); window.location.replace("/"); })}>Sign out</button></div></>}>
      <main className="platform-content"><Feedback {...action} />
        {tab === "Overview" && <Overview />}
        {tab === "Shops" && (shopId ? <PlatformShop key={shopId} id={shopId} userId={profile.id} onBack={() => setShopId(null)} /> : <Shops onOpen={setShopId} />)}
        {tab === "Users" && <Users profile={profile} />}
        {tab === "Settings" && <PlatformSettings />}
        {tab === "Audit" && <Audit />}
      </main>
  </PlatformShell>;
}

type Summary = { shops: number; suspended_shops: number; users: number; pending_orders: number; from: string; to: string; totals: { currency: string; sales: number; refunds: number; net: number; transactions: number }[] };
function Overview() {
  const [range, setRange] = useState("");
  const state = useData<Summary>("platform/reports/" + range);
  return <div className="platform-overview">
    <header className="overview-heading"><div><span className="eyebrow">AT A GLANCE</span><h1>Platform overview</h1><p>Your shops, people and orders in one place.</p></div><span className="overview-label"><Icon name="Overview" />Platform activity</span></header>
    <Feedback {...state} />
    {state.data && <section className="overview-metrics" aria-label="Platform statistics">
      <MetricCard label="Shops" value={state.data.shops} note="Across your platform" icon="Shops" />
      <MetricCard label="Accounts" value={state.data.users} note="Customers and team members" icon="Customers" tone="blue" />
      <MetricCard label="Pending orders" value={state.data.pending_orders} note="Awaiting shop confirmation" icon="Orders" tone="amber" />
      <MetricCard label="Suspended shops" value={state.data.suspended_shops} note="Currently paused" icon="shield" tone="purple" />
    </section>}
    <section className="report-section">
      <header className="report-heading"><span className="metric-icon"><Icon name="Sales" /></span><div><h2>Sales performance</h2><p>Financial reports use UTC dates. Each currency is reported separately.</p></div></header>
      <form className="report-filters" onSubmit={e => { e.preventDefault(); const d = formData(e.currentTarget); setRange(`?from=${d.from}&to=${d.to}`); }}><label>From date<input type="date" name="from" required /></label><label>To date<input type="date" name="to" required /></label><button><Icon name="calendar" />Update report</button></form>
      {state.data && <><p className="report-period">{state.data.from} <span aria-hidden="true">—</span> {state.data.to}</p>{state.data.totals.length === 0 && <div className="report-empty"><span className="metric-icon"><Icon name="Sales" /></span><h3>No sales or refunds in this period.</h3><p>Your sales summary will appear here once transactions are recorded.</p></div>}{state.data.totals.map(row => <section className="currency-report" key={row.currency}><h3><span>{row.currency}</span> Sales summary</h3><dl className="finance-metrics">{[["Sales", money(row.sales, row.currency), "wallet"], ["Refunds", money(row.refunds, row.currency), "Operations"], ["Net sales", money(row.net, row.currency), "Sales"], ["Transactions", row.transactions, "Orders"]].map(([label, value, icon]) => <div key={label}><dt><Icon name={String(icon)} />{label}</dt><dd>{value}</dd></div>)}</dl></section>)}</>}
    </section>
  </div>;

}
