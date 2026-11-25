import { pool } from "../lib/db";
import { forgejoFetchAs } from "../lib/forgejo";
import type { PullRequest } from "../lib/forgejo-pulls";
import { startReview, runReview } from "../lib/run-review";

const [repo, n] = process.argv.slice(2);
if (!repo || !n) {
  console.error("Usage: bun --env-file=.env.local scripts/test-stale-takeover.ts owner/name PR_NUMBER");
  process.exit(1);
}
const proj = await pool.query("SELECT p.id, m.user_id FROM projects p JOIN project_members m ON m.project_id = p.id AND m.role = 'owner' JOIN forgejo_identities fi ON fi.user_id = m.user_id WHERE p.forgejo_repo = $1 ORDER BY m.user_id LIMIT 1", [repo]);
const projectId: number = proj.rows[0].id;
const userId: string = proj.rows[0].user_id;
const pr = await forgejoFetchAs<PullRequest>(userId, `/repos/${repo}/pulls/${Number(n)}`);

// Clean slate for this commit.
await pool.query(
  "DELETE FROM pr_reviews WHERE project_id = $1 AND pr_number = $2 AND head_sha = $3",
  [projectId, Number(n), pr.head.sha]
);

const a = await startReview(projectId, repo, Number(n), userId);
if (!a.started) throw new Error("expected worker A to start");
console.log("A started, token", a.token.slice(0, 8));

// Pretend A has been stuck for 11 minutes.
await pool.query("UPDATE pr_reviews SET created_at = now() - interval '11 minutes' WHERE id = $1", [a.reviewId]);

const b = await startReview(projectId, repo, Number(n), userId);
if (!b.started) throw new Error("expected worker B to take over");
console.log("B took over, token", b.token.slice(0, 8), "| same review id:", a.reviewId === b.reviewId);

// A wakes up late. It must do nothing.
await runReview(a.reviewId, a.token, repo, a.pr, userId);
const afterA = await pool.query(
  `SELECT status, (SELECT count(*) FROM review_comments WHERE review_id = $1) AS comments
   FROM pr_reviews WHERE id = $1`,
  [a.reviewId]
);
console.log("After stale worker A ran (expect pending, 0 comments):", afterA.rows[0]);

// B finishes normally.
await runReview(b.reviewId, b.token, repo, b.pr, userId);
const afterB = await pool.query(
  `SELECT status, (SELECT count(*) FROM review_comments WHERE review_id = $1) AS comments
   FROM pr_reviews WHERE id = $1`,
  [b.reviewId]
);
console.log("After B ran (expect done, comments > 0):", afterB.rows[0]);
await pool.end();