import { codebaseError, getCodebaseProject, handleCodebaseError } from "@/lib/codebase-access";
import { getIndex } from "@/lib/codebase-index";
import { askCodebase } from "@/lib/codebase-qa";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) return codebaseError("Not logged in", 401);
  if (!project) return codebaseError("Project not found", 404);
  return Response.json({ ok: true, index: await getIndex(id) });
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) return codebaseError("Not logged in", 401);
  if (!project) return codebaseError("Project not found", 404);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return codebaseError("Invalid JSON", 400);
  }
  const question = input && typeof input === "object" && "question" in input ? input.question : null;
  if (typeof question !== "string" || !question.trim() || question.length > 1000) {
    return codebaseError("Enter a question between 1 and 1000 characters.", 400);
  }

  const limited = await rateLimit("codebase-question", String(user.id), 10, 60);
  if (limited) return limited;
  try {
    return Response.json({ ok: true, ...await askCodebase(id, question.trim()) });
  } catch (error) {
    return handleCodebaseError(error);
  }
}
