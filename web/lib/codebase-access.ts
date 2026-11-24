import { pool } from "./db";
import { getCurrentUser } from "./session";
import { IndexError } from "./codebase-index";

type Project = { id: string; name: string; forgejo_repo: string; role: "owner" | "member" };

export async function getCodebaseProject(id: string) {
  const user = await getCurrentUser();
  if (!user) return { user: null, project: null };
  if (!/^\d{1,15}$/.test(id)) return { user, project: null };
  const result = await pool.query<Project>(
    `SELECT p.id, p.name, p.forgejo_repo, pm.role
       FROM projects p JOIN project_members pm ON p.id = pm.project_id
      WHERE p.id = $1 AND pm.user_id = $2`,
    [id, user.id],
  );
  return { user, project: result.rows[0] ?? null };
}

export function codebaseError(message: string, status: number) {
  return Response.json({ ok: false, error: message }, { status });
}

export function handleCodebaseError(error: unknown) {
  if (error instanceof IndexError) return codebaseError(error.message, error.status);
  console.error("Codebase Q&A failed:", error instanceof Error ? error.name : "Unknown error");
  return codebaseError("Codebase Q&A is temporarily unavailable.", 502);
}
