const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { create, act } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const original = { access: "access", refresh: "refresh", verifiedAt: Date.now(), profile: { id: 1, username: "owner", first_name: "Drake", last_name: "K", email: "owner@example.com", has_password: true, memberships: [] } };
function setup({ guest = false, fail = false } = {}) {
  let session = guest ? null : structuredClone(original);
  const listeners = new Set(), requests = [], routes = [];
  let signouts = 0, permissionRequests = 0, settingsOpened = 0;
  const native = {
    ...Object.fromEntries(["ActivityIndicator", "KeyboardAvoidingView", "Pressable", "ScrollView", "Text", "TextInput", "View"].map(n => [n, n])),
    StyleSheet: { create: v => v }, Platform: { OS: "android", Version: 35 },
    AppState: { addEventListener: () => ({ remove() {} }) },
    Alert: { alert: (_a, _b, buttons) => buttons.at(-1).onPress() },
    Linking: { openSettings: async () => { settingsOpened++; }, openURL: async () => {} }, Share: { share: async () => {} }
  };
  const publish = () => listeners.forEach(fn => fn(session));
  const dependencies = {
    "react-native": native, "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "expo-router": { useFocusEffect: fn => React.useEffect(fn, [fn]), useRouter: () => ({ push: p => routes.push(p), replace: p => routes.push(p), navigate: p => routes.push(p) }) },
    "expo-constants": { __esModule: true, default: { expoConfig: { version: "0.1.0" } } }, "expo-device": { modelName: "Test phone" },
    "expo-notifications": { IosAuthorizationStatus: { PROVISIONAL: 3 }, AndroidImportance: { HIGH: 4 }, getPermissionsAsync: async () => ({ granted: false, canAskAgain: true }), requestPermissionsAsync: async () => { permissionRequests++; }, setNotificationChannelAsync: async () => {} },
    "../../lib/google": { googleConfigured: false },
    "../storefront/CustomerTabs": { OrdersTab: () => React.createElement("OrderHistory") },
    "../storefront/CustomerProvider": { useCustomer: () => ({ carts: [], tokens: [] }) },
    "../../lib/api": {
      ApiError: class extends Error {}, getSession: () => session, restoreSession: async () => session,
      subscribeSession: fn => { listeners.add(fn); return () => listeners.delete(fn); }, verifySession: async () => { publish(); return session; },
      signOut: async () => { signouts++; session = null; publish(); }, signIn: async () => { session = structuredClone(original); publish(); },
      api: async (path, body) => {
        requests.push({ path, body });
        if (fail) throw new Error("Unable to save. Retry when connected.");
        if (path === "auth/profile/") session = { ...session, profile: { ...session.profile, ...body } };
        return { detail: "Saved" };
      },
      publicApi: async (path, body) => { requests.push({ path, body }); return { detail: path.includes("reset") ? "Password reset. Sign in with your new password." : "If this email matches an active account, recovery instructions will arrive shortly." }; }
    }
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(require.resolve("../src/features/account/AccountScreen.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, require: n => n.endsWith("/lib/feedback") ? require("./load-feedback.cjs") : n.endsWith("/components/Icon") ? { __esModule: true, default: "Icon" } : n in dependencies ? dependencies[n] : require(n), process: { env: {} }, console, Error });
  return { ...exports, requests, routes, stats: () => ({ signouts, permissionRequests, settingsOpened }) };
}
const click = (tree, label) => act(async () => tree.root.findByProps({ accessibilityLabel: label }).props.onPress());
const enter = (tree, label, value) => act(async () => tree.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value));
const text = tree => JSON.stringify(tree.toJSON());

test("Account saves profile edits and keeps identity fields read-only", async () => {
  const app = setup(); let tree;
  await act(async () => { tree = create(React.createElement(app.default)); });
  await click(tree, "Profile");
  assert.equal(tree.root.findByProps({ accessibilityLabel: "Save changes" }).props.disabled, true);
  assert.equal(tree.root.findByProps({ accessibilityLabel: "Account email" }).props.editable, false);
  await enter(tree, "First name", "New name");
  await click(tree, "Save changes");
  assert.equal(app.requests[0].body.first_name, "New name");
  assert.match(text(tree), /Profile saved/);
  assert.equal(tree.root.findByProps({ accessibilityLabel: "Save changes" }).props.disabled, true);
  await act(async () => tree.unmount());
});

test("failed profile save retains edits for retry", async () => {
  const app = setup({ fail: true }); let tree;
  await act(async () => { tree = create(React.createElement(app.default)); });
  await click(tree, "Profile"); await enter(tree, "First name", "Keep me"); await click(tree, "Save changes");
  assert.equal(tree.root.findByProps({ accessibilityLabel: "First name" }).props.value, "Keep me");
  assert.match(text(tree), /Retry when connected/);
  await act(async () => tree.unmount());
});

test("password mismatch stays local; a successful change logs out", async () => {
  const app = setup(); let tree;
  await act(async () => { tree = create(React.createElement(app.default)); });
  await click(tree, "Account & security");
  await enter(tree, "Current password", "Old!Password"); await enter(tree, "New password", "New!Password"); await enter(tree, "Confirm new password", "Wrong!Password");
  await click(tree, "Change password"); assert.equal(app.requests.length, 0); assert.match(text(tree), /do not match/);
  await enter(tree, "Confirm new password", "New!Password"); await click(tree, "Change password");
  assert.equal(app.requests[0].path, "auth/password/change/"); assert.equal(app.stats().signouts, 1); assert.match(text(tree), /Sign-in password/);
  await act(async () => tree.unmount());
});

test("permission inspection does not prompt; logout ends the current session", async () => {
  const app = setup(); let tree;
  await act(async () => { tree = create(React.createElement(app.default)); });
  assert.equal(app.stats().permissionRequests, 0);
  await click(tree, "App permissions"); await click(tree, "Enable notifications"); assert.equal(app.stats().permissionRequests, 1);
  await click(tree, "Open device settings"); assert.equal(app.stats().settingsOpened, 1);
  await click(tree, "Log out"); assert.equal(app.stats().signouts, 1); assert.match(text(tree), /Browsing as a guest/);
  await act(async () => tree.unmount());
});

test("guest can request recovery and use a code without an account session", async () => {
  const app = setup({ guest: true }); let tree;
  await act(async () => { tree = create(React.createElement(app.RecoveryForm)); });
  await enter(tree, "Recovery email", "invalid"); await click(tree, "Send recovery code"); assert.equal(app.requests.length, 0);
  await enter(tree, "Recovery email", "owner@example.com"); await click(tree, "Send recovery code");
  assert.equal(app.requests[0].path, "auth/password/recovery/");
  await enter(tree, "Recovery code", "MQ.code"); await enter(tree, "New recovery password", "New!Password"); await enter(tree, "Confirm recovery password", "New!Password");
  await click(tree, "Reset password"); assert.equal(app.requests[1].body.code, "MQ.code"); assert.match(text(tree), /Password reset/);
  assert.equal(tree.root.findAllByProps({ accessibilityLabel: "Recovery code" }).length, 0);
  await act(async () => tree.unmount());
});


test("signed-in Accounts shows order history and guests retain tracking access", async () => {
  for (const guest of [false, true]) {
    const app = setup({ guest }); let tree;
    await act(async () => { tree = create(React.createElement(app.default)); });
    assert.equal(tree.root.findAllByType("OrderHistory").length, guest ? 0 : 1);
    await click(tree, "Recent orders");
    assert.equal(app.routes.at(-1), "/(tabs)/orders");
    await act(async () => tree.unmount());
  }
});
