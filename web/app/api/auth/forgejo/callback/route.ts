import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { exchangeForgejoToken, forgejoOAuthConfig } from "@/lib/forgejo-auth";
import { decryptForgejoSecret, encryptForgejoSecret } from "@/lib/forgejo-token-crypto";

type ForgejoUser = { id: number; login: string };
type ForgejoEmail = { email: string; verified: boolean };

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.redirect(new URL("/login", request.url));
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (!state || state.length > 200 || !code || code.length > 1000) return NextResponse.redirect(new URL("/connect-forgejo?error=authorization", request.url));
  try {
    const hash = createHash("sha256").update(state).update(":").update(sessionId).digest("hex");
    const used = await pool.query<{ code_verifier_ciphertext: string }>("DELETE FROM forgejo_oauth_states WHERE state_hash = $1 AND user_id = $2 AND expires_at > now() RETURNING code_verifier_ciphertext", [hash, user.id]);
    if (!used.rowCount) return NextResponse.redirect(new URL("/connect-forgejo?error=authorization", request.url));
    const config = forgejoOAuthConfig();
    const verifier = decryptForgejoSecret(used.rows[0].code_verifier_ciphertext, String(user.id), "oauth-state");
    const token = await exchangeForgejoToken({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri, code_verifier: verifier });
    const headers = { Authorization: `Bearer ${token.accessToken}`, Accept: "application/json" };
    const [profileResponse, emailsResponse] = await Promise.all([
      fetch(`${config.internal}/api/v1/user`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) }),
      fetch(`${config.internal}/api/v1/user/emails`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) }),
    ]);
    if (!profileResponse.ok || !emailsResponse.ok) throw new Error("Forgejo identity lookup failed");
    const profile = await profileResponse.json() as ForgejoUser;
    const emails = await emailsResponse.json() as ForgejoEmail[];
    if (!Number.isSafeInteger(profile.id) || profile.id <= 0 || typeof profile.login !== "string" || !Array.isArray(emails)) throw new Error("Forgejo returned an invalid identity");
    if (!emails.some((entry) => entry.verified === true && typeof entry.email === "string" && entry.email.trim().toLowerCase() === String(user.email).toLowerCase())) {
      return NextResponse.redirect(new URL("/connect-forgejo?error=email", request.url));
    }
    await pool.query(`INSERT INTO forgejo_identities (user_id, forgejo_user_id, forgejo_username, access_token_ciphertext, refresh_token_ciphertext, token_expires_at)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id) DO UPDATE SET forgejo_user_id = EXCLUDED.forgejo_user_id,
      forgejo_username = EXCLUDED.forgejo_username, access_token_ciphertext = EXCLUDED.access_token_ciphertext,
      refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext, token_expires_at = EXCLUDED.token_expires_at, updated_at = now()`,
      [user.id, profile.id, profile.login, encryptForgejoSecret(token.accessToken, String(user.id), "access"), token.refreshToken ? encryptForgejoSecret(token.refreshToken, String(user.id), "refresh") : null, token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null]);
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("Forgejo account connection failed", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.redirect(new URL("/connect-forgejo?error=connection", request.url));
  }
}
