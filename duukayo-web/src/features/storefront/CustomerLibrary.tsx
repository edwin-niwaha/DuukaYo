"use client";
import Link from "next/link";
import { cartLines } from "@/lib/shopping-cart";
import { useEffect, useState } from "react";
export function rememberOrder(token: string) {
  let previous: string[] = [];
  try {
    const stored = JSON.parse(localStorage.getItem("duukayo-orders") || "[]");
    if (Array.isArray(stored)) previous = stored.filter(t => typeof t === "string");
  } catch { /* A damaged history must not prevent confirmation cleanup. */ }
  localStorage.setItem("duukayo-orders", JSON.stringify([...new Set([token, ...previous])].slice(0, 20)));
  localStorage.setItem("duukayo-last-order", token);
}
export default function CustomerLibrary() {
  const [carts, setCarts] = useState<string[]>([]);
  const [orders, setOrders] = useState<string[]>([]);
  useEffect(() => {
    try {
      setCarts([...new Set(cartLines().map(line => line.slug))]);
      const saved = JSON.parse(localStorage.getItem("duukayo-orders") || "[]");
      const last = localStorage.getItem("duukayo-last-order");
      setOrders([...new Set([...(last ? [last] : []), ...(Array.isArray(saved) ? saved.filter(t => typeof t === "string") : [])])].slice(0, 20));
    } catch { /* Saved browsing is optional. */ }
  }, []);
  if (!carts.length && !orders.length) return null;
  return <section className="customer-library" aria-label="Your shopping">
    <div><h2>Your shopping</h2></div>
    <div className="library-links">{carts.length > 0 && <Link href="/cart">View cart →</Link>}{carts.map(slug => <Link key={slug} href={"/shop/" + encodeURIComponent(slug) + "#cart"}>Cart · {slug.replaceAll("-", " ")} →</Link>)}
    {orders.map((token, i) => <Link key={token} href={"/order/" + encodeURIComponent(token)}>Track {i === 0 ? "latest" : "recent"} order {i > 0 ? i + 1 : ""} →</Link>)}
    {!carts.length && !orders.length && <p className="muted">Your saved carts and order links will appear here on this device.</p>}</div>
  </section>;
}
