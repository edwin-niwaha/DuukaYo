import { ApiError, requestJson, serializeBody } from "./http";
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const payload = serializeBody(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (method !== "GET") {
    const token = await requestJson<{ csrfToken?: string }>("/api/backend/auth/session/", {
      cache: "no-store",
    });
    if (!token?.csrfToken)
      throw new ApiError("Unable to start a secure session. Please reload and try again.", 502);
    headers["X-CSRFToken"] = token.csrfToken;
  }
  const result = await requestJson<T>("/api/backend/" + path, {
    method,
    headers,
    body: payload,
    cache: "no-store",
  }, 20000);
  if (typeof window !== "undefined" && method !== "GET" && ["auth/session/", "auth/google/session/"].includes(path)) window.dispatchEvent(new Event("session-change"));
  return result;
}
export const money = (value: number, currency = "UGX") =>
  currency + " " + value.toLocaleString("en-UG");
export type Business = {
  description: string;
  website: string;
  published: boolean;
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
  storefront_branch?: number | null;
  branches?: { id: number; name: string }[];
};
export type Membership = {
  business: Business;
  branch: number;
  role: "owner" | "manager" | "cashier";
};
export type Profile = {
  id: number;
  username: string;
  is_staff?: boolean;
  can_manage_platform?: boolean;
  can_manage_admins?: boolean;
  admin_url?: string | null;
  memberships: Membership[];
};
export type Product = {
  showcase?: boolean;
  description?: string;
  gallery?: string[];
  variant_group?: string;
  attributes?: Record<string, string>;
  category_name?: string;
  image?: string;
  id: number;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  cost: number | null;
  quantity: number;
  reserved: number;
  published: boolean;
  active: boolean;
  low_stock_threshold: number;
  category: number | null;
};
export type Customer = { id: number; name: string; phone: string };
export type Line = {
  id?: number;
  product: number;
  name: string;
  quantity: number;
  price: number;
  discount: number;
};
export type Sale = {
  allocations?: { method: string; amount: number; reference: string }[];
  id: number;
  client_id: string;
  total: number;
  delivery_fee: number;
  currency: string;
  occurred_at: string;
  review_reasons: string[];
  lines: Line[];
  payment: {
    reference?: string;
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
/** End the server session before leaving protected screens. */
export async function logoutWeb() {
  // Commit local cart edits before the session is ended.
  const { syncCart, clearAccountCart } = await import("./shopping-cart");
  try { await syncCart(); } catch { /* Logout remains available if sync is offline. */ }
  await api("auth/session/", undefined, "DELETE");
  try {
    clearAccountCart();
    localStorage.setItem("duukayo-session-ended", String(Date.now()));
  } catch {
    /* Other tabs will still be rejected by the server. */
  }
}

export async function uploadImage(businessId: number, file: File, progress: (n: number) => void, endpoint?: string): Promise<string> {
  const token = await api<{ csrfToken: string }>("auth/session/");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/backend/${endpoint || `businesses/${businessId}/images/`}`);
    xhr.setRequestHeader("X-CSRFToken", token.csrfToken);
    xhr.timeout = 240000;
    xhr.upload.onprogress = e => { if (e.lengthComputable) progress(Math.round(e.loaded * 100 / e.total)); };
    xhr.onerror = xhr.ontimeout = () => reject(new Error("Upload interrupted. Try again."));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data.url);
        else reject(new Error(JSON.stringify(data)));
      } catch { reject(new Error("Upload failed. Try again.")); }
    };
    const form = new FormData(); form.append("image", file); xhr.send(form);
  });
}
