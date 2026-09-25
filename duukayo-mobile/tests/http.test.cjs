const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

for (const app of ['duukayo-mobile', 'duukayo-web']) {
  function setup(fetch) {
    const exports = {};
    const source = fs.readFileSync(require.resolve(`../../${app}/src/lib/http.ts`), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, fetch, AbortController, setTimeout, clearTimeout });
    return exports;
  }
  test(`${app}: network failure does not automatically repeat a sale`, async () => {
    let calls = 0;
    const { requestJson } = setup(async () => { calls++; throw new TypeError('Fetch failed'); });
    await assert.rejects(requestJson('/sales/', { method: 'POST' }), e => e.status === 0 && /not confirmed/.test(e.message));
    assert.equal(calls, 1);
  });
  test(`${app}: timeout covers response body reading`, async () => {
    const { requestJson } = setup(async (_url, { signal }) => ({ ok: true, status: 200, text: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Fetch request has been cancelled')))) }));
    await assert.rejects(requestJson('/shops/', {}, 5), e => e.status === 0 && e.code === 'timeout' && /too long/.test(e.message));
  });
  test(`${app}: HTML error response retains status without leaking server output`, async () => {
    const { requestJson } = setup(async () => ({ ok: false, status: 503, text: async () => '<html>private debug data</html>' }));
    await assert.rejects(requestJson('/shops/'), e => e.status === 503 && e.code === 'invalid_response' && !e.message.includes('private'));
  });
  test(`${app}: validation, authentication and empty success retain semantics`, async () => {
    for (const status of [400, 401, 403, 409]) {
      const { requestJson } = setup(async () => ({ ok: false, status, text: async () => JSON.stringify({ detail: 'Review this request' }) }));
      await assert.rejects(requestJson('/'), e => e.status === status && e.message === 'Review this request');
    }
    const { requestJson } = setup(async () => ({ ok: true, status: 204, text: async () => '' }));
    assert.equal(await requestJson('/'), null);
  });
}
