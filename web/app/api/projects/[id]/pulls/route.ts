import { getCurrentUser } from "@/lib/session";
import { ForgejoConnectionError } from "@/lib/forgejo-auth";
import { forgejoPostAs, ForgejoRequestError } from "@/lib/forgejo";
import { pool } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) return Response.json({ error: "Project not found" }, { status: 404 });
  const project = await pool.query<{ forgejo_repo: string }>("SELECT p.forgejo_repo FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE p.id = $1 AND pm.user_id = $2", [id, user.id]);
  if (!project.rows[0]) return Response.json({ error: "Project not found" }, { status: 404 });
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const head = typeof data.head === "string" ? data.head.trim() : "";
  const base = typeof data.base === "string" ? data.base.trim() : "";
  const body = typeof data.body === "string" ? data.body : "";
  const validBranch = (value: string) => value.length > 0 && value.length <= 255 && !/[\x00-\x20\x7f]/.test(value);
  if (!title || title.length > 255 || !validBranch(head) || !validBranch(base) || head === base || body.length > 20000) return Response.json({ error: "Enter a title and two different valid branches." }, { status: 400 });
  const limited = await rateLimit("create-pull-request", String(user.id), 10, 60);
  if (limited) return limited;
  try {
    const repo = project.rows[0].forgejo_repo.split("/").map(encodeURIComponent).join("/");
    const pull = await forgejoPostAs<{ number: number }>(String(user.id), `/repos/${repo}/pulls`, { title, head, base, body });
    return Response.json({ ok: true, number: pull.number }, { status: 201 });
  } catch (error) {
    if (error instanceof ForgejoConnectionError) return Response.json({ error: error.message }, { status: 403 });
    if (error instanceof ForgejoRequestError && (error.status === 401 || error.status === 403)) return Response.json({ error: "Your Forgejo account cannot perform this action." }, { status: 403 });
    if (error instanceof ForgejoRequestError && (error.status === 409 || error.status === 422)) return Response.json({ error: "Forgejo could not create this pull request. Check the branches and whether a pull request already exists." }, { status: 422 });
    console.error("Create pull request failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Could not create the pull request. Check your Forgejo access and try again." }, { status: 502 });
  }
}
