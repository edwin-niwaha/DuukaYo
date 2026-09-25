function validationMessage(value: unknown, path = ""): string {
  if (typeof value === "string") {
    const label = path.replaceAll("_", " ");
    return (label ? label.charAt(0).toUpperCase() + label.slice(1) + ": " : "") + value;
  }
  if (Array.isArray(value)) return value.map(item => validationMessage(item, path)).join(" ");
  if (value && typeof value === "object") return Object.entries(value).filter(([key]) => key !== "code").map(([key, item]) => validationMessage(item, ["detail", "non_field_errors"].includes(key) ? path : path ? path + " · " + key : key)).join(" ");
  return path ? path + ": Please review this field." : "Please review the submitted details.";
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code = "http_error") {
    super(message);
    this.name = "ApiError";
  }
}

/** One attempt only: callers retain transaction IDs when retrying writes. */
export async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  timeout = 15000,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError(
        "The shop server returned an unexpected response. Please try again or contact the shop.",
        response.ok ? 502 : response.status,
        "invalid_response",
      );
    }
    if (!response.ok)
      throw new ApiError(
        typeof data?.detail === "string"
          ? data.detail
          : data && typeof data === "object"
            ? validationMessage(data)
            : "The request could not be completed. Please try again.",
        response.status,
        typeof data?.code === "string" ? data.code : "http_error",
      );
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const write = !["GET", "HEAD", "OPTIONS"].includes((options.method || "GET").toUpperCase());
    const suffix = write
      ? " The result is not confirmed. Keep this screen open and retry without changing the details."
      : " Check your connection and try again.";
    throw new ApiError(
      (timedOut
        ? "The shop server took too long to respond."
        : controller.signal.aborted || (error instanceof Error && error.name === "AbortError")
          ? "The connection was interrupted."
          : "Unable to connect to the shop server.") + suffix,
      0,
      timedOut ? "timeout" : "network_error",
    );
  } finally {
    clearTimeout(timer);
  }
}


/** Validate before JSON.stringify can silently convert NaN/Infinity to null. */
export function serializeBody(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  function check(value: unknown, path = "") {
    const label = path.replaceAll("_", " ") || "Details";
    const fail = (message: string): never => { throw new ApiError(`${label}: ${message}`, 400, "validation_error"); };
    if (typeof value === "number" && !Number.isSafeInteger(value)) fail("Enter a whole number within the supported range.");
    if (Array.isArray(value)) { value.forEach((item, index) => check(item, `${path} ${index + 1}`)); return; }
    if (!value || typeof value !== "object") return;
    const data = value as Record<string, unknown>;
    const limits: Record<string, number> = { name: 120, sku: 60, barcode: 100, phone: 40, label: 60, address: 250, reference: 100, reason: 250, variant_group: 100, job_title: 100, location: 150 };
    const amounts = new Set(["price", "cost", "amount", "tendered", "discount", "delivery_fee", "opening_float", "counted_cash", "safety_buffer", "low_stock_threshold", "quantity"]);
    for (const [key, item] of Object.entries(data)) {
      const field = (path ? path + " · " : "") + key.replaceAll("_", " ");
      const error = (message: string): never => { throw new ApiError(`${field}: ${message}`, 400, "validation_error"); };
      if (["name", "sku", "label"].includes(key) && typeof item === "string" && !item.trim()) error("This field is required.");
      if (typeof item === "string" && limits[key] && item.length > limits[key]) error(`Use ${limits[key]} characters or fewer.`);
      if (key === "phone" && typeof item === "string" && item && (!/^\+?[0-9 ()-]+$/.test(item) || item.replace(/\D/g, "").length < 7 || item.replace(/\D/g, "").length > 15)) error("Enter a phone number with 7 to 15 digits, optionally starting with +.");
      if (["email", "support_email"].includes(key) && typeof item === "string" && item && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) error("Enter a valid email address.");
      if (["website", "image", "logo", "photo"].includes(key) && typeof item === "string" && item && !/^https?:\/\/[^\s/]+(?:[^\s]*)$/i.test(item)) error("Enter a complete http:// or https:// URL.");
      if (amounts.has(key) && item !== null && (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0 || item > (["price", "cost", "delivery_fee"].includes(key) ? 100000000000 : 1000000000000000))) error("Enter a non-negative whole number within the supported range.");
      // Option names are user-defined, so they must not be treated as API field names.
      if (key !== "attributes") check(item, field);
    }
    if (data.delivery === true && (typeof data.address !== "string" || !data.address.trim())) fail("Enter a delivery address.");
  }
  check(body);
  return JSON.stringify(body);
}
