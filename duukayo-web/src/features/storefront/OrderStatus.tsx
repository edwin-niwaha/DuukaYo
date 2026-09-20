"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money, Order } from "@/lib/api";
export default function OrderStatus({ token }: { token: string }) {
  const [order, setOrder] = useState<(Order & { shop: string }) | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = () =>
      api<Order & { shop: string }>(
        `guest-orders/${encodeURIComponent(token)}/`,
      )
        .then((o) => {
          if (live) {
            setOrder(o);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [token]);
  return (
    <main className="status-page">
      <Link className="brand" href="/">
        ◈ DuukaYo
      </Link>
      <section className="panel">
        <p className="eyebrow">Your order</p>
        <h1>{order?.shop || "Checking your order…"}</h1>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {order && (
          <>
            <span className="badge">{order.status}</span>
            <h2>{money(order.total, order.currency)}</h2>
            <p>Payment: {order.payment_state.replaceAll("_", " ")}</p>
            {order.lines.map((l, i) => (
              <p key={i}>
                {l.quantity} × {l.name}
              </p>
            ))}
            <p className="notice">
              Keep this private link to check your order. Pending reservations
              expire after 30 minutes unless accepted by the shop.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
