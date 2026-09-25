const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { create, act } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, dependencies, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(require.resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, {
    exports, require: name => name.endsWith("/lib/feedback") ? require("./load-feedback.cjs") : name.endsWith("/components/Icon") ? { __esModule: true, default: "Icon" } : name in dependencies ? dependencies[name] : (name === "../../lib/variants" || name === "../src/lib/variants") ? load("../src/lib/variants.ts", {}) : name === "../src/lib/catalog-editor" ? load("../src/lib/catalog-editor.ts", {}) : require(name),
    setTimeout, clearTimeout, setInterval, clearInterval, console, ...globals
  });
  return exports;
}
const hosts = Object.fromEntries(["ActivityIndicator", "RefreshControl", "Image", "Pressable", "ScrollView", "Text", "TextInput", "View", "KeyboardAvoidingView"].map(name => [name, name]));
const native = {
  ...hosts, FlatList: React.forwardRef(function MockList(props, ref) { React.useImperativeHandle(ref, () => ({ scrollToOffset() {} })); return React.createElement("FlatList", props, props.data.map((item, index) => React.createElement(React.Fragment, { key: item.id }, props.renderItem({ item, index })))); }), Animated: { Value: class { setValue() {} }, View: "AnimatedView", timing: () => ({ start() {}, stop() {} }) }, Modal: ({ visible, children }) => visible ? children : null,
  StyleSheet: { create: value => value }, Platform: { OS: "android" },
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
  Alert: { alert: (_title, _message, buttons) => buttons.at(-1).onPress() },
  AccessibilityInfo: { isReduceMotionEnabled: async () => true, isScreenReaderEnabled: async () => false, addEventListener: () => ({ remove() {} }) }
};
const router = () => {
  const pushes = [];
  return { pushes, push: value => pushes.push(value), navigate() {}, replace() {}, setParams() {} };
};
const focus = fn => React.useEffect(fn, [fn]);
const media = load("../src/lib/media.ts", { "./config.mjs": { resolveApiConfig: () => ({ base: "http://192.168.43.13:8000/api/v1/" }) } }, { URL, process: { env: {} } });
const picture = load("../src/features/storefront/ProductPicture.tsx", { "react-native": native, "../../lib/media": media });
test("mobile carousel links the selected product and respects reduced motion", async () => {
  const navigation = router();
  let intervals = 0;
  const { default: Showcase } = load("../src/features/storefront/ProductShowcase.tsx", {
    "react-native": native, "expo-router": { useRouter: () => navigation, useFocusEffect: focus },
    "./ProductPicture": picture, "../../lib/types": { money: n => "UGX " + n }
  }, { setInterval: () => { intervals++; return 1; }, clearInterval() {} });
  let tree;
  const products = [{ id: 1, name: "Milk", image: "https://example.com/milk.jpg", preview: true, price: 2500, slug: "corner", shop: "Corner", currency: "UGX" }, { id: 2, name: "Rice", image: "", price: 5000, slug: "market", shop: "Market", currency: "UGX" }];
  await act(async () => { tree = create(React.createElement(Showcase, { products })); });
  await act(async () => tree.root.findAllByType("View").find(v => v.props.onLayout).props.onLayout({ nativeEvent: { layout: { width: 350 } } }));
  assert.equal(intervals, 0);
  assert.equal(tree.root.findByType("Image").props.source.uri, "https://example.com/milk.jpg");
  assert.ok(JSON.stringify(tree.toJSON()).includes("Coming soon"));
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Next product" }).props.onPress());
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Explore Rice from Market" }).props.onPress());
  assert.equal(navigation.pushes[0].params.slug, "market");
  assert.equal(navigation.pushes[0].params.product, 2);
  await act(async () => tree.unmount());
});
test("mobile guest checkout survives an interrupted response and recovers the original request after remount", async () => {
  const storage = new Map();
  const navigation = router();
  const catalog = { shop: { slug: "corner", name: "Corner", currency: "UGX", delivery_enabled: false, delivery_fee: 0 }, products: [{ id: 1, name: "Milk", image: "", price: 2500, available: 5, category: 1, category_name: "Dairy" }], categories: [{ id: 1, name: "Dairy" }], availability_notice: "Shop confirms stock." };
  const requests = [];
  let savedToken;
  const customer = { ready: true, carts: [], saveCart() {}, clearCart() {}, async rememberOrder(token) { savedToken = token; } };
  const publicApi = async (_path, payload) => {
    if (!payload) return catalog;
    requests.push(JSON.parse(JSON.stringify(payload)));
    if (requests.length === 1) throw Object.assign(new Error("Connection interrupted"), { status: 0 });
    return { token: "recovered-order" };
  };
  const attempt = load("../src/lib/order-attempt.ts", {});
  const { ShopScreen } = load("../src/features/storefront/ShopScreens.tsx", {
    "react-native": native, "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "expo-router": { useRouter: () => navigation, useLocalSearchParams: () => ({ slug: "corner" }), useFocusEffect: focus },
    "expo-crypto": { randomUUID: () => "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" },
    "expo-secure-store": { getItemAsync: async key => storage.get(key) || null, setItemAsync: async (key,value) => storage.set(key,value), deleteItemAsync: async key => storage.delete(key) },
    "./ProductPicture": { ProductPicture: () => null }, "./ProductShowcase": { __esModule: true, default: () => null }, "./CustomerProvider": { useCustomer: () => customer },
    "../../lib/order-attempt": attempt, "../../lib/api": { publicApi },
    "./ProductPicture": picture, "../../lib/types": { money: n => "UGX " + n }, "../../lib/storefront": { orderMessages: {}, orderSteps: [] }
  });
  let tree;
  await act(async () => { tree = create(React.createElement(ShopScreen)); });
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Add to cart +" }).props.onPress());
  await act(async () => tree.root.findByProps({ accessibilityLabel: "View cart →" }).props.onPress());
  await act(async () => {
    tree.root.findByProps({ accessibilityLabel: "Your name" }).props.onChangeText("Buyer");
    tree.root.findByProps({ accessibilityLabel: "Phone number" }).props.onChangeText("0700000000");
  });
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Place order →" }).props.onPress());
  assert.equal(requests.length, 1);
  assert.ok(storage.get("checkout-corner"));
  await act(async () => tree.unmount());
  await act(async () => { tree = create(React.createElement(ShopScreen)); });
  await act(async () => tree.root.findByProps({ accessibilityLabel: "View cart →" }).props.onPress());
  assert.equal(tree.root.findByProps({ accessibilityLabel: "Your name" }).props.editable, false);
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Recover order" }).props.onPress());
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(savedToken, "recovered-order");
  assert.equal(storage.has("checkout-corner"), false);
  await act(async () => tree.unmount());
});


