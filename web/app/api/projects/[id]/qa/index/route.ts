import { codebaseError, getCodebaseProject, handleCodebaseError } from "@/lib/codebase-access";
import { cancelIndexJob, ensureIndexJob } from "@/lib/qa-jobs";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) return codebaseError("Not logged in", 401);
  if (!project) return codebaseError("Project not found", 404);
  if (project.role !== "owner") return codebaseError("Only project owners can refresh the index.", 403);
  const limited = await rateLimit("codebase-index", String(project.id), 3, 60);
  if (limited) return limited;
  try { return Response.json({ ok: true, ...await ensureIndexJob(id, project.forgejo_repo, String(user.id), true) }, { status: 202 }); }
  catch (error) { return handleCodebaseError(error); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) return codebaseError("Not logged in", 401);
  if (!project) return codebaseError("Project not found", 404);
  if (project.role !== "owner") return codebaseError("Only project owners can cancel indexing.", 403);
  return Response.json({ ok: true, cancelled: await cancelIndexJob(id) });
}
