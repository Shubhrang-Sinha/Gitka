import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { hashPassword, MAX_PASSWORD_BYTES } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
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

  const { email, password, displayName } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof displayName !== "string"
  ) {
    return fail("email, password and displayName are required", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const name = displayName.trim();

  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return fail("Please enter a valid email address", 400);
  }
  if (name.length < 1 || name.length > 50) {
    return fail("Display name must be 1 to 50 characters", 400);
  }
  if (password.length < 8) {
    return fail("Password must be at least 8 characters", 400);
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return fail(`Password must be at most ${MAX_PASSWORD_BYTES} UTF-8 bytes`, 400);
  }

  const limited = await rateLimit("register-total", "", 30, 60);
  if (limited) return limited;
  const passwordHash = await hashPassword(password);

  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name`,
      [normalizedEmail, passwordHash, name],
    );
    await createSession(result.rows[0].id);
    return NextResponse.json(
      { ok: true, user: result.rows[0], connected: false },
      { status: 201 },
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return fail("An account with that email already exists", 409);
    }
    console.error("Register failed:", error);
    return fail("Something went wrong", 500);
  }
}
