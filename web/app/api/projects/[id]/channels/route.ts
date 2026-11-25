import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCodebaseProject } from "@/lib/codebase-access";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return fail("Not logged in", 401);
  }

  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) {
    return fail("Project not found", 404);
  }
  try {
    const access = await getCodebaseProject(id);
    if (!access.project) return fail("Project not found", 404);
  } catch {
    return fail("Could not verify repository access with Forgejo.", 503);
  }

  try {
    const membership = await pool.query(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
      [id, user.id]
    );
    if (membership.rows.length === 0) {
      return fail("Project not found", 404);
    }

    const channels = await pool.query(
      `SELECT id, project_id, name, created_at
         FROM chat_channels
        WHERE project_id = $1
        ORDER BY created_at ASC, id ASC`,
      [id]
    );

    return NextResponse.json({ ok: true, channels: channels.rows });
  } catch (error) {
    console.error("Failed to list channels:", error);
    return fail("Something went wrong", 500);
  }
}
