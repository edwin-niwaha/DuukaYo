import { resolveApiConfig } from "./config.mjs";

const { base } = resolveApiConfig({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  legacyUrl: process.env.EXPO_PUBLIC_API_URL,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  legacyEnv: process.env.EXPO_PUBLIC_ENV,
});

// Stored development URLs may refer to the server's loopback interface.
// On a phone that interface belongs to the phone, not the API server.
export function resolveImageUrl(uri?: string, apiBase = base): string {
  if (!uri) return "";
  try {
    const server = new URL(apiBase);
    const image = new URL(uri, server.origin);
    if (["localhost", "127.0.0.1", "[::1]", "10.0.2.2"].includes(image.hostname)) {
      image.hostname = server.hostname;
      // API-owned uploads follow the configured API origin, including HTTPS.
      if (image.pathname.startsWith("/media/")) {
        image.protocol = server.protocol;
        image.port = server.port;
      }
    }
    return image.toString();
  } catch {
    return uri;
  }
}
