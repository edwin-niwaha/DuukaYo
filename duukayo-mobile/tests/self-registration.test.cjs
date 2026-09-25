const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
test('mobile self-registration rejects mismatches and submits no elevated permissions', async () => {
  const exports = {}, requests = [];
  const deps = {
    'react-native': { ...Object.fromEntries(['KeyboardAvoidingView','Pressable','ScrollView','Text','TextInput','View'].map(k => [k,k])), Platform: { OS: 'android' }, StyleSheet: { create: x => x } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useRouter: () => ({ replace() {} }) },
    '../src/lib/feedback': require('./load-feedback.cjs'),
    '../src/lib/api': { publicApi: async (path, body) => { requests.push({ path, body }); return { detail: 'Account created. Sign in to continue.' }; } },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../app/signup.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: n => deps[n] || require(n) });
  let tree;
  await act(async () => { tree = create(React.createElement(exports.default)); });
  const enter = (label, value) => act(async () => tree.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value));
  const submit = () => act(async () => tree.root.findByProps({ accessibilityLabel: 'Create account' }).props.onPress());
  await enter('Username', 'buyer'); await enter('Email', 'buyer@example.com'); await enter('Password', 'Personal-passphrase-895'); await enter('Confirm password', 'Different-passphrase-985');
  await submit(); assert.equal(requests.length, 0); assert.match(JSON.stringify(tree.toJSON()), /Passwords do not match/);
  await enter('Confirm password', 'Personal-passphrase-895'); await submit();
  assert.equal(requests.length, 1); assert.equal(requests[0].path, 'auth/accounts/');
  assert.deepEqual(Object.keys(requests[0].body).sort(), ['confirm_password','email','password','username']);
  assert.equal(tree.root.findAllByType('TextInput').length, 0);
  await act(async () => tree.unmount());
});
