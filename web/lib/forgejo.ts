const baseUrl = process.env.FORGEJO_URL;
const token = process.env.FORGEJO_TOKEN;

export async function forgejoFetch<T>(path: string): Promise<T> {
  if (!baseUrl || !token) {
    throw new Error("FORGEJO_URL or FORGEJO_TOKEN is missing from .env.local");
  }

  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Forgejo API returned ${response.status} for ${path}`);
  }

  return (await response.json()) as T;
}