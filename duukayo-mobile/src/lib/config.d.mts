export function resolveApiConfig(values: {
  baseUrl?: string;
  legacyUrl?: string;
  appEnv?: string;
  legacyEnv?: string;
  timeoutMs?: string;
}): { base: string; timeout: number; environment: string };
