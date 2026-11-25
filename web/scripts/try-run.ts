import { pool } from "../lib/db";
import { startReview, runReview } from "../lib/run-review";

const [repo, n] = process.argv.slice(2);
if (!repo || !n) {
  console.error(
    "Usage: bun --env-file=.env.local scripts/try-run.ts owner/name PR_NUMBER",
  );
  process.exit(1);
}

const proj = await pool.query(
  "SELECT p.id, m.user_id FROM projects p JOIN project_members m ON m.project_id = p.id AND m.role = 'owner' JOIN forgejo_identities fi ON fi.user_id = m.user_id WHERE p.forgejo_repo = $1 ORDER BY m.user_id LIMIT 1",
  [repo],
);
if (!proj.rows[0]) {
  console.error(
    "That repo isn't linked as a project yet. Link it on /projects first.",
  );
  process.exit(1);
}

const userId: string = proj.rows[0].user_id;
const start = await startReview(proj.rows[0].id, repo, Number(n), userId);
if (start.started) {
  console.log(`Started review #${start.reviewId}...`);
  await runReview(start.reviewId, start.token, repo, start.pr, userId);} else {
  console.log(
    `Skipped: review #${start.reviewId} for this commit is already ${start.status}.`,
  );
}

const review = await pool.query(
  "SELECT id, status, model, input_tokens, output_tokens, error FROM pr_reviews WHERE id = $1",
  [start.reviewId],
);
console.table(review.rows);
const comments = await pool.query(
  "SELECT path, line, severity, posted FROM review_comments WHERE review_id = $1",
  [start.reviewId],
);
console.table(comments.rows);
await pool.end();
