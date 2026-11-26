export type ForgejoEmailStatus = "exists" | "not_found" | "unknown";

const USERNAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,38}[a-zA-Z0-9])?$/;

function forgejoBaseUrl() {
  const baseUrl = process.env.FORGEJO_URL?.trim();
  return baseUrl ? baseUrl.replace(/\/+$/, "") : null;
}

/** Whether Gitka can check Forgejo emails authoritatively and provision accounts via admin API. */
export function canProvisionForgejoAccount(): boolean {
  return Boolean(forgejoBaseUrl() && process.env.FORGEJO_ADMIN_TOKEN?.trim());
}

/** Validate a Forgejo username against Forgejo's allowed characters and reserved suffixes. */
export function isValidForgejoUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username) && !username.includes("..") && !/\.(?:git|keys)$/i.test(username);
}

/** Derive a valid initial Forgejo username suggestion from email or display name. */
export function suggestForgejoUsername(email: string, displayName: string): string {
  const local = email.split("@")[0] ?? "";
  for (const candidate of [local, displayName]) {
    const cleaned = candidate
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/\.{2,}/g, ".")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 39)
      .replace(/[._-]+$/g, "");
    if (cleaned && isValidForgejoUsername(cleaned)) {
      return cleaned;
    }
  }
  return "gitka-user";
}

/** Check whether an email address already belongs to a Forgejo account. */
export async function checkForgejoEmail(email: string): Promise<ForgejoEmailStatus> {
  const baseUrl = forgejoBaseUrl();
  if (!baseUrl) return "unknown";
  const normalized = email.trim().toLowerCase();
  if (!normalized) return "unknown";

  const adminToken = process.env.FORGEJO_ADMIN_TOKEN?.trim();
  if (adminToken) {
    try {
      for (let page = 1; page <= 5; page++) {
        const response = await fetch(
          `${baseUrl}/api/v1/admin/emails/search?q=${encodeURIComponent(normalized)}&page=${page}&limit=50`,
          {
            headers: { Authorization: `token ${adminToken}`, Accept: "application/json" },
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!response.ok) return "unknown";
        const entries = (await response.json()) as { email?: unknown }[];
        if (!Array.isArray(entries)) return "unknown";
        if (entries.some((entry) => typeof entry.email === "string" && entry.email.trim().toLowerCase() === normalized)) {
          return "exists";
        }
        if (entries.length < 50) return "not_found";
      }
      return "not_found";
    } catch (error) {
      console.error("Forgejo admin email check failed", error instanceof Error ? error.name : "Unknown error");
      return "unknown";
    }
  }

  const readToken = process.env.FORGEJO_TOKEN?.trim();
  if (!readToken) return "unknown";
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/users/search?q=${encodeURIComponent(normalized)}&limit=50`,
      {
        headers: { Authorization: `token ${readToken}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return "unknown";
    const body = (await response.json()) as { data?: { email?: unknown }[] };
    if (!Array.isArray(body.data)) return "unknown";
    if (body.data.some((entry) => typeof entry.email === "string" && entry.email.trim().toLowerCase() === normalized)) {
      return "exists";
    }
    return "unknown";
  } catch (error) {
    console.error("Forgejo user search failed", error instanceof Error ? error.name : "Unknown error");
    return "unknown";
  }
}

/** Create a Forgejo user account for a Gitka user whose email is not yet registered in Forgejo. */
export async function createForgejoUser(input: {
  username: string;
  email: string;
  password: string;
  fullName: string;
}): Promise<{ ok: true; username: string } | { ok: false; status: number; error: string; exists?: boolean }> {
  const baseUrl = forgejoBaseUrl();
  const adminToken = process.env.FORGEJO_ADMIN_TOKEN?.trim();
  if (!baseUrl || !adminToken) {
    return {
      ok: false,
      status: 503,
      error: "Forgejo account provisioning is not configured. Create an account in Forgejo instead.",
    };
  }

  const emailStatus = await checkForgejoEmail(input.email);
  if (emailStatus === "exists") {
    return {
      ok: false,
      status: 409,
      exists: true,
      error: "A Forgejo account with this email already exists. Connect your existing Forgejo account instead.",
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/admin/users`, {
      method: "POST",
      headers: {
        Authorization: `token ${adminToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        username: input.username,
        email: input.email,
        password: input.password,
        full_name: input.fullName,
        must_change_password: false,
        send_notify: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 201) {
      const created = (await response.json()) as { login?: string; username?: string };
      return { ok: true, username: created.login || created.username || input.username };
    }

    let message = "";
    try {
      const data = (await response.json()) as { message?: unknown };
      if (typeof data.message === "string") message = data.message;
    } catch {
      // Ignore malformed error body from upstream.
    }

    if (response.status === 422 || response.status === 409) {
      if (/e-?mail/i.test(message)) {
        return {
          ok: false,
          status: 409,
          exists: true,
          error: "A Forgejo account with this email already exists. Connect your existing Forgejo account instead.",
        };
      }
      if (/user(?:name)?|reserved|already exists/i.test(message)) {
        return {
          ok: false,
          status: 409,
          error: "That Forgejo username is unavailable. Try a different username.",
        };
      }
      if (/password/i.test(message)) {
        return {
          ok: false,
          status: 400,
          error: "Password does not meet Forgejo requirements.",
        };
      }
      return { ok: false, status: 400, error: "Could not create the Forgejo account with those details." };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 503, error: "Forgejo account provisioning is unavailable. Create an account in Forgejo instead." };
    }
    return { ok: false, status: 502, error: "Could not reach Forgejo to create the account. Please try again." };
  } catch (error) {
    console.error("Forgejo user provisioning failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, status: 502, error: "Could not reach Forgejo to create the account. Please try again." };
  }
}
