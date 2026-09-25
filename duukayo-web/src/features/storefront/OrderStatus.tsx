"use client";
import { useFeedback } from "../../lib/feedback";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { GuestOrder, orderMessages, orderSteps } from "@/lib/storefront";
export default function OrderStatus({ token }: { token: string }) {
  const [order, setOrder] = useState<GuestOrder | null>(null);
  const [error, setError] = useFeedback("error");
  useEffect(() => {
    let live = true, inFlight = false, terminal = false, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (!live || inFlight || terminal) return;
      clearTimeout(timer);
      if (!(!document.hidden)) { timer = setTimeout(refresh, 15000); return; }
      inFlight = true;
      try {
        const value = await api<GuestOrder>("guest-orders/" + encodeURIComponent(token) + "/");
        if (live) { setOrder(value); setError(""); }
        terminal = ["completed", "cancelled"].includes(value.status); failures = 0;
      } catch (e) { failures++; if (live) setError((e as Error).message); }
      finally {
        inFlight = false;
        if (live && !terminal) timer = setTimeout(refresh, Math.min(60000, 15000 * Math.pow(2, failures)));
      }
    }
    void refresh();
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { live = false; clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [token, setError]);
  return (
    <main className="status-page">
      <Link className="brand" href="/">
        ◈ DuukaYo
      </Link>
      <section className="panel">
        <p className="eyebrow">
          {order
            ? `ORDER #${order.id} · ${order.delivery ? "DELIVERY" : "PICKUP"}`
            : "YOUR ORDER"}
        </p>
        <h1>{order?.shop || "Checking your order…"}</h1>
        {error && (
          <p className="error">
            {error}
          </p>
        )}
        {order && (
          <>
            <span className="badge">{order.status}</span>
            <p style={{ marginTop: 20 }} aria-live="polite">
              {orderMessages[order.status] ||
                "The shop is updating your order."}
            </p>
            {order.status !== "cancelled" && (
              <div className="order-progress" aria-label="Order progress">
                {orderSteps.map((step, i) => (
                  <div
                    key={step}
                    className={
                      i <= orderSteps.indexOf(order.status) ? "complete" : ""
                    }
                  >
                    {step}
                  </div>
                ))}
              </div>
            )}
            {order.lines.map((l, i) => (
              <div className="order-receipt-line" key={i}>
                <span>
                  {l.quantity} × {l.name}
                </span>
                <strong>{money(l.quantity * l.price, order.currency)}</strong>
              </div>
            ))}
            <div className="order-receipt-line">
              <span>{order.delivery ? "Delivery" : "Pickup"}</span>
              <span>{money(order.delivery_fee, order.currency)}</span>
            </div>
            <div className="total">
              <span>Total</span>
              <strong>{money(order.total, order.currency)}</strong>
            </div>
            <p className="muted">
              Payment: {order.payment_state.replaceAll("_", " ")}.{" "}
              {order.payment_state === "unpaid" &&
                "Pay at pickup or arrange payment with the shop."}
            </p>
            {order.contact && (
              <p>
                Contact the shop: <strong>{order.contact}</strong>
              </p>
            )}
            <p className="notice">
              Keep this private link to track your order.{" "}
              {order.status === "pending" &&
                `The shop needs to accept it before ${new Date(order.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`}{" "}
              Status updates automatically.
            </p>
            <Link className="market-cta" href={`/shop/${order.shop_slug}`}>
              Back to the shop →
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
