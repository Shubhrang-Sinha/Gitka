import { codebaseError, getCodebaseProject, handleCodebaseError } from "@/lib/codebase-access";
import { indexCodebase } from "@/lib/codebase-index";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) return codebaseError("Not logged in", 401);
  if (!project) return codebaseError("Project not found", 404);
  if (project.role !== "owner") return codebaseError("Only project owners can refresh the index.", 403);
  const limited = await rateLimit("codebase-index", project.id, 3, 60);
  if (limited) return limited;
  try {
    return Response.json({ ok: true, index: await indexCodebase(id, project.forgejo_repo) });
  } catch (error) {
    return handleCodebaseError(error);
  }
}
