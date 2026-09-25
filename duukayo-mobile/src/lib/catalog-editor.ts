import type { Product } from "./types";

export type Draft = {
  id?: number;
  name: string;
  sku: string;
  barcode: string;
  price: string;
  cost: string;
  image: string;
  category: number | null;
  published: boolean;
  active: boolean;
  description: string;
  gallery: string[];
  variant_group: string;
  attributes: Record<string, string>;
  showcase: boolean;
};
export type Option = { name: string; values: string };
export const emptyProduct = (): Draft => ({
  name: "",
  sku: "",
  barcode: "",
  price: "",
  cost: "",
  image: "",
  category: null,
  published: false,
  active: true,
  description: "",
  gallery: [],
  variant_group: "",
  attributes: {},
  showcase: false,
});
export const productDraft = (p: Product): Draft => ({
  ...emptyProduct(),
  ...p,
  image: p.image || "",
  category: p.category ?? null,
  description: p.description || "",
  gallery: p.gallery || [],
  variant_group: p.variant_group || "",
  attributes: p.attributes || {},
  showcase: !!p.showcase,
  price: String(p.price),
  cost: p.cost === null ? "" : String(p.cost),
});
export function familyOptions(rows: Draft[]): Option[] {
  const names = Object.keys(rows[0]?.attributes || {});
  return names.length
    ? names.map((name) => ({
        name,
        values: [...new Set(rows.map((row) => row.attributes[name]))].join(
          ", ",
        ),
      }))
    : [{ name: "Size", values: "" }];
}
const signature = (attributes: Record<string, string>) =>
  JSON.stringify(
    Object.entries(attributes)
      .map(([k, v]) => [k.trim().toLowerCase(), v.trim().toLowerCase()])
      .sort(([a], [b]) => a.localeCompare(b)),
  );

export function generateVariants(
  rows: Draft[],
  options: Option[],
  products: Product[],
  groupId: string,
): Draft[] {
  const definitions = options.map((option) => ({
    name: option.name.trim(),
    values: [
      ...new Map(
        option.values
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .map((v) => [v.toLowerCase(), v]),
      ).values(),
    ],
  }));
  if (
    !definitions.length ||
    definitions.length > 4 ||
    definitions.some(
      (o) =>
        !o.name ||
        o.name.length > 60 ||
        !o.values.length ||
        o.values.some((v) => v.length > 100),
    ) ||
    new Set(definitions.map((o) => o.name.toLowerCase())).size !==
      definitions.length
  )
    throw new Error(
      "Enter unique option names and comma-separated values (up to four options).",
    );
  if (definitions.reduce((n, o) => n * o.values.length, 1) > 100)
    throw new Error("Create at most 100 variants.");
  const isFamily = !!rows[0].variant_group;
  if (
    isFamily &&
    rows.some(
      (row) =>
        JSON.stringify(Object.keys(row.attributes).sort()) !==
        JSON.stringify(definitions.map((o) => o.name).sort()),
    )
  )
    throw new Error(
      "Keep this family's option names when adding variants. Edit option values on each variant below.",
    );
  const combinations = definitions.reduce<Record<string, string>[]>(
    (all, option) =>
      all.flatMap((a) =>
        option.values.map((v) => ({ ...a, [option.name]: v })),
      ),
    [{}],
  );
  const kept = isFamily ? rows : [];
  const additions = combinations.filter(
    (a) => !kept.some((row) => signature(row.attributes) === signature(a)),
  );
  if (kept.length + additions.length > 100)
    throw new Error("A family can contain at most 100 variants.");
  const used = new Set([...products, ...rows].map((p) => p.sku.toLowerCase()));
  let suffix = 1;
  return [
    ...kept,
    ...additions.map((attributes, i) => {
      const retain = !isFamily && i === 0 && rows[0].id;
      let sku = retain ? rows[0].sku : "";
      if (!retain && rows[0].sku) {
        do {
          const end = "-" + suffix++;
          sku = rows[0].sku.slice(0, 60 - end.length) + end;
        } while (used.has(sku.toLowerCase()));
        used.add(sku.toLowerCase());
      }
      return {
        ...rows[0],
        id: retain ? rows[0].id : undefined,
        sku,
        barcode: retain ? rows[0].barcode : "",
        attributes,
        variant_group: rows[0].variant_group || groupId,
      };
    }),
  ];
}

export function catalogPayload(rows: Draft[]) {
  const skus = new Set<string>(),
    combinations = new Set<string>();
  return rows.map((row, index) => {
    const fail = (message: string): never => {
      throw new Error(`Variant ${index + 1}: ${message}`);
    };
    const integer = (value: string, label: string) =>
      /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
        ? Number(value)
        : fail(`${label} must be a non-negative whole number.`);
    const sku = row.sku.trim();
    if (!row.name.trim() || !sku) fail("Enter a product name and SKU.");
    if (skus.has(sku.toLowerCase())) fail("Choose a unique SKU.");
    skus.add(sku.toLowerCase());
    if (row.variant_group) {
      if (
        !Object.keys(row.attributes).length ||
        Object.values(row.attributes).some((v) => !v.trim())
      )
        fail("Complete every option value.");
      const key = signature(row.attributes);
      if (combinations.has(key))
        fail("This option combination already exists.");
      combinations.add(key);
    }
    return {
      ...(row.id ? { id: row.id } : {}),
      name: row.name.trim(),
      sku,
      barcode: row.barcode.trim(),
      price: integer(row.price, "Price"),
      cost:
        row.cost === "" && !row.active && !row.published
          ? null
          : integer(row.cost, "Cost"),
      category: row.category,
      image: row.image.trim(),
      gallery: row.gallery.map((url) => url.trim()).filter(Boolean),
      description: row.description,
      active: row.active,
      published: row.active && row.published,
      showcase: row.showcase,
      variant_group: row.variant_group,
      attributes: row.attributes,
    };
  });
}
