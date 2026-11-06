import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { forgejoFetch } from "@/lib/forgejo";
import { getCurrentUser } from "@/lib/session";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return fail("Not logged in", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Request body must be valid JSON", 400);
  }

  const { name, forgejoRepo } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || typeof forgejoRepo !== "string") {
    return fail("name and forgejoRepo are required", 400);
  }

  const projectName = name.trim();
  const repo = forgejoRepo.trim();

  if (projectName.length < 1 || projectName.length > 80) {
    return fail("Project name must be 1 to 80 characters", 400);
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return fail("Repository must look like owner/name", 400);
  }

  try {
    await forgejoFetch(`/repos/${repo}`);
  } catch {
    return fail("That repository was not found in Forgejo", 404);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const project = await client.query(
      `INSERT INTO projects (name, forgejo_repo)
       VALUES ($1, $2)
       RETURNING id, name, forgejo_repo`,
      [projectName, repo]
    );
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [project.rows[0].id, user.id]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, project: project.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      return fail("That repository is already linked to a project", 409);
    }
    console.error("Create project failed:", error);
    return fail("Something went wrong", 500);
  } finally {
    client.release();
  }
}