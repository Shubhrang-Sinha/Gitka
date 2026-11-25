import { getCurrentUser } from "@/lib/session";
import { ForgejoConnectionError } from "@/lib/forgejo-auth";
import { forgejoPostAs, ForgejoRequestError } from "@/lib/forgejo";
import { pool } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(name) || name.endsWith(".git") || description.length > 255 || typeof body.private !== "boolean") {
    return Response.json({ error: "Enter a valid repository name and description." }, { status: 400 });
  }
  const limited = await rateLimit("create-repository", String(user.id), 10, 60);
  if (limited) return limited;
  let repo: { full_name: string; name: string };
  try {
    repo = await forgejoPostAs(String(user.id), "/user/repos", { name, description, private: body.private, auto_init: true });
  } catch (error) {
    if (error instanceof ForgejoConnectionError) return Response.json({ error: error.message }, { status: 403 });
    if (error instanceof ForgejoRequestError && (error.status === 401 || error.status === 403)) return Response.json({ error: "Your Forgejo account cannot perform this action." }, { status: 403 });
    if (error instanceof ForgejoRequestError && (error.status === 409 || error.status === 422)) return Response.json({ error: "Could not create the repository. The name may already be in use." }, { status: 409 });
    console.error("Create Forgejo repository failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Could not create the repository. Check your Forgejo connection and try again." }, { status: 502 });
  }
  // Forgejo's repository exists even if linking it to Gitka fails; let the user recover by linking it.
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>("INSERT INTO projects (name, forgejo_repo) VALUES ($1, $2) RETURNING id", [repo.name, repo.full_name]);
    await client.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')", [result.rows[0].id, user.id]);
    await client.query("INSERT INTO chat_channels (project_id, name) VALUES ($1, 'general')", [result.rows[0].id]);
    await client.query("COMMIT");
    return Response.json({ ok: true, projectId: result.rows[0].id }, { status: 201 });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Link created repository failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: `The repository ${repo.full_name} was created, but could not be linked. Link it from the projects page.` }, { status: 502 });
  } finally { client?.release(); }
}
