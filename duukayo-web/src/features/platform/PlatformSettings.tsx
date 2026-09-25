"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { Feedback, useAction, useData, type Settings } from "./shared";

function SettingsForm({ initial, reload }: { initial: Settings; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState(initial);
  const action = useAction();
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  return <form className="platform-settings-form" onSubmit={event => {
    event.preventDefault();
    void action.run(async () => { await api("platform/settings/", { name: draft.name, support_email: draft.support_email, notice: draft.notice, orders_enabled: draft.orders_enabled, shop_registration_enabled: draft.shop_registration_enabled }, "PATCH"); await reload(); }, "Platform settings saved.");
  }}>
    <Feedback {...action} />
    <fieldset disabled={action.busy} className="settings-sections">
      <div className="settings-primary">
        <section className="settings-card">
          <header><span className="settings-section-icon"><Icon name="Shops" /></span><div><h2>Platform identity</h2><p>Your name and support contact across the marketplace.</p></div></header>
          <div className="settings-identity-fields"><label>Platform name<input name="name" required maxLength={120} value={draft.name} onChange={event => update("name", event.target.value)} /></label><label>Support email<input name="support_email" type="email" placeholder="support@example.com" value={draft.support_email} onChange={event => update("support_email", event.target.value)} /></label></div>
        </section>
        <section className="settings-card">
          <header><span className="settings-section-icon"><Icon name="edit" /></span><div><h2>Marketplace announcement</h2><p>A short message for people browsing your shops.</p></div></header>
          <label><span className="sr-only">Marketplace announcement</span><textarea aria-label="Marketplace announcement" name="notice" maxLength={500} rows={4} placeholder="Share an update with your customers…" aria-describedby="announcement-help" value={draft.notice} onChange={event => update("notice", event.target.value)} /></label>
          <div className="settings-field-help" id="announcement-help"><span>Leave empty to hide the announcement.</span><span>{draft.notice.length}/500</span></div>
          {draft.notice.trim() && <div className="announcement-preview"><small>MESSAGE PREVIEW</small><p>{draft.notice}</p></div>}
        </section>
      </div>
      <section className="settings-card settings-availability">
        <header><span className="settings-section-icon"><Icon name="Settings" /></span><div><h2>Platform availability</h2><p>Control new orders and shop sign-ups.</p></div></header>
        <label className="settings-toggle"><span><strong>Accept new customer orders</strong><small>Existing orders and tracking remain available when paused.</small></span><input type="checkbox" name="orders_enabled" checked={draft.orders_enabled} onChange={event => update("orders_enabled", event.target.checked)} aria-label="Accept new customer orders" /><span className="settings-switch" aria-hidden="true" /></label>
        <label className="settings-toggle"><span><strong>Allow self-service shop registration</strong><small>Administrators can still create shops when sign-ups are closed.</small></span><input type="checkbox" name="shop_registration_enabled" checked={draft.shop_registration_enabled} onChange={event => update("shop_registration_enabled", event.target.checked)} aria-label="Allow self-service shop registration" /><span className="settings-switch" aria-hidden="true" /></label>
        <p className="settings-availability-note"><Icon name="shield" /><span>Changes apply across all shops after you save.</span></p>
      </section>
    </fieldset>
    <footer className="settings-save-bar"><span>{action.busy ? "Saving settings…" : changed ? "You have unsaved changes" : "All changes saved"}</span><div><button className="secondary" type="button" disabled={!changed || action.busy} onClick={() => setDraft(initial)}>Discard changes</button><button type="submit" disabled={!changed || action.busy}><Icon name="save" />{action.busy ? "Saving…" : "Save platform settings"}</button></div></footer>
  </form>;
}

export default function PlatformSettings() {
  const state = useData<Settings>("platform/settings/");
  return <div className="platform-settings-page"><header className="management-page-heading"><div><h1>Platform settings</h1><p>Manage your marketplace identity, messages and availability.</p></div><span className="management-page-badge"><Icon name="Settings" />Platform-wide</span></header><Feedback {...state} />{state.data && <SettingsForm key={JSON.stringify(state.data)} initial={state.data} reload={state.reload} />}</div>;
}
