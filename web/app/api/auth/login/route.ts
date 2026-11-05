import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Request body must be valid JSON", 400);
  }

  const { email, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string") {
    return fail("email and password are required", 400);
  }

  const result = await pool.query(
    "SELECT id, email, display_name, password_hash FROM users WHERE email = $1",
    [email.trim().toLowerCase()]
  );
  const user = result.rows[0];

  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !valid) {
    return fail("Invalid email or password", 401);
  }

  await createSession(user.id);
  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, display_name: user.display_name },
  });
}