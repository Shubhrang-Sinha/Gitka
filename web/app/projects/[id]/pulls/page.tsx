import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { listPulls, type PullRequest } from "@/lib/forgejo-pulls";

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

  const state: StateFilter =
    stateParam === "closed" || stateParam === "all" ? stateParam : "open";

  let pulls: PullRequest[] = [];
  let loadError: string | null = null;
  try {
    pulls = await listPulls(project.forgejo_repo, state);
  } catch (error) {
    console.error("Forgejo PR list failed:", error);
    loadError = "Could not load pull requests from Forgejo.";
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

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <Link href={`/projects/${project.id}`} className="text-sm underline">
        ← {project.name}
      </Link>

      <header>
        <h1 className="text-2xl font-bold">Pull requests</h1>
        <p className="text-sm text-gray-500">{project.forgejo_repo}</p>
      </header>

      <nav className="flex gap-2 text-sm">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/projects/${project.id}/pulls?state=${tab}`}
            className={`rounded border border-gray-400 px-3 py-1 ${
              tab === state ? "bg-gray-800" : "hover:bg-gray-800"
            }`}
          >
            {tab}
          </Link>
        ))}
      </nav>

      {loadError && <p className="text-red-500">{loadError}</p>}

      {!loadError &&
        (pulls.length === 0 ? (
          <p className="text-gray-500">No {state === "all" ? "" : state} pull requests.</p>
        ) : (
          <ul className="space-y-2">
            {pulls.map((pr) => {
              const status = reviewStatus.get(pr.number);
              return (
                <li key={pr.number}>
                  <Link
                    href={`/projects/${project.id}/pulls/${pr.number}`}
                    className="block rounded border border-gray-400 p-3 hover:bg-gray-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold">
                        #{pr.number} {pr.title}
                      </div>
                      {status && (
                        <span className="shrink-0 rounded border border-gray-400 px-2 py-0.5 text-xs">
                          {REVIEW_LABEL[status] ?? status}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {pr.user.login} · {pr.head.ref} → {pr.base.ref} · {pr.state}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
    </main>
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
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <PullsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}