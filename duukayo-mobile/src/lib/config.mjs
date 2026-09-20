export function resolveApiConfig(values) {
  const environment = (values.appEnv || values.legacyEnv || "development")
    .trim()
    .toLowerCase();
  const raw = (
    values.baseUrl ||
    values.legacyUrl ||
    "http://10.0.2.2:8000/api/v1/"
  ).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      "EXPO_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "EXPO_PUBLIC_API_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.",
    );
  if (
    [environment, (values.legacyEnv || "").trim().toLowerCase()].some((value) =>
      ["production", "prod"].includes(value),
    ) &&
    url.protocol !== "https:"
  )
    throw new Error("Production requires an HTTPS API URL");
  const timeout = Number(values.timeoutMs || 15000);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000)
    throw new Error(
      "EXPO_PUBLIC_API_TIMEOUT_MS must be an integer between 1 and 120000.",
    );
  return {
    base: url.toString().replace(/\/+$/, "") + "/",
    timeout,
    environment,
  };
}
