import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { forgejoOAuthConfig } from "@/lib/forgejo-auth";
import { encryptForgejoSecret } from "@/lib/forgejo-token-crypto";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.redirect(new URL("/login", request.url));
  try {
    const { external, clientId, redirectUri } = forgejoOAuthConfig();
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const hash = createHash("sha256").update(state).update(":").update(sessionId).digest("hex");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    await pool.query("DELETE FROM forgejo_oauth_states WHERE expires_at < now()");
    await pool.query("INSERT INTO forgejo_oauth_states (state_hash, user_id, code_verifier_ciphertext, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')", [hash, user.id, encryptForgejoSecret(verifier, String(user.id), "oauth-state")]);
    const destination = new URL(`${external}/login/oauth/authorize`);
    destination.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
    return NextResponse.redirect(destination);
  } catch (error) {
    console.error("Could not start Forgejo OAuth", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.redirect(new URL("/connect-forgejo?error=configuration", request.url));
  }
}
