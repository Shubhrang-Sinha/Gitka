import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { forgejoRepoUrl } from "@/lib/forgejo-links";
import { listPulls, type PullRequest } from "@/lib/forgejo-pulls";

export const metadata = { title: "Pull requests" };

type StateFilter = "open" | "closed" | "all";

const REVIEW_LABEL: Record<string, string> = {
  done: "AI reviewed",
  pending: "Reviewing...",
  failed: "Review failed",
};

async function PullsContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { id } = await params;
  const { state: stateParam } = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (!/^\d{1,15}$/.test(id)) {
    notFound();
  }

  const result = await pool.query(
    `SELECT p.id, p.forgejo_repo
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1 AND pm.user_id = $2`,
    [id, user.id],
  );
  const project = result.rows[0];
  if (!project) {
    notFound();
  }

  const state: StateFilter =
    stateParam === "closed" || stateParam === "all" ? stateParam : "open";

  let pulls: PullRequest[] = [];
  let loadError: string | null = null;
  try {
    pulls = await listPulls(project.forgejo_repo, state, AbortSignal.timeout(8000));
  } catch (error) {
    console.error("Forgejo PR list failed:", error);
    loadError = "Could not load pull requests from Forgejo. Reload the page to try again.";
  }

  // Latest review status per PR, so the list can show a badge.
  const reviews = await pool.query(
    `SELECT DISTINCT ON (pr_number) pr_number, status
       FROM pr_reviews
      WHERE project_id = $1
      ORDER BY pr_number, created_at DESC`,
    [project.id],
  );
  const reviewStatus = new Map<number, string>(
    reviews.rows.map((r) => [r.pr_number, r.status]),
  );

  const tabs: StateFilter[] = ["open", "closed", "all"];
  const forgejoLink = forgejoRepoUrl(project.forgejo_repo, "pulls");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-7 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pull requests</h1>
        {forgejoLink && <a href={forgejoLink} className="button">Open pull requests in Forgejo</a>}
      </header>

      <nav aria-label="Filter pull requests" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/projects/${project.id}/pulls?state=${tab}`}
            aria-current={tab === state ? "page" : undefined}
            className={tab === state ? "button button-primary capitalize" : "button capitalize"}
          >
            {tab}
          </Link>
        ))}
      </nav>

      {loadError && <p role="alert" className="rounded-xl border border-line bg-panel p-5 text-danger">{loadError}</p>}

      {!loadError &&
        (pulls.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-line bg-panel p-5">
            <p className="font-semibold">No {state === "all" ? "" : `${state} `}pull requests.</p>
            {forgejoLink && <p className="text-sm text-muted">To start a pull request, open the list in Forgejo and select New Pull Request.</p>}
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
            {pulls.map((pr) => {
              const status = reviewStatus.get(pr.number);
              return (
                <li key={pr.number} className="first:rounded-t-[inherit] last:rounded-b-[inherit]">
                  <Link
                    href={`/projects/${project.id}/pulls/${pr.number}`}
                    className="block rounded-[inherit] p-4 hover:bg-background"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 wrap-anywhere font-semibold">
                        #{pr.number} {pr.title}
                      </div>
                      {status && (
                        <span className="shrink-0 rounded border border-line px-2 py-0.5 text-xs">
                          {REVIEW_LABEL[status] ?? status}
                        </span>
                      )}
                    </div>
                    <div className="wrap-anywhere text-sm text-muted">
                      {pr.user.login} · {pr.head.ref} → {pr.base.ref} · {pr.state}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}

export default function PullsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<p role="status" className="p-8 text-muted">Loading pull requests…</p>}>
      <PullsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
