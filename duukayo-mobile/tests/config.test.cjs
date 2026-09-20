const { test } = require("node:test");
const assert = require("node:assert/strict");

test("borrowed mobile keys normalize URLs and set timeout", async () => {
  const { resolveApiConfig } = await import("../src/lib/config.mjs");
  assert.deepEqual(
    resolveApiConfig({
      baseUrl: "http://10.0.2.2:8000/api/v1",
      appEnv: "development",
      timeoutMs: "30000",
    }),
    {
      base: "http://10.0.2.2:8000/api/v1/",
      environment: "development",
      timeout: 30000,
    },
  );
});
test("legacy mobile names still work", async () => {
  const { resolveApiConfig } = await import("../src/lib/config.mjs");
  assert.equal(
    resolveApiConfig({
      legacyUrl: "https://pos.example/api/v1/",
      legacyEnv: "production",
    }).base,
    "https://pos.example/api/v1/",
  );
});
test("both production names enforce HTTPS", async () => {
  const { resolveApiConfig } = await import("../src/lib/config.mjs");
  for (const values of [
    { appEnv: "production" },
    { legacyEnv: "production" },
    { appEnv: "development", legacyEnv: "production" },
  ])
    assert.throws(() => resolveApiConfig(values), /HTTPS/);
});
test("bad URLs and invalid timeouts fail before requests", async () => {
  const { resolveApiConfig } = await import("../src/lib/config.mjs");
  for (const baseUrl of [
    "not-a-url",
    "ftp://pos.example/",
    "https://u:p@pos.example/",
    "https://pos.example/?token=secret",
  ])
    assert.throws(() => resolveApiConfig({ baseUrl }), /URL/);
  for (const timeoutMs of ["NaN", "0", "-1", "120001", "1.5"])
    assert.throws(() => resolveApiConfig({ timeoutMs }), /TIMEOUT/);
});
