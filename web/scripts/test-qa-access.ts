import { randomBytes } from "node:crypto";
import { pool } from "../lib/db";
import { getForgejoAccessToken } from "../lib/forgejo-auth";
import { encryptForgejoSecret } from "../lib/forgejo-token-crypto";

const base = process.env.QA_TEST_BASE_URL ?? "http://localhost:3000";
const suffix = randomBytes(8).toString("hex");
const users: string[] = [];
try {
  const project = await pool.query<{ id: string }>("SELECT id FROM projects ORDER BY id LIMIT 1");
  if (!project.rows[0]) throw new Error("A disposable test project is required");
  const projectId = project.rows[0].id;
  const owner = await pool.query<{ user_id: string }>(`SELECT pm.user_id FROM project_members pm JOIN forgejo_identities fi ON fi.user_id = pm.user_id WHERE pm.project_id = $1 LIMIT 1`, [projectId]);
  if (!owner.rows[0]) throw new Error("Connect a project member to Forgejo before running this test");
  const token = await getForgejoAccessToken(owner.rows[0].user_id);
  const cookies: string[] = [];
  for (let i = 0; i < 2; i++) {
    const result = await pool.query<{ id: string }>("INSERT INTO users (email, password_hash, display_name) VALUES ($1, 'unused', 'QA test') RETURNING id", [`qa-${suffix}-${i}@example.invalid`]);
    const id = result.rows[0].id; users.push(id);
    // Temporary identities reuse the connected owner's credentials only inside
    // this disposable isolation test; they are removed in finally.
    await pool.query(`INSERT INTO forgejo_identities (user_id, forgejo_user_id, forgejo_username, access_token_ciphertext)
      VALUES ($1, -$1::bigint, 'test-only', $2)`, [id, encryptForgejoSecret(token, id, "access")]);
    await pool.query("INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)", [projectId, id]);
    const session = randomBytes(32).toString("hex");
    await pool.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '5 minutes')", [session, id]);
    cookies.push(`session_id=${session}`);
  }
  const created = await pool.query<{ id: string }>("INSERT INTO qa_conversations (project_id, user_id, title) VALUES ($1, $2, 'private') RETURNING id", [projectId, users[0]]);
  const path = `${base}/api/projects/${projectId}/qa?conversation=${created.rows[0].id}`;
  const own = await fetch(path, { headers: { cookie: cookies[0] } });
  const other = await fetch(path, { headers: { cookie: cookies[1] } });
  const unauthorizedDelete = await fetch(path, { method: "DELETE", headers: { cookie: cookies[1] } });
  const anonymous = await fetch(path);
  if (own.status !== 200 || other.status !== 404 || unauthorizedDelete.status !== 404 || anonymous.status !== 401) throw new Error(`Unexpected statuses: ${own.status}, ${other.status}, ${unauthorizedDelete.status}, ${anonymous.status}`);
  console.log("Q&A conversation ownership and authentication checks passed");
} finally {
  if (users.length) await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [users]);
  await pool.end();
}
