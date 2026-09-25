export type Product = {
  description?: string;
  gallery?: string[];
  showcase?: boolean;
  variant_group?: string;
  attributes?: Record<string, string>;
  image?: string;
  category?: number | null;
  category_name?: string;
  id: number;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  cost: number | null;
  quantity: number;
  reserved: number;
  active: boolean;
  published: boolean;
};
export type Business = {
  id: number;
  name: string;
  currency: string;
  timezone: string;
  slug: string;
};
export type Membership = { business: Business; branch: number; role: string };
export type Profile = {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  has_password?: boolean;
  memberships: Membership[];
};
export type Session = {
  access: string;
  refresh: string;
  profile: Profile;
  verifiedAt: number;
};
export type Order = {
  id: number;
  name: string;
  phone: string;
  status: string;
  payment_state: string;
  total: number;
  currency: string;
  lines: { name: string; quantity: number }[];
};
export type Sale = {
  id: number;
  client_id: string;
  total: number;
  currency: string;
  review_reasons: string[];
  lines: { name: string; quantity: number; price: number; discount: number }[];
  payment: { change: number; method: string };
};
export type Customer = { id: number; name: string; phone: string };
export const money = (n: number, currency = "UGX") =>
  currency + " " + n.toLocaleString("en-UG");
export const scopeOf = (session: Session, m: Membership) =>
  `${session.profile.id}:${m.business.id}:${m.branch}`;
