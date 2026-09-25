const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/lib/media.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
vm.runInNewContext(source, { exports: exportsObject, URL, process: { env: {} }, require: () => ({ resolveApiConfig: () => ({ base: 'http://192.168.43.13:8000/api/v1/' }) }) });
const { resolveImageUrl } = exportsObject;
test('shop uploads use the phone-accessible API origin', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', '10.0.2.2']) {
    assert.equal(resolveImageUrl(`http://${host}:8000/media/businesses/2/photo.png`), 'http://192.168.43.13:8000/media/businesses/2/photo.png');
  }
  assert.equal(resolveImageUrl('/media/photo.png'), 'http://192.168.43.13:8000/media/photo.png');
  assert.equal(resolveImageUrl('http://localhost:8000/media/photo.png?v=2', 'https://api.example.com/api/v1/'), 'https://api.example.com/media/photo.png?v=2');
});
test('external photos and local picker URIs remain unchanged', () => {
  for (const uri of ['https://res.cloudinary.com/shop/photo', 'file:///device/photo.jpg', 'content://media/1', 'data:image/png;base64,abc']) assert.equal(resolveImageUrl(uri), uri);
  assert.equal(resolveImageUrl(undefined), '');
  assert.equal(resolveImageUrl('http://localhost:3000/demo/milk.svg'), 'http://192.168.43.13:3000/demo/milk.svg');
});
