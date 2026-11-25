import { pool } from "@/lib/db";
import { ForgejoConfigurationError, ForgejoRequestError } from "@/lib/forgejo";
import { listPullComments, postPullComment } from "@/lib/forgejo-pulls";
import { ForgejoConnectionError } from "@/lib/forgejo-auth";
import { getCurrentUser } from "@/lib/session";

type Context = { params: Promise<{ id: string; n: string }> };

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

async function authorize({ params }: Context) {
  const user = await getCurrentUser();
  if (!user) return { error: fail("Not logged in", 401) };

  const { id, n } = await params;
  if (!/^\d{1,15}$/.test(id)) return { error: fail("Project not found", 404) };
  const { rows } = await pool.query<{ forgejo_repo: string }>(
    `SELECT p.forgejo_repo
       FROM projects p JOIN project_members m ON p.id = m.project_id
      WHERE p.id = $1 AND m.user_id = $2`,
    [id, user.id],
  );
  if (!rows[0]) return { error: fail("Project not found", 404) };

  const number = Number(n);
  if (!/^\d+$/.test(n) || !Number.isSafeInteger(number) || number < 1) {
    return { error: fail("Invalid pull request number.", 400) };
  }
  return { repo: rows[0].forgejo_repo, number, userId: user.id };
}

function forgejoFailure(error: unknown, posting = false) {
  if (error instanceof ForgejoConnectionError) return fail(error.message, 401);
  if (error instanceof ForgejoConfigurationError) {
    return fail("Forgejo discussion is unavailable. Ask the project administrator to check the Forgejo connection.", 503);
  }
  if (error instanceof ForgejoRequestError) {
    if (error.status === 404) return fail("Pull request not found.", 404);
    if (error.status === 403) return fail("You do not have permission to access or comment on this pull request.", 403);
    if (posting && error.status === 423) {
      return fail("This pull request discussion is locked in Forgejo.", 423);
    }
  }

  if (error instanceof Error && error.name === "TimeoutError") {
    const message = posting
      ? "Forgejo timed out. Refresh the discussion to see whether your comment was posted before trying again."
      : "Forgejo timed out. Refresh the discussion to try again.";
    return fail(message, 504);
  }

  const message = posting
    ? "Forgejo could not confirm your comment. Refresh the discussion before trying again."
    : "Could not load the Forgejo discussion. Refresh to try again.";
  return fail(message, 502);
}

export async function GET(_request: Request, context: Context) {
  const auth = await authorize(context);
  if (auth.error) return auth.error;

  try {
    const comments = await listPullComments(auth.repo, auth.number, auth.userId);
    return Response.json({ ok: true, comments }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return forgejoFailure(error);
  }
}

export async function POST(request: Request, context: Context) {
  const auth = await authorize(context);
  if (auth.error) return auth.error;

  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return fail("Send the comment as JSON.", 415);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return fail("Invalid JSON.", 400);
  }
  const raw = input && typeof input === "object" && "body" in input ? input.body : null;
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body || body.length > 4000 || body.includes("\0")) {
    return fail("Enter a comment between 1 and 4000 characters.", 400);
  }

  try {
    const comment = await postPullComment(auth.repo, auth.number, body, auth.userId);
    return Response.json({ ok: true, comment }, { status: 201 });
  } catch (error) {
    return forgejoFailure(error, true);
  }
}
