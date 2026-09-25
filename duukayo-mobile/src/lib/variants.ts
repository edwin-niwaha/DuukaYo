import type { ShopProduct } from "./storefront";

export function variantLabel(
  product: Pick<ShopProduct, "attributes" | "variant_group">,
): string {
  return product.variant_group
    ? Object.entries(product.attributes || {})
        .map(([key, value]) => key + ": " + value)
        .join(" · ")
    : "";
}
export function productName(
  product: Pick<ShopProduct, "name" | "attributes" | "variant_group">,
): string {
  const label = variantLabel(product);
  return product.name + (label ? " — " + label : "");
}
export function variantsFor(
  products: ShopProduct[],
  product: ShopProduct,
): ShopProduct[] {
  const group = product.variant_group?.trim().toLowerCase();
  return group
    ? products.filter((p) => p.variant_group?.trim().toLowerCase() === group)
    : [product];
}
export function groupProducts(products: ShopProduct[]): ShopProduct[] {
  const groups = new Map<string, ShopProduct>();
  for (const product of products) {
    const key = product.variant_group
      ? "group:" + product.variant_group.trim().toLowerCase()
      : "product:" + product.id;
    const existing = groups.get(key);
    if (!existing || (!existing.available && product.available))
      groups.set(key, product);
  }
  return [...groups.values()];
}
