import { pool } from "./db";
import { forgejoFetchAs } from "./forgejo";
import { getPullDiff, postReview, type PullRequest } from "./forgejo-pulls";
import { parseDiff } from "./diff";
import { reviewDiff } from "./review";

export type StartResult =
  | { started: true; reviewId: number; token: string; pr: PullRequest }
  | { started: false; reviewId: number; pr: PullRequest; status: string };

// Thrown inside runReview when another attempt has taken over this review.
class StaleAttemptError extends Error {}

export async function startReview(
  projectId: number,
  repo: string,
  prNumber: number,
  userId: number | string
): Promise<StartResult> {
  if (userId == null) throw new Error("Review requires a connected user");
  const pr = await forgejoFetchAs<PullRequest>(userId, `/repos/${repo}/pulls/${prNumber}`); // throws early if the PR doesn't exist

  // Insert, or take over a failed/stale row. A take-over issues a NEW token, which
  // invalidates any worker still running under the old one. A pending review whose
  // publish step started recently is never taken over.
  const inserted = await pool.query(
    `INSERT INTO pr_reviews (project_id, pr_number, head_sha, status, created_by)
     VALUES ($1, $2, $3, 'pending', $4)
     ON CONFLICT (project_id, pr_number, head_sha) DO UPDATE
       SET status = 'pending', error = NULL, summary = NULL,
           created_at = now(), created_by = EXCLUDED.created_by,
           attempt_token = gen_random_uuid(), publish_started_at = NULL
       WHERE pr_reviews.status = 'failed'
          OR (pr_reviews.status = 'pending'
              AND pr_reviews.created_at < now() - interval '10 minutes'
              AND (pr_reviews.publish_started_at IS NULL
                   OR pr_reviews.publish_started_at < now() - interval '10 minutes'))
     RETURNING id, attempt_token`,
    [projectId, prNumber, pr.head.sha, userId]
  );

  if (inserted.rows.length > 0) {
    return {
      started: true,
      reviewId: inserted.rows[0].id,
      token: inserted.rows[0].attempt_token,
      pr,
    };
  }

  const existing = await pool.query(
    `SELECT id, status FROM pr_reviews
     WHERE project_id = $1 AND pr_number = $2 AND head_sha = $3`,
    [projectId, prNumber, pr.head.sha]
  );
  return {
    started: false,
    reviewId: existing.rows[0].id,
    status: existing.rows[0].status,
    pr,
  };
}

export async function runReview(
  reviewId: number,
  token: string,
  repo: string,
  pr: PullRequest,
  userId?: number | string
) {
  try {
    if (userId == null) throw new Error("Review requires a connected user");
    const authorize = async () => {
      const access = await pool.query(
        `SELECT 1 FROM pr_reviews r JOIN projects p ON p.id = r.project_id
          JOIN project_members m ON m.project_id = p.id AND m.user_id = $3
         WHERE r.id = $1 AND r.attempt_token = $2 AND r.status = 'pending'
           AND r.created_by = $3 AND p.forgejo_repo = $4`,
        [reviewId, token, userId, repo],
      );
      if (!access.rowCount) throw new Error("The review initiator no longer has project access.");
      await forgejoFetchAs(userId, `/repos/${repo}`);
    };
    await authorize();
    // Cheap early exit: if we've already been replaced, don't spend a model call.
    const stillOurs = await pool.query(
      "SELECT 1 FROM pr_reviews WHERE id = $1 AND attempt_token = $2 AND status = 'pending'",
      [reviewId, token]
    );
    if (stillOurs.rows.length === 0) return;

    const files = parseDiff(await getPullDiff(repo, pr.number, userId));
    const result = await reviewDiff(pr.title, pr.body ?? "", files);

    // 1. Save results. The first statement checks ownership and locks the row until
    //    COMMIT, so a take-over can't slip in halfway through.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query(
        `UPDATE pr_reviews
         SET summary = $3, model = $4, input_tokens = $5, output_tokens = $6
         WHERE id = $1 AND attempt_token = $2 AND status = 'pending'
         RETURNING id`,
        [reviewId, token, result.summary, result.model, result.inputTokens, result.outputTokens]
      );
      if (owned.rows.length === 0) throw new StaleAttemptError();

      await client.query("DELETE FROM review_comments WHERE review_id = $1", [reviewId]);
      for (const f of result.findings) {
        await client.query(
          `INSERT INTO review_comments (review_id, path, line, severity, body)
           VALUES ($1, $2, $3, $4, $5)`,
          [reviewId, f.path, f.line, f.severity, f.body]
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    // 2. Claim the right to publish. Only one attempt can win this.
    const claim = await pool.query(
      `UPDATE pr_reviews SET publish_started_at = now()
       WHERE id = $1 AND attempt_token = $2 AND status = 'pending'
       RETURNING id`,
      [reviewId, token]
    );
    if (claim.rows.length === 0) return; // replaced in the meantime

    await authorize();
    await postReview(repo, pr.number, pr.head.sha, result.summary, result.findings, userId);

    // 3. Finish: mark done and mark the comments posted, in one atomic statement.
    await pool.query(
      `WITH d AS (
         UPDATE pr_reviews SET status = 'done'
         WHERE id = $1 AND attempt_token = $2 AND status = 'pending'
         RETURNING id
       )
       UPDATE review_comments SET posted = true
       WHERE review_id IN (SELECT id FROM d)`,
      [reviewId, token]
    );
  } catch (e) {
    if (e instanceof StaleAttemptError) return; // someone else owns this review now

    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    try {
      // Only record the failure if this attempt still owns the review.
      await pool.query(
        `UPDATE pr_reviews SET status = 'failed', error = $3
         WHERE id = $1 AND attempt_token = $2 AND status = 'pending'`,
        [reviewId, token, message]
      );
    } catch (dbError) {
      console.error("Could not record review failure", dbError);
    }
  }
}