test("mobile carousel resumes after interaction, blocks swipe taps and pauses in background", async () => {
  const navigation = router(), timers = new Map(); let counter = 0, now = 0, appListener;
  const { default: Showcase } = load("../src/features/storefront/ProductShowcase.tsx", {
    "react-native": { ...native, AccessibilityInfo: { ...native.AccessibilityInfo, isReduceMotionEnabled: async () => false }, AppState: { currentState: "active", addEventListener: (_name, listener) => { appListener = listener; return { remove() {} }; } } },
    "expo-router": { useRouter: () => navigation, useFocusEffect: focus }, "./ProductPicture": picture, "../../lib/types": { money: n => `UGX ${n}` }
  }, { Date: { now: () => now }, setInterval: fn => { timers.set(++counter, fn); return counter; }, clearInterval: id => timers.delete(id) });
  const products = [1, 2, 3].map(id => ({ id, name: `Item ${id}`, shop: "Shop", slug: "shop", price: 1, currency: "UGX" }));
  let tree; await act(async () => { tree = create(React.createElement(Showcase, { products })); });
  await act(async () => tree.root.findAllByType("View").find(v => v.props.onLayout).props.onLayout({ nativeEvent: { layout: { width: 350 } } }));
  assert.equal(timers.size, 1);
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Next product" }).props.onPress());
  assert.equal(tree.root.findByType("FlatList").props.extraData, 1);
  await act(async () => [...timers.values()][0]());
  assert.equal(tree.root.findByType("FlatList").props.extraData, 1);
  now = 9000; await act(async () => [...timers.values()][0]());
  assert.equal(tree.root.findByType("FlatList").props.extraData, 2);
  await act(async () => tree.root.findByType("FlatList").props.onScrollBeginDrag());
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Explore Item 3 from Shop" }).props.onPress());
  assert.equal(navigation.pushes.length, 0);
  await act(async () => appListener("background")); assert.equal(timers.size, 0);
  await act(async () => appListener("active")); assert.equal(timers.size, 1);
  const pause = tree.root.findAllByType("Pressable").find(p => p.findAllByType("Text").some(t => t.props.children === "Pause"));
  await act(async () => pause.props.onPress()); assert.equal(timers.size, 0);
  await act(async () => { tree.update(React.createElement(Showcase, { products: [products[0]] })); });
  assert.equal(tree.root.findByType("FlatList").props.extraData, 0);
  await act(async () => { tree.update(React.createElement(Showcase, { products: [] })); });
  assert.equal(tree.root.findAllByType("FlatList").length, 0);
  await act(async () => tree.unmount());
});


