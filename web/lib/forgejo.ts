export class ForgejoRequestError extends Error {
  constructor(readonly status: number, path: string) {
    super(`Forgejo API returned ${status} for ${path}`);
  }
}

export class ForgejoConfigurationError extends Error {}

export async function forgejoFetch<T>(path: string, signal = AbortSignal.timeout(8000)): Promise<T> {
  const baseUrl = process.env.FORGEJO_URL;
  const token = process.env.FORGEJO_TOKEN;
  if (!baseUrl || !token) {
    throw new ForgejoConfigurationError("FORGEJO_URL or FORGEJO_TOKEN is missing from .env.local");
  }

  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new ForgejoRequestError(response.status, path);
  }

  return (await response.json()) as T;
}
export async function forgejoFetchText(path: string, signal = AbortSignal.timeout(8000)): Promise<string | null> {
  const baseUrl = process.env.FORGEJO_URL;
  const token = process.env.FORGEJO_TOKEN;
  if (!baseUrl || !token) {
    throw new Error("FORGEJO_URL or FORGEJO_TOKEN is missing from .env.local");
  }

  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    headers: { Authorization: `token ${token}` },
    cache: "no-store",
    signal,
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ForgejoRequestError(response.status, path);
  }
  return await response.text();
}

/** Execute Forgejo API calls as the connected Gitka user. */
async function requestAs(userId: string | number, path: string, init: RequestInit = {}) {
  if (!path.startsWith("/") || path.startsWith("//") || path.split("?")[0].split("/").some((segment) => {
    try { const decoded = decodeURIComponent(segment); return decoded.replaceAll("\\", "/").split("/").some((part) => part === "." || part === ".."); }
    catch { return true; }
  })) throw new ForgejoConfigurationError("Invalid Forgejo API path");
  const { getForgejoAccessToken } = await import("./forgejo-auth");
  const baseUrl = process.env.FORGEJO_URL;
  if (!baseUrl) throw new ForgejoConfigurationError("FORGEJO_URL is not configured");
  const token = await getForgejoAccessToken(userId);
  return fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(8000),
  });
}

export async function forgejoFetchAs<T>(userId: string | number, path: string, signal?: AbortSignal): Promise<T> {
  const response = await requestAs(userId, path, { signal });
  if (!response.ok) throw new ForgejoRequestError(response.status, path);
  return await response.json() as T;
}

export async function forgejoFetchTextAs(userId: string | number, path: string, signal?: AbortSignal): Promise<string | null> {
  const response = await requestAs(userId, path, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new ForgejoRequestError(response.status, path);
  return response.text();
}

export async function forgejoPostAs<T>(userId: string | number, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await requestAs(userId, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new ForgejoRequestError(response.status, path);
  return await response.json() as T;
}
