import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCodebaseProject } from "@/lib/codebase-access";
import { getIndex } from "@/lib/codebase-index";
import { forgejoRepoUrl } from "@/lib/forgejo-links";
import CodebaseQuestions from "./codebase-questions";

type Props = { params: Promise<{ id: string }> };
export const metadata = { title: "Codebase Q&A" };
export const instant = false;

async function CodebaseContent({ params }: Props) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) redirect("/login");
  if (!project) notFound();
  const index = await getIndex(id);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-7 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Codebase Q&amp;A</h1>
      <CodebaseQuestions
        projectId={id}
        repoUrl={forgejoRepoUrl(project.forgejo_repo)}
        isOwner={project.role === "owner"}
        usesAi={Boolean(process.env.OPENROUTER_API_KEY)}
        initialIndex={index}
      />
    </div>
  );
}

export default function CodebasePage({ params }: Props) {
  return (
    <Suspense fallback={<p role="status" className="p-8 text-muted">Loading codebase Q&amp;A…</p>}>
      <CodebaseContent params={params} />
    </Suspense>
  );
}
