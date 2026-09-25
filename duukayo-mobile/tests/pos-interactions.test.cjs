const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { create, act } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  return exports;
}
test("mobile POS holds a scoped draft and persists a cash sale before clearing its cart", async () => {
  const storage = new Map();
  const product = { id: 1, name: "Milk", sku: "milk", barcode: "123", price: 2500, cost: 1000, quantity: 8, reserved: 0, active: true, published: true };
  const session = { access: "test", refresh: "test", verifiedAt: Date.now(), profile: { id: 1, username: "cashier", memberships: [{ role: "cashier", branch: 1, business: { id: 1, name: "Corner", currency: "UGX" } }] } };
  let release;
  const queued = [];
  let ids = 0;
  const hosts = Object.fromEntries(["ActivityIndicator","Pressable","ScrollView","Text","TextInput","View"].map(name => [name,name]));
  const dependencies = {
    "expo-router": { useRouter: () => ({ push() {} }) },
    "react-native": { ...hosts, StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390 }), Alert: { alert() {} }, Share: { share: async () => {} }, AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) } },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "../storefront/ProductPicture": { ProductPicture: () => null },
    "../../lib/google": { googleConfigured: () => false },
    "expo-crypto": { randomUUID: () => "id-" + ++ids },
    "expo-secure-store": { getItemAsync: async key => storage.get(key) || null, setItemAsync: async (key,value) => storage.set(key,value), deleteItemAsync: async key => storage.delete(key) },
    "expo-sqlite/kv-store": { getItem: async key => storage.get(key) || null, setItem: async (key,value) => storage.set(key,value) },
    "../../lib/order-attempt": { definiteRejection: () => false },
    "../../lib/api": { restoreSession: async () => session, verifySession: async () => session, subscribeSession: () => () => {}, ApiError: class extends Error {}, api: async (path, payload) => payload && path.endsWith("sales/") ? { id: 9, total: 2500, currency: "UGX" } : path.endsWith("products/") ? [product] : [] },
    "../../lib/types": { money: n => "UGX " + n, scopeOf: () => "1:1:1" },
    "../sync/storage": { database: async () => ({}), cachedProducts: async () => [product], cacheProducts: async () => {} },
    "../sync/queue.mjs": { rows: async () => [], synchronize: async () => {}, enqueue: async (_db, scope, payload) => { queued.push({ scope, payload }); await new Promise(resolve => { release = resolve; }); } },
    "../notifications/push": { onOrderNotification: () => () => {}, registerPush: async () => {} },
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(require.resolve("../src/features/pos/PosScreen.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, require: name => name.endsWith("/lib/feedback") ? require("./load-feedback.cjs") : name.endsWith("/components/Icon") ? { __esModule: true, default: "Icon" } : name in dependencies ? dependencies[name] : name === "../../lib/variants" ? load("../src/lib/variants.ts", {}) : require(name), setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, console });
  let tree;
  const button = title => tree.root.findAllByType("Pressable").find(node => node.findAllByType("Text").some(text => text.props.children === title));
  const textCount = label => tree.root.findAllByType("Text").filter(node => node.props.children === label).length;
  await act(async () => { tree = create(React.createElement(exports.default)); });
  await act(async () => button("Milk").props.onPress());
  await act(async () => button("Hold sale").props.onPress());
  assert.ok(storage.has("held-sales-1:1:1"));
  await act(async () => tree.unmount());
  await act(async () => { tree = create(React.createElement(exports.default)); });
  await act(async () => button("Resume held sale 1").props.onPress());
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Cash received" }).props.onChangeText("5000"));
  await act(async () => button("Complete sale →").props.onPress());
  assert.equal(queued.length, 1);
  assert.equal(queued[0].scope, "1:1:1");
  assert.equal(queued[0].payload.method, "cash");
  assert.ok(textCount("Milk") >= 2, "the cart remains until the queue write completes");
  await act(async () => release());
  assert.equal(textCount("Milk"), 1, "only the catalog product remains after durable capture");
  await act(async () => button("Overview").props.onPress());
  assert.equal(tree.root.findAllByProps({ accessibilityLabel: "Waiting to sync" }).length, 1);
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Pending orders" }).props.onPress());
  assert.equal(textCount("Ready for what’s next."), 0);
  await act(async () => tree.unmount());
  storage.set("manual-sale-1-1-1", JSON.stringify({ client_id: "recover-id", method: "mobile_money", lines: [{ product: 1, quantity: 1 }] }));
  await act(async () => { tree = create(React.createElement(exports.default)); });
  await act(async () => button("Recover payment").props.onPress());
  const receipt = tree.root.findAllByType("Text").find(node => node.props.selectable).props.children;
  assert.equal(receipt, "Confirmed sale #9\nUGX 2500\nManual payment, not provider-verified");
  assert.equal(receipt.includes("\\n"), false);
  assert.equal(storage.has("manual-sale-1-1-1"), false);
  await act(async () => tree.unmount());
});
