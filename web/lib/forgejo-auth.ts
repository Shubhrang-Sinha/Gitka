import { pool } from "./db";
import { decryptForgejoSecret, encryptForgejoSecret } from "./forgejo-token-crypto";

export class ForgejoConnectionError extends Error {
  constructor(message = "Connect your Forgejo account to continue.") { super(message); this.name = "ForgejoConnectionError"; }
}

export function forgejoOAuthConfig() {
  const internal = process.env.FORGEJO_URL;
  const external = process.env.FORGEJO_PUBLIC_URL || internal;
  const clientId = process.env.FORGEJO_OAUTH_CLIENT_ID;
  const redirectUri = process.env.FORGEJO_OAUTH_REDIRECT_URI;
  if (!internal || !external || !clientId || !redirectUri) throw new ForgejoConnectionError("Forgejo sign-in is not configured. Contact the administrator.");
  for (const value of [internal, external, redirectUri]) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new ForgejoConnectionError("Forgejo sign-in is not configured correctly.");
  }
  return { internal: internal.replace(/\/+$/, ""), external: external.replace(/\/+$/, ""), clientId, redirectUri };
}

type TokenResponse = { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
export async function exchangeForgejoToken(fields: Record<string, string>) {
  const { internal, clientId } = forgejoOAuthConfig();
  const response = await fetch(`${internal}/login/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: clientId, ...fields }), cache: "no-store", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new ForgejoConnectionError("Forgejo authorization expired or failed. Please connect again.");
  const body = await response.json() as TokenResponse;
  if (typeof body.access_token !== "string" || !body.access_token) throw new ForgejoConnectionError("Forgejo returned an invalid authorization response.");
  return { accessToken: body.access_token, refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null, expiresIn: typeof body.expires_in === "number" && Number.isFinite(body.expires_in) && body.expires_in > 0 ? body.expires_in : null };
}

export async function getForgejoAccessToken(userId: string | number): Promise<string> {
  const id = String(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ access_token_ciphertext: string; refresh_token_ciphertext: string | null; token_expires_at: Date | null }>("SELECT access_token_ciphertext, refresh_token_ciphertext, token_expires_at FROM forgejo_identities WHERE user_id = $1 FOR UPDATE", [id]);
    const identity = result.rows[0];
    if (!identity) throw new ForgejoConnectionError();
    let accessToken = decryptForgejoSecret(identity.access_token_ciphertext, id, "access");
    if (identity.token_expires_at && identity.token_expires_at.getTime() <= Date.now() + 60_000) {
      if (!identity.refresh_token_ciphertext) throw new ForgejoConnectionError("Your Forgejo authorization expired. Please connect again.");
      const refresh = decryptForgejoSecret(identity.refresh_token_ciphertext, id, "refresh");
      const token = await exchangeForgejoToken({ grant_type: "refresh_token", refresh_token: refresh });
      accessToken = token.accessToken;
      await client.query(`UPDATE forgejo_identities SET access_token_ciphertext = $2, refresh_token_ciphertext = $3, token_expires_at = $4, updated_at = now() WHERE user_id = $1`, [id, encryptForgejoSecret(accessToken, id, "access"), encryptForgejoSecret(token.refreshToken ?? refresh, id, "refresh"), token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null]);
    }
    await client.query("COMMIT");
    return accessToken;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof ForgejoConnectionError) throw error;
    console.error("Forgejo authorization unavailable", error instanceof Error ? error.name : "Unknown error");
    throw new ForgejoConnectionError("Forgejo authorization is unavailable. Please reconnect or contact the administrator.");
  } finally { client.release(); }
}
