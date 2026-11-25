import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getPull, type PullRequest } from "@/lib/forgejo-pulls";
import ReviewPanel from "./review-panel";

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

  let pr: PullRequest | null = null;
  let loadError: string | null = null;
  try {
    pr = await getPull(project.forgejo_repo, prNumber);
  } catch (error) {
    console.error("Forgejo PR load failed:", error);
    loadError = "Could not load this pull request from Forgejo.";
  }

  const forgejoLink = `${process.env.FORGEJO_URL}/${project.forgejo_repo}/pulls/${prNumber}`;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8 sm:px-8">
      <Link href={`/projects/${project.id}/pulls`} className="text-sm underline">
        ← Pull requests
      </Link>

      {loadError || !pr ? (
        <p className="text-danger">{loadError ?? "Pull request not found."}</p>
      ) : (
        <>
          <header className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight wrap-anywhere">
              #{pr.number} {pr.title}
            </h1>
            <p className="text-sm text-muted">
              {pr.user.login} · {pr.head.ref} → {pr.base.ref} · {pr.state} ·{" "}
              {new Date(pr.created_at).toLocaleDateString()}
            </p>
            <a
              href={forgejoLink}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline"
            >
              View in Forgejo
            </a>
          </header>

          {pr.body && (
            <section>
              <h2 className="mb-2 font-semibold">Description</h2>
              <pre className="whitespace-pre-wrap wrap-anywhere rounded border border-line p-3 text-sm">
                {pr.body}
              </pre>
            </section>
          )}

          <section>
            <h2 className="mb-2 font-semibold">AI review</h2>
            <ReviewPanel projectId={project.id} prNumber={prNumber} />
          </section>
        </>
      )}
    </main>
  );
}

export default function PullPage({
  params,
}: {
  params: Promise<{ id: string; n: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <PullContent params={params} />
    </Suspense>
  );
}