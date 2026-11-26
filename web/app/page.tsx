import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { pool } from "@/lib/db";
import { visibleForgejoProjects } from "@/lib/forgejo-access";
import { forgejoHomeUrl, forgejoRepoUrl } from "@/lib/forgejo-links";
import { getCurrentUser, getSessionUser } from "@/lib/session";

type Project = { id: string; name: string; forgejo_repo: string; role: "owner" | "member" };
type Review = {
  id: number;
  project_id: string;
  project_name: string;
  pr_number: number;
  status: "pending" | "done" | "failed";
  created_at: Date;
};

const reviewLabels: Record<Review["status"], string> = {
  pending: "In progress",
  done: "Complete",
  failed: "Failed",
};

function SignedOutHome() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
      <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Your projects, reviews, and team conversations in one place.</h1>
      <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">Connect your Forgejo repositories to review pull requests, talk with your team, and explore your codebase in Gitka.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/login" className="button button-primary">Log in</Link>
        <Link href="/register" className="button">Create an account</Link>
      </div>
    </main>
  );
}

async function HomeContent() {
  const user = await getCurrentUser();
  if (!user) {
    if (await getSessionUser()) redirect("/connect-forgejo");
    return <SignedOutHome />;
  }

  const { rows: memberProjects } = await pool.query<Project>(
    `SELECT p.id, p.name, p.forgejo_repo, pm.role
       FROM projects p JOIN project_members pm ON pm.project_id = p.id
      WHERE pm.user_id = $1 ORDER BY p.created_at DESC, p.id DESC`,
    [user.id],
  );
  const projects = await visibleForgejoProjects(user.id, memberProjects);
  const { rows: reviews } = await pool.query<Review>(
    `SELECT r.id, r.project_id, p.name AS project_name, r.pr_number, r.status, r.created_at
       FROM pr_reviews r JOIN projects p ON p.id = r.project_id
      WHERE r.project_id = ANY($1::bigint[])
      ORDER BY r.created_at DESC, r.id DESC LIMIT 8`,
    [projects.map((project) => project.id)],
  );
  const { rows: [activity] } = await pool.query<{ messages: string; failures: string }>(
    `SELECT (SELECT count(*) FROM project_chat_messages WHERE project_id = ANY($1::bigint[])) AS messages,
            (SELECT count(*) FROM pr_reviews WHERE project_id = ANY($1::bigint[]) AND status = 'failed') AS failures`,
    [projects.map((project) => project.id)],
  );
  const forgejoUrl = forgejoHomeUrl();
  const initial = (user.display_name as string).trim().charAt(0).toUpperCase() || "?";

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
      <div className="grid items-start gap-8 md:grid-cols-[14rem_minmax(0,1fr)] lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12">
        <aside aria-label="Account" className="min-w-0">
          <div aria-hidden="true" className="flex size-16 items-center justify-center rounded-full border border-line bg-panel text-2xl font-semibold text-accent sm:size-20 sm:text-3xl">{initial}</div>
          <h1 className="mt-4 break-words text-2xl font-semibold tracking-tight">{user.display_name}</h1>
          <p className="mt-1 break-all text-sm text-muted">{user.email}</p>
          <div className="mt-5 border-t border-line pt-4 text-sm text-muted">
            <span className="font-semibold text-foreground">{projects.length}</span> {projects.length === 1 ? "project" : "projects"}
          </div>
          {forgejoUrl && <a href={forgejoUrl} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline">Open Forgejo <span aria-hidden="true" className="ml-1">↗</span></a>}
        </aside>

        <div className="min-w-0 space-y-10">
          <section aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="text-xl font-semibold">Activity summary</h2>
            <p className="mt-1 text-sm text-muted">Across your accessible projects, all time.</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-line bg-panel p-4"><dt className="text-sm text-muted">Chat messages</dt><dd className="mt-1 text-2xl font-semibold">{activity.messages}</dd></div>
              <div className="rounded-lg border border-line bg-panel p-4"><dt className="text-sm text-muted">Failed reviews</dt><dd className="mt-1 text-2xl font-semibold">{activity.failures}</dd></div>
              <div className="rounded-lg border border-line bg-panel p-4"><dt className="text-sm text-muted">Review latency</dt><dd className="mt-1 text-sm">Not measured</dd></div>
            </dl>
          </section>
          <section aria-labelledby="projects-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 id="projects-heading" className="text-xl font-semibold">Your projects</h2><p className="mt-1 text-sm text-muted">Repositories you have access to in Gitka.</p></div>
              <Link href="/projects" className="button">Manage projects</Link>
            </div>
            {projects.length === 0 ? (
              <div className="rounded-lg border border-line bg-panel p-6">
                <h3 className="font-semibold">Start with a repository</h3>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">Link an existing Forgejo repository to bring its pull requests and your team into Gitka.</p>
                <Link href="/projects" className="button button-primary mt-4">Link a repository</Link>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {projects.map((project) => {
                  const repoUrl = forgejoRepoUrl(project.forgejo_repo);
                  return (
                    <li key={project.id} className="flex min-w-0 flex-col rounded-lg border border-line bg-panel p-5">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/projects/${project.id}`} className="min-w-0 break-words font-semibold text-accent hover:underline">{project.name}</Link>
                        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs capitalize text-muted">{project.role}</span>
                      </div>
                      <p className="mt-2 break-all text-sm text-muted">{project.forgejo_repo}</p>
                      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                        <Link href={`/projects/${project.id}/pulls`} className="text-accent hover:underline">Pull requests</Link>
                        <Link href={`/projects/${project.id}/chat`} className="text-accent hover:underline">Team chat</Link>
                        {repoUrl && <a href={repoUrl} className="text-accent hover:underline">Forgejo</a>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="activity-heading">
            <h2 id="activity-heading" className="text-xl font-semibold">Recent reviews</h2>
            <p className="mt-1 text-sm text-muted">Latest AI reviews across your projects.</p>
            {reviews.length === 0 ? (
              <p className="mt-4 rounded-lg border border-line bg-panel p-5 text-sm leading-relaxed text-muted">No reviews yet. Open a project’s pull requests to start a review.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
                {reviews.map((review) => (
                  <li key={review.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
                    <div className="min-w-0">
                      <Link href={`/projects/${review.project_id}/pulls/${review.pr_number}`} className="break-words font-medium text-accent hover:underline">{review.project_name} · Pull request #{review.pr_number}</Link>
                      <p className="mt-1 text-xs text-muted"><time dateTime={review.created_at.toISOString()}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(review.created_at)}</time></p>
                    </div>
                    <span className={`text-sm ${review.status === "failed" ? "text-danger" : "text-muted"}`}>{reviewLabels[review.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return <Suspense fallback={<p role="status" className="mx-auto max-w-6xl px-5 py-8 sm:px-8">Loading your overview…</p>}><HomeContent /></Suspense>;
}
