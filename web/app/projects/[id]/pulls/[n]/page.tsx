import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ForgejoRequestError, forgejoFetchAs, forgejoFetchTextAs } from "@/lib/forgejo";
import { forgejoRepoUrl } from "@/lib/forgejo-links";
import type { PullRequest } from "@/lib/forgejo-pulls";
import DiscussionPanel from "./discussion-panel";
import ReviewPanel from "./review-panel";

export const metadata = { title: "Pull request" };
export const instant = false;

async function PullContent({
  params,
}: {
  params: Promise<{ id: string; n: string }>;
}) {
  const { id, n } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (!/^\d{1,15}$/.test(id) || !/^\d{1,9}$/.test(n) || Number(n) < 1) {
    notFound();
  }
  const prNumber = Number(n);

  const result = await pool.query(
    `SELECT p.id, p.name, p.forgejo_repo
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1 AND pm.user_id = $2`,
    [id, user.id],
  );
  const project = result.rows[0];
  if (!project) {
    notFound();
  }

  const repoPath = project.forgejo_repo.split("/").map(encodeURIComponent).join("/");
  let diff: string | null = null;
  let diffError = false;
  let pr: PullRequest | null = null;
  let loadError: string | null = null;
  try {
    pr = await forgejoFetchAs<PullRequest>(user.id, `/repos/${repoPath}/pulls/${prNumber}`);
    try { diff = await forgejoFetchTextAs(user.id, `/repos/${repoPath}/pulls/${prNumber}.diff`); }
    catch { diffError = true; }
  } catch (error) {
    if (error instanceof ForgejoRequestError && error.status === 404) {
      notFound();
    }
    console.error("Forgejo PR load failed:", error);
    loadError = "Could not load this pull request from Forgejo. Reload the page to try again.";
  }

  const forgejoLink = forgejoRepoUrl(project.forgejo_repo, "pulls", prNumber);
  const repoUrl = pr?.head.repo
    ? forgejoRepoUrl(pr.head.repo.full_name)
    : pr?.head.repo === null ? null : forgejoRepoUrl(project.forgejo_repo);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-7 sm:px-8">
      <Link href={`/projects/${project.id}/pulls`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4">
        All pull requests
      </Link>

      {loadError || !pr ? (
        <section className="space-y-3 rounded-xl border border-line bg-panel p-5">
          <h1 className="text-xl font-semibold">Pull request #{prNumber}</h1>
          <p role="alert" className="text-danger">{loadError ?? "Pull request not found."}</p>
          {forgejoLink && <a href={forgejoLink} className="button">View in Forgejo</a>}
        </section>
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
            <div className="min-w-0 space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere sm:text-3xl">
                <span className="text-muted">#{pr.number}</span> {pr.title}
              </h1>
              <p className="wrap-anywhere text-sm text-muted">
                {pr.user.login} · {pr.head.ref} → {pr.base.ref} · {pr.state} ·{" "}
                {new Date(pr.created_at).toLocaleDateString()}
              </p>
            </div>
            {forgejoLink && <a href={forgejoLink} className="button">View in Forgejo</a>}
          </header>

          <nav aria-label="On this pull request" className="flex flex-wrap gap-2">
            <a href="#changes" className="button">Changes</a>
            <a href="#ai-review" className="button">AI review</a>
            <a href="#discussion" className="button">Discussion</a>
          </nav>

          <section id="changes" aria-labelledby="changes-heading" className="scroll-mt-6 space-y-3">
            <h2 id="changes-heading" className="text-lg font-semibold">Changes</h2>
            {diffError || diff === null ? <p role="alert" className="text-sm text-danger">Could not load the changes from Forgejo.</p> : diff.length === 0 ? <p className="text-sm text-muted">No text changes.</p> : <>
              {diff.length > 250000 && <p className="text-sm text-muted">This diff is large; only the first 250,000 characters are shown.</p>}
              <pre className="max-h-[40rem] overflow-auto rounded-xl border border-line bg-panel p-4 text-xs leading-relaxed"><code>{diff.slice(0, 250000)}</code></pre>
            </>}
          </section>

          <ReviewPanel
            key={`${project.id}/${prNumber}/${pr.head.sha}`}
            projectId={project.id}
            prNumber={prNumber}
            headSha={pr.head.sha}
            repoUrl={repoUrl}
          />

          {pr.body && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Description</h2>
              <p className="max-w-[72ch] whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed">
                {pr.body}
              </p>
            </section>
          )}

          <DiscussionPanel
            key={`${project.id}/${prNumber}`}
            projectId={project.id}
            prNumber={prNumber}
            forgejoPullUrl={forgejoLink}
          />
        </>
      )}
    </div>
  );
}

export default function PullPage({
  params,
}: {
  params: Promise<{ id: string; n: string }>;
}) {
  return (
    <Suspense fallback={<p role="status" className="p-8 text-muted">Loading pull request…</p>}>
      <PullContent params={params} />
    </Suspense>
  );
}
