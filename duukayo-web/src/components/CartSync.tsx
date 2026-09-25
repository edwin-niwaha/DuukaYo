"use client";
import { useEffect, useState } from "react";
import { syncCart } from "@/lib/shopping-cart";

export default function CartSync() {
  const [error, setError] = useState(false);
  useEffect(() => {
    const sync = () => { void syncCart().then(() => setError(false)).catch(() => setError(true)); };
    sync();
    const events = ["cart-change", "session-change", "online", "focus"];
    events.forEach(event => window.addEventListener(event, sync));
    const storage = (event: StorageEvent) => { if ((event.key === "duukayo-cart-dirty" && event.newValue) || event.key === "duukayo-session-ended") sync(); };
    window.addEventListener("storage", storage);
    return () => { events.forEach(event => window.removeEventListener(event, sync)); window.removeEventListener("storage", storage); };
  }, []);
  return error ? <div className="cart-sync-notice" role="status">Your cart is saved on this device. Account sync needs another try. <button onClick={() => { void syncCart().then(() => setError(false)).catch(() => setError(true)); }}>Retry sync</button></div> : null;
}
