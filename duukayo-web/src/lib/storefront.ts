export type ShopSummary = {
  description?: string;
  website?: string;
  name: string;
  slug: string;
  logo: string;
  currency: string;
  contact: string;
  delivery_enabled: boolean;
  delivery_fee: number;
  product_count: number;
  categories: string[];
  preview_products: {
    id: number;
    name: string;
    image: string;
    price: number;
    available?: number;
  }[];
};
export type ShopProduct = {
  description?: string;
  gallery?: string[];
  variant_group?: string;
  attributes?: Record<string, string>;
  id: number;
  name: string;
  image: string;
  price: number;
  available: number;
  preview?: boolean;
  category: number | null;
  category_name: string;
};
export type ShopCatalog = {
  shop: Pick<ShopSummary, "description" | "website" | "name" | "slug" | "logo" | "currency" | "contact" | "delivery_enabled" | "delivery_fee">;
  products: ShopProduct[];
  categories: { id: number; name: string }[];
  availability_notice: string;
};
export type GuestOrder = {
  id: number;
  shop: string;
  shop_slug: string;
  contact: string;
  status: string;
  payment_state: string;
  total: number;
  currency: string;
  delivery: boolean;
  delivery_fee: number;
  expires_at: string;
  created_at: string;
  lines: { name: string; quantity: number; price: number }[];
};
export const orderSteps = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "completed",
];
export const orderMessages: Record<string, string> = {
  pending:
    "Your order is with the shop. They will confirm availability shortly.",
  accepted: "Good news! The shop has accepted your order.",
  preparing: "Your items are being carefully packed.",
  ready: "Your order is ready. Contact the shop to arrange pickup or delivery.",
  completed: "All done. Thank you for shopping with DuukaYo!",
  cancelled:
    "This order was cancelled or its reservation expired. You can place a new order.",
};

export type ShowcaseProduct = { id: number; name: string; image: string; price: number; available?: number; preview?: boolean; slug: string; shop: string; currency: string };
