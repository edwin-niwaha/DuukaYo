const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/lib/api.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(fetch) {
  const values = new Map(); const exports = {};
  const secure = { async getItemAsync(key) { return values.get(key) || null; }, async setItemAsync(key,value) { values.set(key,value); }, async deleteItemAsync(key) { values.delete(key); } };
  vm.runInNewContext(source, { exports, require(name) { if (name === './http') { const http = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/lib/http.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: http, fetch, AbortController, setTimeout, clearTimeout }); return http; } if (name === 'expo-secure-store') return secure; if (name === './config.mjs') return { resolveApiConfig: () => ({ base: 'http://test/', timeout: 1000 }) }; throw new Error(name); }, process: { env: {} }, fetch, AbortSignal, console });
  return { api: exports, values };
}
const session = { access: 'access', refresh: 'refresh', verifiedAt: Date.now(), profile: { id: 1, username: 'owner', memberships: [] } };
const response = (status, body) => ({ status, ok: status < 400, text: async () => JSON.stringify(body) });
test('logout clears local login and notifies mounted screens even if revocation is offline', async () => {
  const { api, values } = setup(async () => { throw new Error('offline'); });
  await api.saveSession(session); let ended = false;
  const unsubscribe = api.subscribeSession((value) => { ended = value === null; });
  await api.signOut();
  assert.equal(api.getSession(), null); assert.equal(values.has('pos-session'), false); assert.equal(ended, true);
  assert.equal(await api.restoreSession(), null); unsubscribe();
});
test('an in-flight token refresh cannot restore a logged-out session', async () => {
  let complete; let started;
  const refreshStarted = new Promise((resolve) => { started = resolve; });
  const { api, values } = setup(async (url) => {
    if (url.endsWith('auth/refresh/')) { started(); return new Promise((resolve) => { complete = () => resolve(response(200, { access: 'new', refresh: 'new-refresh' })); }); }
    if (url.endsWith('auth/revoke/')) return response(200, {});
    return response(401, { detail: 'expired' });
  });
  await api.saveSession(session);
  const pending = api.api('products/'); const rejected = assert.rejects(pending, /Session ended/);
  await refreshStarted; await api.signOut(); complete(); await rejected;
  assert.equal(api.getSession(), null); assert.equal(values.has('pos-session'), false);
});
test('public shopping calls work after logout without a bearer token', async () => {
  let headers;
  const { api } = setup(async (_url, options) => { headers = options.headers; return response(200, { shops: [] }); });
  await api.saveSession(session); await api.signOut(); await api.publicApi('shops/');
  assert.equal(headers.Authorization, undefined);
});
