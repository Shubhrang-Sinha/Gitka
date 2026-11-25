import { pool } from "../lib/db";
import { getPull } from "../lib/forgejo-pulls";
import { startReview, runReview } from "../lib/run-review";

const [repo, n] = process.argv.slice(2);
if (!repo || !n) {
  console.error("Usage: bun --env-file=.env.local scripts/test-stale-takeover.ts owner/name PR_NUMBER");
  process.exit(1);
}
const proj = await pool.query("SELECT id FROM projects WHERE forgejo_repo = $1", [repo]);
const projectId: number = proj.rows[0].id;
const pr = await getPull(repo, Number(n));

// Clean slate for this commit.
await pool.query(
  "DELETE FROM pr_reviews WHERE project_id = $1 AND pr_number = $2 AND head_sha = $3",
  [projectId, Number(n), pr.head.sha]
);

const a = await startReview(projectId, repo, Number(n), null);
if (!a.started) throw new Error("expected worker A to start");
console.log("A started, token", a.token.slice(0, 8));

// Pretend A has been stuck for 11 minutes.
await pool.query("UPDATE pr_reviews SET created_at = now() - interval '11 minutes' WHERE id = $1", [a.reviewId]);

const b = await startReview(projectId, repo, Number(n), null);
if (!b.started) throw new Error("expected worker B to take over");
console.log("B took over, token", b.token.slice(0, 8), "| same review id:", a.reviewId === b.reviewId);

// A wakes up late. It must do nothing.
await runReview(a.reviewId, a.token, repo, a.pr);
const afterA = await pool.query(
  `SELECT status, (SELECT count(*) FROM review_comments WHERE review_id = $1) AS comments
   FROM pr_reviews WHERE id = $1`,
  [a.reviewId]
);
console.log("After stale worker A ran (expect pending, 0 comments):", afterA.rows[0]);

// B finishes normally.
await runReview(b.reviewId, b.token, repo, b.pr);
const afterB = await pool.query(
  `SELECT status, (SELECT count(*) FROM review_comments WHERE review_id = $1) AS comments
   FROM pr_reviews WHERE id = $1`,
  [b.reviewId]
);
console.log("After B ran (expect done, comments > 0):", afterB.rows[0]);
await pool.end();