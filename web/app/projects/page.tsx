import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import CreateProjectForm from "./create-project-form";
import LogoutButton from "./logout-button";

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
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-gray-300 pb-5 dark:border-gray-700">
        <h1 className="text-2xl font-bold tracking-tight">Your projects</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm">
          <span className="break-all text-gray-600 dark:text-gray-400">{user.display_name}</span>
          <LogoutButton />
        </div>
      </header>

      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <section aria-label="Project list" className="min-w-0">
          {projects.length === 0 ? (
            <p className="rounded-xl border border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
              Link a Forgejo repository to create your first project.
            </p>
          ) : (
            <ul className="divide-y divide-gray-300 border-y border-gray-300 dark:divide-gray-700 dark:border-gray-700">
              {projects.map((project) => {
                const href = `/projects/${project.id}`;
                return (
                  <li key={project.id} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words font-semibold">
                          <Link href={href} className="underline-offset-4 hover:underline">
                            {project.name}
                          </Link>
                        </h2>
                        <p className="break-all text-sm text-gray-600 dark:text-gray-400">
                          {project.forgejo_repo}
                        </p>
                      </div>
                      <span className="text-sm capitalize text-gray-600 dark:text-gray-400">{project.role}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                      <Link href={`${href}/pulls`} className="underline underline-offset-4">Pull requests</Link>
                      <Link href={`${href}/chat`} className="underline underline-offset-4">Team chat</Link>
                      <Link href={`${href}/qa`} className="underline underline-offset-4">Codebase Q&amp;A</Link>
                    </div>
                    {project.pr_number !== null && project.review_status && (
                      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                        Latest review <Link href={`${href}/pulls/${project.pr_number}`} className="underline underline-offset-4">
                          #{project.pr_number}
                        </Link>
                        <span className="mx-2" aria-hidden="true">·</span>
                        {reviewLabels[project.review_status]}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <CreateProjectForm />
      </div>
    </main>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<p role="status" className="mx-auto max-w-5xl px-5 py-8 sm:px-8">Loading projects…</p>}>
      <ProjectsContent />
    </Suspense>
  );
}
