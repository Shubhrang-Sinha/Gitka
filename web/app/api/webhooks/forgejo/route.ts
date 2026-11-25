import { NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/db";
import { startReview, runReview } from "@/lib/run-review";

// Forgejo reports new commits on a PR as "synchronized" (GitHub says "synchronize").
const REVIEW_ACTIONS = new Set(["opened", "reopened", "synchronized", "synchronize"]);

type PullRequestEvent = {
  action?: unknown;
  number?: unknown;
  pull_request?: { number?: unknown };
  repository?: { full_name?: unknown };
};

function validSignature(secret: string, body: string, signature: string | null): boolean {
  if (!signature) return false;
  const given = signature.trim().replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.FORGEJO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("FORGEJO_WEBHOOK_SECRET is not set; refusing webhook");
    return NextResponse.json({ ok: false, error: "Webhook not configured" }, { status: 503 });
  }

  // The signature covers the exact raw bytes, so read the body as text first.
  const body = await req.text();
  const signature =
    req.headers.get("x-forgejo-signature") ?? req.headers.get("x-gitea-signature");
  if (!validSignature(secret, body, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-forgejo-event") ?? req.headers.get("x-gitea-event") ?? "";
  if (!event.startsWith("pull_request")) {
    return NextResponse.json({ ok: true, ignored: "event" });
  }

  let payload: PullRequestEvent;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof payload.action !== "string" || !REVIEW_ACTIONS.has(payload.action)) {
    return NextResponse.json({ ok: true, ignored: "action" });
  }

  const repo = payload.repository?.full_name;
  const prNumber = payload.number ?? payload.pull_request?.number;
  if (typeof repo !== "string" || typeof prNumber !== "number" || !Number.isInteger(prNumber)) {
    return NextResponse.json({ ok: false, error: "Unexpected payload" }, { status: 400 });
  }

  const found = await pool.query(`SELECT p.id, m.user_id FROM projects p JOIN project_members m ON m.project_id = p.id AND m.role = 'owner' JOIN forgejo_identities fi ON fi.user_id = m.user_id WHERE p.forgejo_repo = $1 ORDER BY m.user_id LIMIT 1`, [repo]);
  if (found.rows.length === 0) {
    return NextResponse.json({ ok: true, ignored: "repository is not linked to a project" });
  }
  const projectId: number = found.rows[0].id;
  const userId: number = found.rows[0].user_id;

  let start;
  try {
    // Re-fetches the PR from Forgejo, so the head commit never comes from the payload.
    start = await startReview(projectId, repo, prNumber, userId);
  } catch (error) {
    console.error("Webhook could not start review:", error);
    return NextResponse.json({ ok: false, error: "Could not start review" }, { status: 502 });
  }

  if (!start.started) {
    return NextResponse.json({ ok: true, started: false, status: start.status });
  }

  after(() => runReview(start.reviewId, start.token, repo, start.pr, userId));
  return NextResponse.json({ ok: true, started: true, reviewId: start.reviewId }, { status: 202 });
}