test("mobile manager retains failed product edits and saves valid prices on retry", async () => {
  const business = { id: 1, name: "Shop", slug: "shop", currency: "UGX", timezone: "Africa/Kampala", description: "", website: "", contact: "", logo: "", published: false, delivery_enabled: false, delivery_fee: 0, safety_buffer: 2, storefront_branch: 1, branches: [{ id: 1, name: "Main" }] };
  const session = { profile: { id: 1, memberships: [{ business, branch: 1, role: "owner" }] } };
  const writes = []; let fail = true;
  const { default: Manage } = load("../app/manage.tsx", {
    "react-native": { ...native, Switch: "Switch" },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "expo-router": { useRouter: () => router(), useFocusEffect: focus },
    "expo-image-picker": {}, "expo-crypto": { randomUUID: () => "key" },
    "expo-secure-store": { getItemAsync: async () => null },
    "../src/lib/api": { getSession: () => session, ApiError: Error, api: async (path, payload) => {
      if (!payload) return path === "businesses/1/" ? business : [];
      writes.push(payload); if (fail) { fail = false; throw new Error("Connection interrupted; retry"); } return { id: 2, ...payload };
    } }
  });
  let tree; await act(async () => { tree = create(React.createElement(Manage)); });
  const button = title => tree.root.findAllByType("Pressable").find(p => p.findAllByType("Text").some(t => t.props.children === title));
  await act(async () => button("Shop · owner").props.onPress());
  for (const [label, value] of [["name", "Perfume"], ["sku", "P-50"], ["price", "40000"], ["cost", "25000"]]) {
    await act(async () => tree.root.findAllByType("TextInput").filter(p => p.props.accessibilityLabel === label).at(-1).props.onChangeText(value));
  }
  await act(async () => tree.root.findByProps({ accessibilityLabel: "Option 1 values" }).props.onChangeText("Small, Large"));
  await act(async () => button("Generate variants").props.onPress());
  await act(async () => button("Variant 2").props.onPress());
  await act(async () => tree.root.findAllByType("TextInput").filter(p => p.props.accessibilityLabel === "price").at(-1).props.onChangeText("70000"));
  await act(async () => button("Save products").props.onPress());
  assert.equal(tree.root.findAllByType("TextInput").filter(p => p.props.accessibilityLabel === "sku").at(-1).props.value, "P-50-2");
  await act(async () => button("Save products").props.onPress());
  assert.equal(writes[1].products.length, 2);
  assert.equal(writes[1].products[1].price, 70000);
  assert.equal(writes[1].products[0].variant_group, writes[1].products[1].variant_group);
  assert.equal(writes.length, 2); assert.equal(writes[1].products[0].price, 40000); assert.equal(writes[1].products[0].cost, 25000); assert.equal(writes[1].products[0].sku, "P-50-1");
  assert.equal(tree.root.findAllByType("TextInput").filter(p => p.props.accessibilityLabel === "sku").at(-1).props.value, "");
  await act(async () => tree.unmount());
});


