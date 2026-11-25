const baseUrl = process.env.FORGEJO_URL;
const token = process.env.FORGEJO_TOKEN;

export class ForgejoRequestError extends Error {
  constructor(readonly status: number, path: string) {
    super(`Forgejo API returned ${status} for ${path}`);
  }
}

export async function forgejoFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!baseUrl || !token) {
    throw new Error("FORGEJO_URL or FORGEJO_TOKEN is missing from .env.local");
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
export async function forgejoFetchText(path: string): Promise<string | null> {
  if (!baseUrl || !token) {
    throw new Error("FORGEJO_URL or FORGEJO_TOKEN is missing from .env.local");
  }

  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    headers: { Authorization: `token ${token}` },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ForgejoRequestError(response.status, path);
  }
  return await response.text();
}
