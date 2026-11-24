import { pool } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";

async function authorize(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: fail("Not logged in", 401) };
  if (!/^\d{1,15}$/.test(id)) return { error: fail("Project not found", 404) };
  const membership = await pool.query(
    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
    [id, user.id],
  );
  if (!membership.rowCount) return { error: fail("Project not found", 404) };
  return { user };
}

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;
  const result = await pool.query(
    `SELECT m.id, m.body, m.created_at, u.display_name
       FROM chat_messages m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = $1 ORDER BY m.id DESC LIMIT 100`,
    [id],
  );
  return Response.json({ ok: true, messages: result.rows.reverse() });
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return fail("Invalid JSON", 400);
  }
  const raw = input && typeof input === "object" && "body" in input ? input.body : null;
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body || body.length > 4000 || body.includes("\0")) {
    return fail("Message must be valid text between 1 and 4000 characters", 400);
  }
  const limited = await rateLimit("chat", String(auth.user.id), 30, 60);
  if (limited) return limited;
  await pool.query(
    "INSERT INTO chat_messages (project_id, user_id, body) VALUES ($1, $2, $3)",
    [id, auth.user.id, body],
  );
  return Response.json({ ok: true }, { status: 201 });
}