test("shop photos resolve on mobile and one failed photo does not hide another", async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(React.Fragment, null,
    React.createElement(picture.ProductPicture, { uri: 'http://localhost:8000/media/a.png', name: 'Kampala' }),
    React.createElement(picture.ProductPicture, { uri: 'http://localhost:8000/media/b.png', name: 'Jinja' })) ); });
  const photos = tree.root.findAllByType('Image');
  assert.equal(photos[0].props.source.uri, 'http://192.168.43.13:8000/media/a.png');
  assert.equal(photos[1].props.source.uri, 'http://192.168.43.13:8000/media/b.png');
  assert.equal(photos[0].props.resizeMode, 'contain');
  await act(async () => photos[0].props.onError());
  assert.equal(tree.root.findByType('Image').props.accessibilityLabel, 'Jinja');
  await act(async () => tree.unmount());
});

test("mobile variants select exact stock and wishlist identity before adding to cart", async () => {
  let params={slug:"perfume",product:"1"}, tree;
  const products=[
    {id:1,name:"Perfume",variant_group:"scent",attributes:{Volume:"50 ml"},price:40000,available:3,image:"",category:1,category_name:"Fragrance"},
    {id:2,name:"Perfume",variant_group:"scent",attributes:{Volume:"100 ml"},price:70000,available:0,image:"",category:1,category_name:"Fragrance"},
    {id:3,name:"Perfume",variant_group:"scent",attributes:{Volume:"200 ml"},price:90000,available:2,image:"",category:1,category_name:"Fragrance"}
  ];
  const catalog={shop:{slug:"perfume",name:"Perfume Shop",currency:"UGX",delivery_enabled:false,delivery_fee:0},products,categories:[],availability_notice:""};
  let savedCart, savedWishlist;
  const customer={ready:true,carts:[],wishlist:[],saveCart:(_catalog,quantities)=>{savedCart=quantities;},toggleWishlist:item=>{savedWishlist=item;},clearCart(){},rememberOrder:async()=>{}};
  const navigation={...router(),setParams:patch=>{params={...params,...patch};tree.update(React.createElement(ShopScreen));}};
  const {ShopScreen}=load("../src/features/storefront/ShopScreens.tsx",{
    "react-native":native,"react-native-safe-area-context":{SafeAreaView:"SafeAreaView"},
    "expo-router":{useRouter:()=>navigation,useLocalSearchParams:()=>params,useFocusEffect:focus},
    "expo-crypto":{randomUUID:()=>"key"},"expo-secure-store":{getItemAsync:async()=>null,setItemAsync:async()=>{}},
    "./ProductPicture":{ProductPicture:()=>null},"./ProductShowcase":{__esModule:true,default:()=>null},
    "./CustomerProvider":{useCustomer:()=>customer},"../../lib/order-attempt":load("../src/lib/order-attempt.ts",{}),
    "../../lib/api":{publicApi:async()=>catalog},"../../lib/types":{money:n=>"UGX "+n},
    "../../lib/storefront":{orderMessages:{},orderSteps:[]}
  });
  await act(async()=>{tree=create(React.createElement(ShopScreen));});
  await act(async()=>tree.root.findByProps({accessibilityLabel:"Select Volume: 100 ml"}).props.onPress());
  assert.equal(tree.root.findAllByProps({accessibilityLabel:"Add to cart +"}).at(-1).props.disabled,true);
  await act(async()=>tree.root.findByProps({accessibilityLabel:"Select Volume: 200 ml"}).props.onPress());
  await act(async()=>tree.root.findAllByProps({accessibilityLabel:"Save Perfume to wishlist"}).at(-1).props.onPress());
  assert.equal(savedWishlist.id,3); assert.equal(savedWishlist.attributes.Volume,"200 ml");
  await act(async()=>tree.root.findAllByProps({accessibilityLabel:"Add to cart +"}).at(-1).props.onPress());
  assert.equal(savedCart[3],1); assert.equal(savedCart[1] || 0,0);
  await act(async()=>tree.unmount());
});
