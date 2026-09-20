export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (method !== "GET") {
    const csrf = await fetch("/api/backend/auth/session/", {
      cache: "no-store",
    });
    const token = await csrf.json();
    headers["X-CSRFToken"] = token.csrfToken;
  }
  const response = await fetch("/api/backend/" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(
      typeof data?.detail === "string" ? data.detail : JSON.stringify(data),
    );
  return data as T;
}
export const money = (value: number, currency = "UGX") =>
  currency + " " + value.toLocaleString("en-UG");
export type Business = {
  id: number;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  contact: string;
  logo: string;
  delivery_enabled: boolean;
  delivery_fee: number;
  safety_buffer: number;
};
export type Membership = {
  business: Business;
  branch: number;
  role: "owner" | "manager" | "cashier";
};
export type Profile = {
  id: number;
  username: string;
  memberships: Membership[];
};
export type Product = {
  id: number;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  cost: number;
  quantity: number;
  reserved: number;
  published: boolean;
  active: boolean;
  low_stock_threshold: number;
  category: number | null;
};
export type Customer = { id: number; name: string; phone: string };
export type Line = {
  product: number;
  name: string;
  quantity: number;
  price: number;
  discount: number;
};
export type Sale = {
  id: number;
  client_id: string;
  total: number;
  delivery_fee: number;
  currency: string;
  occurred_at: string;
  review_reasons: string[];
  lines: Line[];
  payment: {
    method: string;
    tendered: number;
    change: number;
    provider_verified: boolean;
  };
};
export type Order = {
  id: number;
  name: string;
  phone: string;
  delivery: boolean;
  address: string;
  total: number;
  currency: string;
  status: string;
  payment_state: string;
  lines: Line[];
};
export type Report = {
  total: number;
  transactions: number;
  estimated_gross_profit: number;
  by_payment_method: Record<string, number>;
  low_stock: { name: string; quantity: number; reserved: number }[];
  known_pending_sales: number;
  sync_notice: string;
  currency: string;
};
