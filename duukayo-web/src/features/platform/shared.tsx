"use client";
import { useFeedback } from "../../lib/feedback";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Business } from "@/lib/api";

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
export type Shop = Business & { suspended: boolean; owners: string[] };
export type ShopAccess = { id?: number; business: number; shop_name?: string; branch: number; branch_name?: string; role: "owner" | "manager" | "cashier"; active: boolean };
export type User = { photo?: string; phone?: string; job_title?: string; location?: string; date_joined?: string; last_login?: string; is_staff?: boolean; shop_access?: ShopAccess[]; id: number; username: string; email: string; first_name: string; last_name: string; is_active: boolean; platform_admin: boolean; is_superuser: boolean };
export type Settings = { name: string; support_email: string; notice: string; orders_enabled: boolean; shop_registration_enabled: boolean };
export const formData = (form: HTMLFormElement) => Object.fromEntries(new FormData(form)) as Record<string, string>;

export async function allPages<T>(url: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const data = await api<Page<T>>(`${url}?page=${page}`);
    rows.push(...data.results);
    if (!data.next) return rows;
  }
}

export function useData<T>(url: string, revision = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useFeedback("error");
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const previousUrl = useRef(url);
  const reload = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true); setError("");
    try { const result = await api<T>(url); if (id === generation.current) setData(result); }
    catch (e) { if (id === generation.current) { setError((e as Error).message); setData(undefined); } }
    finally { if (id === generation.current) setLoading(false); }
  }, [url, setError]);
  useEffect(() => {
    const counter = generation;
    if (previousUrl.current !== url) { setData(undefined); previousUrl.current = url; }
    void reload();
    return () => { counter.current++; };
  }, [reload, revision, url]);
  return { data, error, loading, reload };
}

export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useFeedback("error"), [notice, setNotice] = useFeedback("success");
  const working = useRef(false);
  async function run(work: () => Promise<unknown>, message = "Saved successfully") {
    if (working.current) return false;
    working.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); setNotice(message); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); working.current = false; }
  }
  return { busy, error, notice, run };
}

export function Feedback({ error, notice, loading }: { error?: string; notice?: string; loading?: boolean }) {
  return <>{error && <p className="error">{error}</p>}{notice && <p className="success">{notice}</p>}{loading && <p role="status">Loading…</p>}</>;
}

export function Pager({ data, page, setPage }: { data?: { count: number; next: string | null }; page: number; setPage: (value: number) => void }) {
  return <div className="platform-pager"><button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous page</button><span>Page {page} · {data?.count ?? 0} records</span><button className="secondary" disabled={!data?.next} onClick={() => setPage(page + 1)}>Next page</button></div>;
}
