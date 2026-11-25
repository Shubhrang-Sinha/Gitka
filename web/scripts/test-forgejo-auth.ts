import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { pool } from "../lib/db";
import { encryptForgejoSecret } from "../lib/forgejo-token-crypto";
import { getForgejoAccessToken, ForgejoConnectionError } from "../lib/forgejo-auth";

let refreshes = 0;
const server = createServer((req, res) => {
  if (req.url !== "/login/oauth/access_token" || req.method !== "POST") { res.writeHead(404).end(); return; }
  refreshes++;
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const addr = server.address();
if (!addr || typeof addr === "string") throw new Error("Test server failed");
process.env.FORGEJO_URL = `http://127.0.0.1:${addr.port}`;
process.env.FORGEJO_PUBLIC_URL = process.env.FORGEJO_URL;
process.env.FORGEJO_OAUTH_CLIENT_ID = "test-client";
process.env.FORGEJO_OAUTH_REDIRECT_URI = "http://localhost:3000/api/auth/forgejo/callback";
process.env.FORGEJO_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
let id: string | undefined;
try {
  const user = await pool.query<{ id: string }>("INSERT INTO users (email, display_name, password_hash) VALUES ($1, 'OAuth test', 'unused') RETURNING id", [`oauth-${randomBytes(12).toString("hex")}@example.invalid`]);
  id = user.rows[0].id;
  let denied = false;
  try { await getForgejoAccessToken(id); } catch (e) { denied = e instanceof ForgejoConnectionError; }
  if (!denied) throw new Error("Disconnected users must not get a token");
  await pool.query(`INSERT INTO forgejo_identities (user_id, forgejo_user_id, forgejo_username, access_token_ciphertext, refresh_token_ciphertext, token_expires_at)
    VALUES ($1, $2, 'oauth-test', $3, $4, now() - interval '1 minute')`, [id, Number(id) + 1000000000, encryptForgejoSecret("old-access", id, "access"), encryptForgejoSecret("old-refresh", id, "refresh")]);
  const tokens = await Promise.all([getForgejoAccessToken(id), getForgejoAccessToken(id)]);
  if (tokens.some((token) => token !== "new-access") || refreshes !== 1) throw new Error("Concurrent token refresh was not serialized");
  const stored = await pool.query<{ access_token_ciphertext: string }>("SELECT access_token_ciphertext FROM forgejo_identities WHERE user_id = $1", [id]);
  if (stored.rows[0].access_token_ciphertext.includes("new-access")) throw new Error("Access token was stored in plaintext");
  console.log("Forgejo token refresh, concurrency, encryption, and disconnected access checks passed");
} finally {
  if (id) await pool.query("DELETE FROM users WHERE id = $1", [id]);
  await pool.end();
  server.close();
}
