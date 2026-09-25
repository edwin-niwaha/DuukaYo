const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { create, act } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: n => n.endsWith("/lib/feedback") ? require("./load-feedback.cjs") : n.endsWith("/components/Icon") ? { __esModule: true, default: "Icon" } : n in dependencies ? dependencies[n] : n === "../../lib/variants" ? load("../src/lib/variants.ts", {}) : require(n), console, setInterval, clearInterval });
  return exports;
}
const native = { ...Object.fromEntries(["ActivityIndicator","Pressable","ScrollView","Text","TextInput","View","Image"].map(n => [n,n])), StyleSheet: { create: s => s } };

test("saved carts migrate from the previous storage key once", async () => {
  const cart = { slug: "one", name: "Shop", currency: "UGX", items: [{ id: 1, quantity: 2 }] };
  const storage = new Map([["customer-bags-v1", JSON.stringify([cart])]]);
  const mod = load("../src/features/storefront/CustomerProvider.tsx", {
    "expo-sqlite/kv-store": { __esModule: true, default: { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) } },
    "expo-secure-store": { getItemAsync: async () => null }
  });
  let state, tree;
  function Probe() { state = mod.useCustomer(); return null; }
  await act(async () => { tree = create(React.createElement(mod.CustomerProvider, null, React.createElement(Probe))); });
  assert.equal(state.carts[0].items[0].quantity, 2);
  assert.equal(storage.has("customer-bags-v1"), false);
  assert.equal(JSON.parse(storage.get("customer-carts-v1"))[0].slug, "one");
  await act(async () => tree.unmount());
});
test("wishlist survives remount and separates products from different shops", async () => {
  const storage = new Map();
  const mod = load("../src/features/storefront/CustomerProvider.tsx", {
    "expo-sqlite/kv-store": { __esModule: true, default: { getItem: async k => storage.get(k), setItem: async (k,v) => storage.set(k,v) } },
    "expo-secure-store": { getItemAsync: async () => null }
  });
  let state, tree;
  function Probe() { state = mod.useCustomer(); return null; }
  const mount = () => create(React.createElement(mod.CustomerProvider, null, React.createElement(Probe)));
  await act(async () => { tree = mount(); });
  const first = { id: 1, slug: "one", name: "Milk" }, second = { ...first, slug: "two" };
  await act(async () => { state.toggleWishlist(first); state.toggleWishlist(second); });
  assert.equal(state.wishlist.length, 2);
  await act(async () => tree.unmount());
  await act(async () => { tree = mount(); });
  assert.equal(state.wishlist.length, 2);
  await act(async () => state.toggleWishlist(first));
  assert.equal(state.wishlist.length, 1);
  assert.equal(state.wishlist[0].slug, "two");
  assert.equal(JSON.parse(storage.get("customer-wishlist-v1")).length, 1);
  await act(async () => tree.unmount());
});
test("categories include later shop pages and open the selected shop category", async () => {
  const calls=[], routes=[];
  const mod=load("../src/features/storefront/DiscoveryTabs.tsx", {
    "react-native": native, "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "expo-router": { useFocusEffect: fn => React.useEffect(fn,[fn]), useRouter: () => ({ push: x => routes.push(x) }) },
    "../../lib/api": { publicApi: async path => { calls.push(path); return path.endsWith("1") ? { shops: [{slug:"one",name:"One",categories:["Dairy"]}], next_page:2 } : { shops:[{slug:"two",name:"Two",categories:["Perfume"]}], next_page:null }; } },
    "../../lib/types": { money: n => String(n) }, "./CustomerProvider": {}, "./ProductPicture": {}
  });
  let tree; await act(async () => { tree=create(React.createElement(mod.CategoriesTab)); });
  assert.equal(calls.length,2);
  const category=tree.root.findAllByType("Pressable").find(p=>p.findAllByType("Text").some(t=>t.props.children==="Perfume"));
  await act(async()=>category.props.onPress());
  await act(async()=>tree.root.findByProps({accessibilityLabel:"Browse Perfume at Two"}).props.onPress());
  assert.equal(routes[0].params.slug,"two"); assert.equal(routes[0].params.category,"Perfume");
  await act(async()=>tree.unmount());
});
test("bottom navigation exposes only the five requested tabs", async () => {
  const Tabs=({children})=>React.createElement("Tabs",null,children); Tabs.Screen="Tab";
  const mod=load("../app/(tabs)/_layout.tsx", {
    "expo-router":{Tabs}, "react-native":native,
    "react-native-safe-area-context":{useSafeAreaInsets:()=>({bottom:0})},
    "../../src/features/storefront/CustomerProvider":{useCustomer:()=>({carts:[]})},
    "../../assets/tabs/home.png":1, "../../assets/tabs/cart.png":2, "../../assets/tabs/profile.png":3
  });
  let tree; await act(async()=>{tree=create(React.createElement(mod.default));});
  assert.deepEqual(tree.root.findAllByType("Tab").filter(t=>t.props.options.href!==null).map(t=>t.props.options.title),["Home","Categories","Cart","Wishlist","Accounts"]);
  await act(async()=>tree.unmount());
});

test("embedded order history stays inside Accounts and opens tracking", async () => {
  const routes=[], customer={tokens:["order-token"],ready:true};
  const mod=load("../src/features/storefront/CustomerTabs.tsx", {
    "react-native": native, "react-native-safe-area-context": { SafeAreaView:"SafeAreaView" },
    "expo-router": { useFocusEffect:fn=>React.useEffect(fn,[fn]),useRouter:()=>({push:x=>routes.push(x)}) },
    "../../lib/api": {publicApi:async()=>({id:7,shop:"Corner",status:"pending",lines:[],total:100,currency:"UGX"})},
    "../../lib/types":{money:n=>String(n)}, "./ShopScreens":{},
    "./CustomerProvider":{useCustomer:()=>customer}
  });
  let tree;await act(async()=>{tree=create(React.createElement(mod.OrdersTab,{embedded:true}));});
  assert.equal(tree.root.findAllByType("ScrollView").length,0);
  await act(async()=>tree.root.findByProps({accessibilityLabel:"Track order 7 from Corner"}).props.onPress());
  assert.equal(routes[0].params.token,"order-token");
  await act(async()=>tree.unmount());
});
