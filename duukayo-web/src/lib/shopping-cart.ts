import { api } from "./api";

export type CartLine = { product: number; quantity: number; slug: string };
type AccountCart = { id: number; lines: CartLine[] };
const ownerKey = "duukayo-cart-owner";
const dirtyKey = "duukayo-cart-dirty";
const mergeKey = "duukayo-cart-merge";
const cartPrefix = "duukayo-cart:";

// Read old storage once so the terminology change cannot discard saved orders.
export function migrateCartStorage() {
  const oldPrefix = "duukayo-bag:";
  for (const key of Object.keys(localStorage).filter(key => key.startsWith(oldPrefix))) {
    const next = cartPrefix + key.slice(oldPrefix.length);
    if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key)!);
    localStorage.removeItem(key);
  }
  const key = "duukayo-marketplace-pending";
  const raw = localStorage.getItem(key);
  if (raw) {
    const pending = JSON.parse(raw);
    if (pending.bags && !pending.carts) {
      pending.carts = Object.fromEntries(Object.entries(pending.bags).map(([key, value]) => [key.replace(oldPrefix, cartPrefix), value]));
      delete pending.bags;
      localStorage.setItem(key, JSON.stringify(pending));
    }
  }
}
export function cartKeys() {
  migrateCartStorage();
  return Object.keys(localStorage).filter(key => key.startsWith("duukayo-cart:") && !key.endsWith(":prices"));
}
export function readCart(slug: string): Record<number, number> {
  migrateCartStorage();
  const value = JSON.parse(localStorage.getItem(`duukayo-cart:${slug}`) || "{}");
  return Object.fromEntries(Object.entries(value).filter(([id, q]) => Number.isInteger(Number(id)) && Number(id) > 0 && Number.isInteger(q) && Number(q) > 0 && Number(q) <= 10000)) as Record<number, number>;
}
export function cartLines(): CartLine[] {
  return cartKeys().flatMap(key => Object.entries(readCart(key.slice(cartPrefix.length))).map(([product, quantity]) => ({ product: Number(product), quantity, slug: key.slice(cartPrefix.length) })));
}
export function saveCart(slug: string, quantities: Record<number, number>) {
  const value = JSON.stringify(Object.fromEntries(Object.entries(quantities).filter(([, q]) => q > 0)));
  const key = `duukayo-cart:${slug}`;
  if ((localStorage.getItem(key) || "{}") === value) return;
  localStorage.setItem(key, value);
  cartChanged();
}
export function cartChanged() {
  localStorage.setItem(dirtyKey, crypto.randomUUID());
  window.dispatchEvent(new Event("cart-change"));
}
function hydrate(lines: CartLine[]) {
  const normalize = (items: CartLine[]) => JSON.stringify([...items].sort((a, b) => a.product - b.product).map(({ product, quantity, slug }) => ({ product, quantity, slug })));
  if (normalize(cartLines()) === normalize(lines)) return;
  for (const key of cartKeys()) localStorage.removeItem(key);
  for (const slug of new Set(lines.map(line => line.slug))) {
    localStorage.setItem(`duukayo-cart:${slug}`, JSON.stringify(Object.fromEntries(lines.filter(line => line.slug === slug).map(line => [line.product, line.quantity]))));
  }
  window.dispatchEvent(new Event("cart-refreshed"));
}
export function clearAccountCart() {
  const owner = localStorage.getItem(ownerKey);
  if (!owner) return;
  if (localStorage.getItem(dirtyKey)) localStorage.setItem(`duukayo-cart-pending:${owner}`, JSON.stringify(cartLines()));
  hydrate([]);
  localStorage.removeItem(ownerKey);
  localStorage.removeItem(dirtyKey);
}
function payload(lines: CartLine[]) {
  return { lines: lines.map(({ product, quantity }) => ({ product, quantity })) };
}
let running: Promise<void> | undefined;
export function syncCart(): Promise<void> {
  if (running) return running.then(() => syncCart());
  const work = async () => {
    let profile: { id: number };
    try { profile = await api("auth/me/"); }
    catch (error) {
      if (![401, 403].includes((error as { status: number }).status)) throw error;
      clearAccountCart();
      return;
    }
    let owner = localStorage.getItem(ownerKey);
    if (owner && owner !== String(profile.id)) {
      clearAccountCart();
      owner = null;
    }
    const pendingEdits = localStorage.getItem(`duukayo-cart-pending:${profile.id}`);
    if (!owner && pendingEdits) {
      // Restore only this account's offline edits, retaining new guest additions.
      const restored: CartLine[] = JSON.parse(pendingEdits);
      for (const line of cartLines()) {
        const previous = restored.find(item => item.product === line.product);
        if (previous) previous.quantity += line.quantity;
        else restored.push(line);
      }
      hydrate(restored);
      owner = String(profile.id);
      localStorage.setItem(ownerKey, owner);
      localStorage.setItem(dirtyKey, crypto.randomUUID());
    }
    const account = await api<AccountCart>("my/cart/");
    if (owner !== String(profile.id)) {
      const current = cartLines();
      type Merge = { user: number; id: number; token: string; lines: CartLine[]; uploaded: boolean };
      let merge: Merge | null = JSON.parse(localStorage.getItem(mergeKey) || "null");
      if (merge && merge.user !== profile.id) throw new Error("Sign in to the original account to finish syncing your previous cart.");
      if (!merge && current.length) {
        const guest = await api<{ id: number; token: string }>("carts/", { guest: true });
        merge = { ...guest, user: profile.id, lines: current, uploaded: false };
        localStorage.setItem(mergeKey, JSON.stringify(merge));
      }
      let merged = account;
      if (merge) {
        if (!merge.uploaded) {
          await api(`carts/${merge.id}/`, payload(merge.lines), "PUT", { "X-Cart-Token": merge.token });
          merge.uploaded = true;
          localStorage.setItem(mergeKey, JSON.stringify(merge));
        }
        merged = await api<AccountCart>(`carts/${account.id}/merge/`, { source: merge.id, token: merge.token });
        // Keep edits made while the merge request was in flight.
        const latest = cartLines();
        const quantities = new Map(merged.lines.map(line => [line.product, { ...line }]));
        for (const line of merge.lines) {
          const item = quantities.get(line.product);
          if (item) item.quantity -= line.quantity;
        }
        for (const line of latest) {
          const item = quantities.get(line.product);
          if (item) item.quantity += line.quantity;
          else quantities.set(line.product, line);
        }
        merged.lines = [...quantities.values()].filter(line => line.quantity > 0);
      }
      hydrate(merged.lines);
      localStorage.setItem(ownerKey, String(profile.id));
      localStorage.removeItem(mergeKey);
      localStorage.setItem(dirtyKey, crypto.randomUUID());
    }
    // Absolute quantities make retries safe. A newer local edit keeps its dirty marker.
    while (localStorage.getItem(dirtyKey)) {
      const revision = localStorage.getItem(dirtyKey);
      await api(`carts/${account.id}/`, payload(cartLines()), "PUT");
      if (revision === localStorage.getItem(dirtyKey)) localStorage.removeItem(dirtyKey);
    }
    localStorage.removeItem(`duukayo-cart-pending:${profile.id}`);
    if (owner === String(profile.id)) {
      const revision = localStorage.getItem(dirtyKey);
      const latest = await api<AccountCart>(`carts/${account.id}/`);
      if (revision === localStorage.getItem(dirtyKey)) hydrate(latest.lines);
    }
  };
  running = (navigator.locks ? navigator.locks.request("duukayo-cart-sync", work) : work()).catch(error => {
    // Validation is transactional: let the customer correct their local cart and retry.
    if ((error as { status?: number }).status === 400) localStorage.removeItem(mergeKey);
    throw error;
  }).finally(() => { running = undefined; });
  return running;
}
