export type OrderPayload = {
  name: string; phone: string; address: string; delivery: boolean;
  lines: { product: number; quantity: number; price: number }[];
};
export type OrderAttempt = { key: string; payload: OrderPayload; created: number };
export function parseAttempt(raw: string | null): OrderAttempt | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as OrderAttempt;
  if (!value || typeof value.key !== "string" || !/^[a-f0-9-]{36}$/i.test(value.key) ||
      !value.payload || !Array.isArray(value.payload.lines) || !value.payload.lines.length ||
      !Number.isFinite(value.created)) throw new Error("Saved checkout could not be read. Keep this cart and contact the shop before starting another order.");
  return value;
}
export function definiteRejection(error: unknown) {
  const status = (error as { status?: number })?.status;
  return status !== undefined && [400, 401, 403, 404, 422, 429].includes(status);
}

export function createOrderAttempt(key: string, payload: OrderPayload): OrderAttempt {
  return { key, payload, created: Date.now() };
}
