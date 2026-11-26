import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  canProvisionForgejoAccount,
  createForgejoUser,
  isValidForgejoUsername,
} from "@/lib/forgejo-onboarding";
import { MAX_PASSWORD_BYTES } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Not logged in", 401);

  const linked = await pool.query("SELECT 1 FROM forgejo_identities WHERE user_id = $1", [user.id]);
  if (linked.rowCount) {
    return fail("Your account is already connected to Forgejo.", 409);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Request body must be valid JSON", 400);
  }

  const { username, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string") {
    return fail("username and password are required", 400);
  }

  const normalizedUsername = username.trim();
  if (!isValidForgejoUsername(normalizedUsername)) {
    return fail(
      "Username must be 1 to 40 letters, numbers, dots, underscores, or hyphens, starting and ending with a letter or number.",
      400,
    );
  }
  if (password.length < 8) {
    return fail("Password must be at least 8 characters", 400);
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return fail(`Password must be at most ${MAX_PASSWORD_BYTES} UTF-8 bytes`, 400);
  }

  const limited = await rateLimit("forgejo-register", String(user.id), 10, 60);
  if (limited) return limited;

  if (!canProvisionForgejoAccount()) {
    return fail("Forgejo account creation is not configured. Create an account in Forgejo instead.", 503);
  }

  const created = await createForgejoUser({
    username: normalizedUsername,
    email: String(user.email),
    password,
    fullName: String(user.display_name),
  });

  if (!created.ok) {
    return fail(created.error, created.status, created.exists ? { exists: true } : {});
  }

  return NextResponse.json({ ok: true, username: created.username }, { status: 201 });
}
