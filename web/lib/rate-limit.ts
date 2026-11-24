import { createHash } from "node:crypto";
import { pool } from "./db";

export async function rateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  const subjectHash = createHash("sha256").update(subject).digest("hex");

  // Clean up inactive buckets periodically without waiting on other requests.
  if (Math.random() < 0.01) {
    await pool.query(`
      DELETE FROM rate_limits
      WHERE (scope, subject) IN (
        SELECT scope, subject FROM rate_limits
        WHERE expires_at <= now()
        ORDER BY expires_at
        LIMIT 200
        FOR UPDATE SKIP LOCKED
      )
    `);
  }

  const { rows: [bucket] } = await pool.query<{ attempts: number; retry_after: number }>(
    `INSERT INTO rate_limits (scope, subject, attempts, expires_at)
     VALUES ($1, $2, 1, now() + $4::integer * interval '1 second')
     ON CONFLICT (scope, subject) DO UPDATE SET
       attempts = CASE WHEN rate_limits.expires_at <= now() THEN 1
                       ELSE LEAST(rate_limits.attempts + 1, $3::integer + 1) END,
       expires_at = CASE WHEN rate_limits.expires_at <= now() THEN excluded.expires_at
                         ELSE rate_limits.expires_at END
     RETURNING attempts, GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - now())))::integer AS retry_after`,
    [scope, subjectHash, limit, windowSeconds],
  );

  if (bucket.attempts <= limit) return null;
  return Response.json(
    { ok: false, error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(bucket.retry_after) } },
  );
}
