import { NextResponse, after } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool } from "@/lib/db";
import { forgejoFetchAs } from "@/lib/forgejo";
import { startReview, runReview } from "@/lib/run-review";

type Ctx = { params: Promise<{ id: string; n: string }> };

// Returns the project only if this user is a member. Otherwise null (-> 404).
async function loadProject(idStr: string, userId: number) {
  const projectId = Number(idStr);
  if (!Number.isInteger(projectId)) return null;
  const r = await pool.query(
    `SELECT p.id, p.forgejo_repo
     FROM projects p
     JOIN project_members m ON m.project_id = p.id
     WHERE p.id = $1 AND m.user_id = $2`,
    [projectId, userId],
  );
  const project = (r.rows[0] as { id: number; forgejo_repo: string } | undefined) ?? null;
  if (!project) return null;
  try { await forgejoFetchAs(userId, `/repos/${project.forgejo_repo}`); } catch { return null; }
  return project;
}

function parsePrNumber(nStr: string): number | null {
  const n = Number(nStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { ok: false, error: "Not logged in" },
      { status: 401 },
    );

  const { id, n } = await params;
  const project = await loadProject(id, user.id);
  if (!project)
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 },
    );

  const prNumber = parsePrNumber(n);
  if (prNumber === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid pull request number" },
      { status: 400 },
    );
  }

  let start;
  try {
    start = await startReview(
      project.id,
      project.forgejo_repo,
      prNumber,
      user.id,
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Pull request not found" },
      { status: 404 },
    );
  }

  if (!start.started) {
    // This commit already has a review that is pending or done.
    return NextResponse.json({
      ok: true,
      started: false,
      reviewId: start.reviewId,
      status: start.status,
    });
  }

  // Respond now; the slow part continues after the response is sent.
  after(() => runReview(start.reviewId, start.token, project.forgejo_repo, start.pr, user.id));
  return NextResponse.json(
    { ok: true, started: true, reviewId: start.reviewId, status: "pending" },
    { status: 202 },
  );
}

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { ok: false, error: "Not logged in" },
      { status: 401 },
    );

  const { id, n } = await params;
  const project = await loadProject(id, user.id);
  if (!project)
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 },
    );

  const prNumber = parsePrNumber(n);
  if (prNumber === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid pull request number" },
      { status: 400 },
    );
  }

  const review = await pool.query(
    `SELECT id, head_sha, status, summary, error, model, input_tokens, output_tokens, created_at
     FROM pr_reviews
     WHERE project_id = $1 AND pr_number = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [project.id, prNumber],
  );
  if (review.rows.length === 0) {
    return NextResponse.json({ ok: true, review: null, comments: [] });
  }

  const comments = await pool.query(
    `SELECT path, line, severity, body, posted
     FROM review_comments
     WHERE review_id = $1
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, path, line`,
    [review.rows[0].id],
  );
  return NextResponse.json({
    ok: true,
    review: review.rows[0],
    comments: comments.rows,
  });
}
