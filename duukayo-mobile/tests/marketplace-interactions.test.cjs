const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), ts = require("typescript"), React = require("react");
const { create, act } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
test("mobile marketplace checkout persists one command across response loss and remount", async () => {
  const storage = new Map(), commands = [], remembered = [], cleared = [];
  const carts = [{ slug: "one", items: [{ id: 1, quantity: 2 }] }, { slug: "two", items: [{ id: 2, quantity: 1 }] }];
  const dependencies = {
    "react-native": { ...Object.fromEntries(["ActivityIndicator", "Pressable", "ScrollView", "Switch", "Text", "TextInput", "View"].map(n => [n,n])), StyleSheet: { create: x => x } },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "expo-router": { useRouter: () => ({ push() {}, back() {} }) },
    "expo-crypto": { randomUUID: () => "stable-command" },
    "expo-secure-store": { getItemAsync: async k => storage.get(k) || null, setItemAsync: async (k,v) => storage.set(k,v), deleteItemAsync: async k => storage.delete(k) },
    "../src/lib/types": { money: n => "UGX " + n },
    "../src/lib/order-attempt": { definiteRejection: () => false },
    "../src/features/storefront/CustomerProvider": { useCustomer: () => ({ carts, ready: true, clearCart: slug => cleared.push(slug), rememberOrder: async token => remembered.push(token) }) },
    "../src/lib/api": { publicApi: async (path, body, method, headers) => {
      if (path === "carts/") return { id: 3, token: "private-token" };
      if (path.endsWith("quotes/")) return { id: 7, total: 14000, currency: "UGX", expires_at: new Date().toISOString(), groups: [] };
      if (path.endsWith("checkout/")) {
        assert.ok(storage.has("marketplace-checkout-pending"));
        assert.equal(headers["X-Cart-Token"], "private-token"); commands.push(body);
        if (commands.length === 1) throw new Error("Connection interrupted");
        return { total: 14000, currency: "UGX", orders: [{ id: 1, token: "one", shop: "One" }, { id: 2, token: "two", shop: "Two" }] };
      }
      return {};
    } },
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(require.resolve("../app/checkout.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, require: n => n.endsWith("/lib/feedback") ? require("./load-feedback.cjs") : n in dependencies ? dependencies[n] : require(n), console });
  let tree;
  const button = title => tree.root.findAllByType("Pressable").find(n => n.findAllByType("Text").some(t => t.props.children === title));
  await act(async () => { tree = create(React.createElement(exports.default)); });
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Customer name" }).props.onChangeText("Buyer"));
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Phone number" }).props.onChangeText("+256700000000"));
  await act(async () => button("Review prices & availability").props.onPress());
  await act(async () => button("Place all orders").props.onPress());
  assert.equal(cleared.length, 0);
  await act(async () => tree.unmount());
  await act(async () => { tree = create(React.createElement(exports.default)); });
  await act(async () => button("Recover pending checkout").props.onPress());
  assert.equal(commands[0].client_id, commands[1].client_id);
  assert.deepEqual(remembered, ["one", "two"]); assert.deepEqual(cleared, ["one", "two"]);
  assert.equal(storage.has("marketplace-checkout-pending"), false);
  await act(async () => tree.unmount());
});
