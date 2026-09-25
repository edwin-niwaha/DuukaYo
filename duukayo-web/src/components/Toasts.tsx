"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { notify, subscribeToasts, type Toast } from "@/lib/feedback";

function ToastCard({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || toast.tone === "error") return;
    const timer = setTimeout(() => dismiss(toast.id), 6500);
    return () => clearTimeout(timer);
  }, [dismiss, paused, toast]);
  return <div className={`toast-card toast-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <span className="toast-symbol" aria-hidden="true">{toast.tone === "error" ? "!" : toast.tone === "success" ? "✓" : "i"}</span>
    <div><strong>{toast.tone === "error" ? "Please review" : toast.tone === "success" ? "All done" : "Good to know"}</strong><p>{toast.message}</p></div>
    <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>×</button>
  </div>;
}

export default function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const dismiss = useCallback((id: number) => setItems(old => old.filter(item => item.id !== id)), []);
  useEffect(() => {
    function syncDialog() {
      const focused = document.activeElement?.closest<HTMLDialogElement>("dialog[open]");
      const opened = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]"));
      setDialog(focused || opened.filter(element => element.matches(":modal")).at(-1) || null);
    }
    syncDialog();
    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    document.addEventListener("focusin", syncDialog);
    return () => { observer.disconnect(); document.removeEventListener("focusin", syncDialog); };
  }, []);
  useEffect(() => subscribeToasts(toast => setItems(old => [...old.slice(-2), toast])), []);
  useEffect(() => {
    let lastInvalid = 0;
    function invalid(event: Event) {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      event.preventDefault();
      field.setAttribute("aria-invalid", "true");
      if (Date.now() - lastInvalid < 150) return;
      lastInvalid = Date.now();
      const label = field.labels?.[0]?.textContent?.trim() || field.getAttribute("aria-label") || field.name.replaceAll("_", " ") || "This field";
      const message = field.validity.valueMissing ? "This field is required."
        : field instanceof HTMLInputElement && field.validity.tooShort ? `Use at least ${field.minLength} characters.`
        : field instanceof HTMLInputElement && field.type === "email" && field.validity.typeMismatch ? "Enter a valid email address."
        : field.validationMessage;
      notify(`${label}: ${message}`, "error");
      field.focus();
    }
    function input(event: Event) {
      const field = event.target;
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        if (field.validity.valid) field.removeAttribute("aria-invalid");
      }
    }
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", input, true);
    return () => { document.removeEventListener("invalid", invalid, true); document.removeEventListener("input", input, true); };
  }, []);
  const viewport = <section className={`toast-viewport${dialog ? " toast-in-dialog" : ""}`} aria-label="Notifications">{items.map(toast => <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />)}</section>;
  // Modal dialogs live in the browser's top layer; z-index alone cannot reach it.
  return dialog ? createPortal(viewport, dialog.querySelector("[data-toast-host]") || dialog) : viewport;
}
