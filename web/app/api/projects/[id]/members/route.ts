import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(
  request: Request,
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

  const membership = await pool.query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [id, user.id]
  );
  if (membership.rows.length === 0) {
    return fail("Project not found", 404);
  }
  if (membership.rows[0].role !== "owner") {
    return fail("Only project owners can add members", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Request body must be valid JSON", 400);
  }

  const { email } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string") {
    return fail("email is required", 400);
  }

  const found = await pool.query(
    "SELECT id, email, display_name FROM users WHERE email = $1",
    [email.trim().toLowerCase()]
  );
  const newMember = found.rows[0];
  if (!newMember) {
    return fail("No user with that email has registered", 404);
  }

  const inserted = await pool.query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [id, newMember.id]
  );
  if (inserted.rowCount === 0) {
    return fail("That user is already a member of this project", 409);
  }

  return NextResponse.json({ ok: true, member: newMember }, { status: 201 });
}