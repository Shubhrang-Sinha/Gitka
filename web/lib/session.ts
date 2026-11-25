import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";

export const SESSION_COOKIE = "session_id";
const SESSION_DAYS = 7;

export async function createSession(userId: number | string): Promise<void> {
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)",
    [sessionId, userId, expiresAt],
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const result = await pool.query(
    `SELECT u.id, u.email, u.display_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId],
  );
  return result.rows[0] ?? null;
}

/** Unconnected users can only reach the connection flow. */
export async function getCurrentUser() {
  const user = await getSessionUser();
  if (!user) return null;
  const result = await pool.query("SELECT 1 FROM forgejo_identities WHERE user_id = $1", [user.id]);
  return result.rowCount ? user : null;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
  }
  cookieStore.delete(SESSION_COOKIE);
}
