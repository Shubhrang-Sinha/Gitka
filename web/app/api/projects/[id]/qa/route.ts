import { codebaseError, getCodebaseProject, handleCodebaseError } from "@/lib/codebase-access";
import { getIndex } from "@/lib/codebase-index";
import { askCodebase } from "@/lib/codebase-qa";
import { ensureIndexJob, getJob } from "@/lib/qa-jobs";
import { pool } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) return codebaseError("Not logged in", 401);
  if (!project) return codebaseError("Project not found", 404);
  const conversationId = new URL(request.url).searchParams.get("conversation");
  if (conversationId && !/^\d{1,15}$/.test(conversationId)) return codebaseError("Invalid conversation", 400);
  const conversations = await pool.query(`SELECT id, title, updated_at FROM qa_conversations WHERE project_id = $1 AND user_id = $2 ORDER BY updated_at DESC, id DESC LIMIT 100`, [id, user.id]);
  let messages: unknown[] = [];
  if (conversationId) {
    if (!conversations.rows.some((row) => String(row.id) === conversationId)) {
      const exists = await pool.query(`SELECT 1 FROM qa_conversations WHERE id = $1 AND project_id = $2 AND user_id = $3`, [conversationId, id, user.id]);
      if (!exists.rowCount) return codebaseError("Conversation not found", 404);
    }
    messages = (await pool.query(`SELECT id, role, content, commit_sha, sources, created_at FROM qa_messages WHERE conversation_id = $1 ORDER BY id`, [conversationId])).rows;
  }
  let index, job, current: boolean | null = null, indexError: string | null = null;
  try { ({ index, job, current } = await ensureIndexJob(id, project.forgejo_repo, String(user.id))); }
  catch { index = await getIndex(id); job = await getJob(id); indexError = "Could not check the repository. Showing the last available index."; }
  return Response.json({ ok: true, index, job, current, indexError, conversations: conversations.rows, messages });
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) return codebaseError("Not logged in", 401);
  if (!project) return codebaseError("Project not found", 404);
  let input: { question?: unknown; conversationId?: unknown };
  try { input = await request.json(); } catch { return codebaseError("Invalid JSON", 400); }
  if (!input || typeof input.question !== "string" || !input.question.trim() || input.question.length > 1000) return codebaseError("Enter a question between 1 and 1000 characters.", 400);
  if (input.conversationId != null && (typeof input.conversationId !== "string" || !/^\d{1,15}$/.test(input.conversationId))) return codebaseError("Invalid conversation", 400);
  const limited = await rateLimit("codebase-question", String(user.id), 10, 60);
  if (limited) return limited;
  const question = input.question.trim();
  let conversationId = input.conversationId as string | undefined;
  try {
    if (!conversationId) {
      const created = await pool.query(`INSERT INTO qa_conversations (project_id, user_id, title) VALUES ($1, $2, $3) RETURNING id`, [id, user.id, question.slice(0, 80)]);
      conversationId = created.rows[0].id;
    }
    const claimed = await pool.query(`UPDATE qa_conversations SET active_token = gen_random_uuid(), active_until = now() + interval '2 minutes' WHERE id = $1 AND project_id = $2 AND user_id = $3 AND (active_until IS NULL OR active_until < now()) RETURNING active_token`, [conversationId, id, user.id]);
    if (!claimed.rowCount) {
      const exists = await pool.query(`SELECT 1 FROM qa_conversations WHERE id = $1 AND project_id = $2 AND user_id = $3`, [conversationId, id, user.id]);
      return exists.rowCount ? codebaseError("A response is already in progress.", 409) : codebaseError("Conversation not found", 404);
    }
    const token = claimed.rows[0].active_token;
    try {
      const previous = await pool.query<{ role: "user" | "assistant"; content: string }>(`SELECT role, content FROM (SELECT id, role, content FROM qa_messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 12) recent ORDER BY id`, [conversationId]);
      const result = await askCodebase(id, question, previous.rows.map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })));
      if (!result.answer) return Response.json({ ok: false, error: result.notice ?? "The assistant could not answer.", conversationId }, { status: 502 });
      const saved = await pool.query(`WITH owned AS (
        UPDATE qa_conversations SET updated_at = now() WHERE id = $1 AND active_token = $2 RETURNING id
      ) INSERT INTO qa_messages (conversation_id, role, content, commit_sha, sources)
        SELECT id, 'user', $3, NULL, '[]'::jsonb FROM owned UNION ALL
        SELECT id, 'assistant', $4, $5, $6::jsonb FROM owned RETURNING id`, [conversationId, token, question, result.answer, result.commit, JSON.stringify(result.sources)]);
      if (saved.rowCount !== 2) return codebaseError("The conversation changed while answering. Please retry.", 409);
      return Response.json({ ok: true, conversationId, ...result });
    } finally {
      await pool.query(`UPDATE qa_conversations SET active_token = NULL, active_until = NULL WHERE id = $1 AND active_token = $2`, [conversationId, token]);
    }
  } catch (error) { return handleCodebaseError(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) return codebaseError("Not logged in", 401);
  if (!project) return codebaseError("Project not found", 404);
  const conversation = new URL(request.url).searchParams.get("conversation");
  if (!conversation || !/^\d{1,15}$/.test(conversation)) return codebaseError("Invalid conversation", 400);
  const result = await pool.query(`DELETE FROM qa_conversations WHERE id = $1 AND project_id = $2 AND user_id = $3 RETURNING id`, [conversation, id, user.id]);
  if (!result.rowCount) return codebaseError("Conversation not found", 404);
  return Response.json({ ok: true });
}
