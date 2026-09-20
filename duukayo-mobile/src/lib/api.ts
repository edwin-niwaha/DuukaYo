import * as SecureStore from "expo-secure-store";
import type { Profile, Session } from "./types";
import { resolveApiConfig } from "./config.mjs";
const { base, timeout } = resolveApiConfig({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  legacyUrl: process.env.EXPO_PUBLIC_API_URL,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  legacyEnv: process.env.EXPO_PUBLIC_ENV,
  timeoutMs: process.env.EXPO_PUBLIC_API_TIMEOUT_MS,
});
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let current: Session | null = null;
let refreshPromise: Promise<void> | null = null;
export async function saveSession(session: Session | null) {
  if (session)
    await SecureStore.setItemAsync("pos-session", JSON.stringify(session));
  else await SecureStore.deleteItemAsync("pos-session");
  current = session;
}
export async function restoreSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync("pos-session");
  current = raw ? JSON.parse(raw) : null;
  return current;
}
export function getSession() {
  return current;
}
async function raw<T>(
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(
      "The server returned an unreadable response. Please retry.",
      response.status,
    );
  }
  if (!response.ok)
    throw new ApiError(
      typeof data?.detail === "string" ? data.detail : JSON.stringify(data),
      response.status,
    );
  return data as T;
}
async function refresh() {
  if (!current) throw new ApiError("Sign in again", 401);
  const tokens = await raw<{ access: string; refresh: string }>(
    "auth/refresh/",
    { refresh: current.refresh },
  );
  await saveSession({ ...current, ...tokens });
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!current) throw new ApiError("Sign in again", 401);
  try {
    return await raw<T>(path, body, current.access);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      if (!refreshPromise)
        refreshPromise = refresh().finally(() => {
          refreshPromise = null;
        });
      await refreshPromise;
      return raw<T>(path, body, current!.access);
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
  return session;
}
export async function signOut() {
  if (current) {
    try {
      await raw("auth/revoke/", { refresh: current.refresh });
    } catch {
      /* Local sign-out still completes; refresh expires server-side. */
    }
  }
  await saveSession(null);
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
