import * as SecureStore from "expo-secure-store";
import type { Profile, Session } from "./types";
import { resolveApiConfig } from "./config.mjs";
import { ApiError, requestJson, serializeBody } from "./http";
export { ApiError } from "./http";
const { base, timeout } = resolveApiConfig({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  legacyUrl: process.env.EXPO_PUBLIC_API_URL,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  legacyEnv: process.env.EXPO_PUBLIC_ENV,
  timeoutMs: process.env.EXPO_PUBLIC_API_TIMEOUT_MS,
});
let current: Session | null = null;
let refreshPromise: Promise<void> | null = null;
let sessionVersion = 0;
let sessionWrites: Promise<void> = Promise.resolve();
const sessionListeners = new Set<(session: Session | null) => void>();
export function subscribeSession(listener: (session: Session | null) => void) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}
export async function saveSession(session: Session | null) {
  sessionVersion += 1;
  current = session;
  sessionListeners.forEach((listener) => listener(session));
  const write = sessionWrites
    .catch(() => {})
    .then(() =>
      session
        ? SecureStore.setItemAsync("pos-session", JSON.stringify(session))
        : SecureStore.deleteItemAsync("pos-session"),
    );
  sessionWrites = write;
  await write;
}
export async function restoreSession(): Promise<Session | null> {
  const version = sessionVersion;
  await sessionWrites.catch(() => {});
  const raw = await SecureStore.getItemAsync("pos-session");
  if (version === sessionVersion) current = raw ? JSON.parse(raw) : null;
  return current;
}
export function getSession() {
  return current;
}
async function raw<T>(
  path: string,
  body?: unknown,
  token?: string,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  return requestJson<T>(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: serializeBody(body),
  }, timeout);
}
async function refresh() {
  if (!current) throw new ApiError("Sign in again", 401);
  const session = current;
  const version = sessionVersion;
  const tokens = await raw<{ access: string; refresh: string }>(
    "auth/refresh/",
    { refresh: session.refresh },
  );
  if (version !== sessionVersion || !current)
    throw new ApiError("Session ended. Sign in again.", 401);
  await saveSession({ ...session, ...tokens });
}
export async function api<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  if (!current) throw new ApiError("Sign in again", 401);
  const userId = current.profile.id;
  async function authorizedRequest(): Promise<T> {
    if (!current || current.profile.id !== userId)
      throw new ApiError("Session ended. Sign in again.", 401);
    const result = await raw<T>(path, body, current.access, method);
    if (!current || current.profile.id !== userId)
      throw new ApiError("Session ended. Sign in again.", 401);
    return result;
  }
  try {
    return await authorizedRequest();
  } catch (e) {
    if (
      e instanceof ApiError &&
      e.status === 401 &&
      current &&
      current.profile.id === userId
    ) {
      if (!refreshPromise)
        refreshPromise = refresh().finally(() => {
          refreshPromise = null;
        });
      await refreshPromise;
      return authorizedRequest();
    }
    throw e;
  }
}
export async function signIn(username: string, password: string) {
  const tokens = await raw<{ access: string; refresh: string }>("auth/token/", {
    username,
    password,
  });
  const profile = await raw<Profile>("auth/me/", undefined, tokens.access);
  const session = { ...tokens, profile, verifiedAt: Date.now() };
  await saveSession(session);
  return session;
}
export async function verifySession() {
  const profile = await api<Profile>("auth/me/");
  const session = { ...current!, profile, verifiedAt: Date.now() };
  await saveSession(session);
  if (!current || current.profile.id !== profile.id)
    throw new ApiError("Session ended. Sign in again.", 401);
  return current;
}
export async function signOut() {
  const token = current?.refresh;
  // Clear this device first, even if revocation is slow or the network is down.
  await saveSession(null);
  if (token) void raw("auth/revoke/", { refresh: token }).catch(() => {});
}

export async function signInWithGoogleToken(idToken: string) {
  const tokens = await raw<{ access: string; refresh: string }>(
    "auth/google/",
    { id_token: idToken },
  );
  const profile = await raw<Profile>("auth/me/", undefined, tokens.access);
  const session = { ...tokens, profile, verifiedAt: Date.now() };
  await saveSession(session);
  return session;
}
// Guest storefront requests never attach or refresh a staff session.
export function publicApi<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST", extraHeaders: Record<string, string> = {}): Promise<T> {
  return requestJson<T>(base + path, { method, headers: { "Content-Type": "application/json", ...extraHeaders }, body: serializeBody(body) }, timeout);
}

export async function uploadImage(businessId: number, asset: { uri: string; mimeType?: string | null; fileName?: string | null }, progress: (n: number) => void): Promise<string> {
  await api("auth/me/");
  const session = current;
  if (!session) throw new Error("Sign in again.");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}businesses/${businessId}/images/`);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access}`);
    xhr.timeout = 240000;
    xhr.upload.onprogress = e => { if (e.lengthComputable) progress(Math.round(e.loaded * 100 / e.total)); };
    xhr.onerror = xhr.ontimeout = () => reject(new Error("Upload interrupted. Try again."));
    xhr.onload = () => {
      if (!current || current.profile.id !== session.profile.id) { reject(new Error("Session ended.")); return; }
      try { const data = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300) resolve(data.url); else reject(new Error(JSON.stringify(data))); }
      catch { reject(new Error("Upload failed. Try again.")); }
    };
    const form = new FormData(); form.append("image", { uri: asset.uri, type: asset.mimeType || "image/jpeg", name: asset.fileName || "image.jpg" } as unknown as Blob); xhr.send(form);
  });
}
