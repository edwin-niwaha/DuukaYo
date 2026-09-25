const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
for (const app of ['duukayo-web', 'duukayo-mobile']) {
  const result = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(`../../${app}/src/lib/http.ts`), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: result });
  test(`${app}: rejects invalid data before serialization`, () => {
    for (const body of [{ price: NaN }, { price: Infinity }, { quantity: 1.5 }, { name: '   ' }, { phone: '-------' }, { phone: '123456' }, { price: -1 }, { email: 'bad@' }, { delivery: true, address: ' ' }, { lines: [{ price: 10, quantity: -1 }] }]) {
      assert.throws(() => result.serializeBody(body), e => e.status === 400 && e.code === 'validation_error');
    }
  });
  test(`${app}: accepts valid data and preserves credentials and option values`, () => {
    const data = { name: 'Rice', phone: '+256 700 123456', price: 0, cost: null, password: '  private  ', attributes: { price: 'premium', name: '' } };
    assert.deepEqual(JSON.parse(result.serializeBody(data)), data);
    assert.equal(result.serializeBody(undefined), undefined);
  });
}
const feedback = require('./load-feedback.cjs');
test('toasts ignore empty feedback, deduplicate repeats, and unsubscribe', () => {
  const events = [];
  const unsubscribe = feedback.subscribeToasts(t => events.push(t));
  feedback.notify(''); feedback.notify('Check the quantity', 'error'); feedback.notify('Check the quantity', 'error');
  assert.equal(events.length, 1); assert.equal(events[0].tone, 'error');
  unsubscribe(); feedback.notify('Saved', 'success'); assert.equal(events.length, 1);
});

test('native toast announces errors, respects safe areas and can be dismissed', async () => {
  const React = require('react');
  const { create, act } = require('react-test-renderer');
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const announcements = [];
  const exports = {};
  const dependencies = {
    '../lib/feedback': feedback,
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: x => x }, AccessibilityInfo: { announceForAccessibility: text => announcements.push(text) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 30 }) },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/components/Toasts.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: n => dependencies[n] || require(n), setTimeout, clearTimeout });
  let tree;
  await act(async () => { tree = create(React.createElement(exports.default)); });
  await act(async () => feedback.notify('Enter a valid phone number.', 'error'));
  assert.deepEqual(announcements, ['Enter a valid phone number.']);
  assert.match(JSON.stringify(tree.toJSON()), /Enter a valid phone number/);
  assert.equal(tree.root.findAllByType('View')[0].props.style[1].top, 42);
  await act(async () => tree.root.findByProps({ accessibilityLabel: 'Dismiss notification' }).props.onPress());
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Enter a valid phone number/);
  await act(async () => tree.unmount());
});
