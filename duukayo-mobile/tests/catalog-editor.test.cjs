const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), ts = require("typescript");
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve("../src/lib/catalog-editor.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject });
const { emptyProduct, productDraft, generateVariants, catalogPayload } = exportsObject;
const base = { ...emptyProduct(), name: "Shirt", sku: "SHIRT", price: "20000", cost: "12000" };
const plain = value => JSON.parse(JSON.stringify(value));

test("new product combinations use unique SKUs and reject invalid options before saving", () => {
  const rows = generateVariants([base], [{ name: "Size", values: "S, M, s" }, { name: "Colour", values: "Blue, Red" }], [], "family");
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map(r => r.sku)).size, 4);
  assert.ok(catalogPayload(rows).every(p => p.variant_group === "family" && p.price === 20000));
  assert.throws(() => generateVariants([base], [{ name: "Size", values: "" }], [], "family"), /comma-separated/);
  assert.throws(() => catalogPayload([{ ...base, price: "NaN" }]), /Price/);
});

test("expanding a family preserves original IDs, prices, barcodes and images", () => {
  const existing = [
    { ...base, id: 1, sku: "SHIRT-S", barcode: "123", variant_group: "shirts", attributes: { Size: "S" }, image: "https://example.com/s.png" },
    { ...base, id: 2, sku: "SHIRT-M", price: "25000", variant_group: "shirts", attributes: { Size: "M" } },
  ];
  const rows = generateVariants(existing, [{ name: "Size", values: "S, M, L" }], [], "unused");
  assert.deepEqual(plain(rows.slice(0, 2)), plain(existing));
  assert.equal(rows[2].id, undefined);
  assert.equal(rows[2].barcode, "");
  assert.equal(rows[2].variant_group, "shirts");
  assert.equal(catalogPayload(rows).length, 3);
  assert.throws(() => generateVariants(existing, [{ name: "Colour", values: "Blue" }], [], "unused"), /option names/);
  assert.throws(() => catalogPayload([...rows, { ...rows[2], sku: "OTHER" }]), /combination already exists/);
});

test("converting one SKU keeps its identity and unknown-cost drafts stay editable", () => {
  const original = productDraft({ ...base, id: 4, quantity: 7, reserved: 1, price: 20000, cost: null, active: false });
  const rows = generateVariants([original], [{ name: "Size", values: "S, M" }], [], "new-family");
  assert.equal(rows[0].id, 4);
  assert.equal(rows[0].sku, "SHIRT");
  const payload = catalogPayload(rows);
  assert.equal(payload[0].cost, null);
  assert.equal("quantity" in payload[0], false);
  assert.equal("id" in payload[1], false);
});
