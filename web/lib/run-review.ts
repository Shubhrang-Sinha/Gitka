import { pool } from "./db";
import { getPull, getPullDiff, postReview, type PullRequest } from "./forgejo-pulls";
import { parseDiff } from "./diff";
import { reviewDiff } from "./review";

export type StartResult =
  | { started: true; reviewId: number; pr: PullRequest }
  | { started: false; reviewId: number; pr: PullRequest; status: string };

export async function startReview(
  projectId: number,
  repo: string,
  prNumber: number,
  userId: number | null
): Promise<StartResult> {
  const pr = await getPull(repo, prNumber); // throws early if the PR doesn't exist

  // Insert, or take over a failed/stale row. If neither applies, no row comes back.
  const inserted = await pool.query(
    `INSERT INTO pr_reviews (project_id, pr_number, head_sha, status, created_by)
     VALUES ($1, $2, $3, 'pending', $4)
     ON CONFLICT (project_id, pr_number, head_sha) DO UPDATE
       SET status = 'pending', error = NULL, summary = NULL,
           created_at = now(), created_by = EXCLUDED.created_by
       WHERE pr_reviews.status = 'failed'
          OR (pr_reviews.status = 'pending'
              AND pr_reviews.created_at < now() - interval '10 minutes')
     RETURNING id`,
    [projectId, prNumber, pr.head.sha, userId]
  );

  if (inserted.rows.length > 0) {
    const reviewId: number = inserted.rows[0].id;
    await pool.query("DELETE FROM review_comments WHERE review_id = $1", [reviewId]);
    return { started: true, reviewId, pr };
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

export async function runReview(reviewId: number, repo: string, pr: PullRequest) {
  try {
    const files = parseDiff(await getPullDiff(repo, pr.number));
    const result = await reviewDiff(pr.title, pr.body ?? "", files);

    // Save the results first, all in one transaction.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE pr_reviews
         SET summary = $2, model = $3, input_tokens = $4, output_tokens = $5
         WHERE id = $1`,
        [reviewId, result.summary, result.model, result.inputTokens, result.outputTokens]
      );
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

    // Then post to Forgejo.
    await postReview(repo, pr.number, pr.head.sha, result.summary, result.findings);

    await pool.query("UPDATE review_comments SET posted = true WHERE review_id = $1", [reviewId]);
    await pool.query("UPDATE pr_reviews SET status = 'done' WHERE id = $1", [reviewId]);
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await pool.query("UPDATE pr_reviews SET status = 'failed', error = $2 WHERE id = $1", [
      reviewId,
      message,
    ]);
  }
}