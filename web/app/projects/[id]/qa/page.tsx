import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCodebaseProject } from "@/lib/codebase-access";
import { getIndex } from "@/lib/codebase-index";
import CodebaseQuestions from "./codebase-questions";

type Props = { params: Promise<{ id: string }> };

async function CodebaseContent({ params }: Props) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) redirect("/login");
  if (!project) notFound();
  const index = await getIndex(id);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <Link href={`/projects/${id}`} className="text-sm underline underline-offset-4">
        {project.name}
      </Link>
      <h1 className="text-2xl font-bold">Codebase Q&amp;A</h1>
      <CodebaseQuestions
        projectId={id}
        isOwner={project.role === "owner"}
        usesAi={Boolean(process.env.OPENROUTER_API_KEY)}
        initialIndex={index}
      />
    </main>
  );
}

export default function CodebasePage({ params }: Props) {
  return (
    <Suspense fallback={<p className="p-8">Loading codebase Q&amp;A…</p>}>
      <CodebaseContent params={params} />
    </Suspense>
  );
}
