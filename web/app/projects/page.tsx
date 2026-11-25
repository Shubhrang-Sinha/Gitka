import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { pool } from "@/lib/db";
import { forgejoHomeUrl, forgejoRepoUrl } from "@/lib/forgejo-links";
import { getCurrentUser } from "@/lib/session";
import CreateProjectForm from "./create-project-form";
import LogoutButton from "./logout-button";

export const metadata: Metadata = { title: "Projects" };

type ReviewStatus = "pending" | "done" | "failed";
type Project = {
  id: string;
  name: string;
  forgejo_repo: string;
  role: "owner" | "member";
  pr_number: number | null;
  review_status: ReviewStatus | null;
};

const reviewLabels: Record<ReviewStatus, string> = {
  pending: "In progress",
  done: "Complete",
  failed: "Failed",
};

async function ProjectsContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { rows: projects } = await pool.query<Project>(
    `SELECT p.id, p.name, p.forgejo_repo, pm.role,
            review.pr_number, review.status AS review_status
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       LEFT JOIN LATERAL (
         SELECT pr_number, status
         FROM pr_reviews
         WHERE project_id = p.id
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       ) review ON true
      WHERE pm.user_id = $1
      ORDER BY p.created_at DESC, p.id DESC`,
    [user.id],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <h1 className="text-3xl font-bold tracking-tight wrap-anywhere sm:text-4xl">Your projects</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm">
          <span className="break-all text-muted">{user.display_name}</span>
          <LogoutButton />
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,19rem)]">
        <section aria-label="Project list" className="min-w-0">
          {projects.length === 0 ? (
            <p className="rounded-xl border border-line bg-panel p-5 text-sm text-muted">
              Link a Forgejo repository to create your first project.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-line bg-panel divide-y divide-line">
              {projects.map((project) => {
                const href = `/projects/${project.id}`;
                const repoUrl = forgejoRepoUrl(project.forgejo_repo);
                return (
                  <li key={project.id} className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-xl font-semibold tracking-tight wrap-anywhere">{project.name}</h2>
                        <p className="mt-1 break-all font-mono text-xs text-muted">
                          {project.forgejo_repo}
                        </p>
                      </div>
                      <span className="rounded-full border border-line px-2.5 py-1 text-xs capitalize text-muted">{project.role}</span>
                    </div>
                    {project.pr_number !== null && project.review_status && (
                      <p className="mt-4 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                        <Link href={`${href}/pulls/${project.pr_number}`} aria-label={`Latest review for ${project.name}, pull request #${project.pr_number}`} className="inline-flex min-h-9 items-center font-medium text-accent underline underline-offset-4">
                          Latest review #{project.pr_number}
                        </Link>
                        <span aria-hidden="true">·</span>
                        {reviewLabels[project.review_status]}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={href} aria-label={`Open project ${project.name}`} className="button button-primary">
                        Open project
                      </Link>
                      {repoUrl && <a href={repoUrl} aria-label={`Open ${project.forgejo_repo} in Forgejo`} className="button">Open in Forgejo</a>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <CreateProjectForm forgejoUrl={forgejoHomeUrl()} />
      </div>
    </main>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<p role="status" className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">Loading projects…</p>}>
      <ProjectsContent />
    </Suspense>
  );
}
