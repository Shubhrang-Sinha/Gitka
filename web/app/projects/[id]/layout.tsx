import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { forgejoRepoUrl } from "@/lib/forgejo-links";
import { getCurrentUser } from "@/lib/session";
import ProjectNav from "./project-nav";

async function ProjectShell({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { rows: [project] } = await pool.query<{ id: string; name: string; forgejo_repo: string }>(
    `SELECT p.id, p.name, p.forgejo_repo
       FROM projects p JOIN project_members m ON p.id = m.project_id
      WHERE p.id = $1 AND m.user_id = $2`,
    [id, user.id],
  );
  if (!project) notFound();

  const repositoryUrl = forgejoRepoUrl(project.forgejo_repo);
  return (
    <>
      <div className="border-b border-line bg-panel">
        <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">
          <div className="flex flex-col gap-4 pb-4 pt-5 sm:flex-row sm:items-end sm:justify-between sm:pt-7">
            <div className="min-w-0">
              <Link href="/projects" className="inline-flex min-h-11 items-center text-sm font-medium text-muted hover:text-accent">
                All projects
              </Link>
              <p className="wrap-anywhere text-xl font-semibold tracking-tight sm:text-2xl">{project.name}</p>
              <p className="mt-1 wrap-anywhere font-mono text-xs text-muted sm:text-sm">{project.forgejo_repo}</p>
            </div>
            {repositoryUrl && (
              <div className="shrink-0 sm:text-right">
                <a href={repositoryUrl} className="button gap-2">
                  Open repository in Forgejo
                  <svg aria-hidden="true" className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M11 4h5v5m0-5-7 7m5 0v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
                  </svg>
                </a>
                <p className="mt-1 text-xs text-muted">Private repositories require Forgejo access.</p>
              </div>
            )}
          </div>
          <ProjectNav projectId={String(project.id)} />
        </div>
      </div>
      {children}
    </>
  );
}

export default function ProjectLayout(props: LayoutProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<p role="status" className="mx-auto w-full max-w-5xl px-5 py-10 text-muted sm:px-8">Loading project…</p>}>
      <ProjectShell {...props} />
    </Suspense>
  );
}
