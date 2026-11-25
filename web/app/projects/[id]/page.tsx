import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { forgejoFetch, forgejoFetchText } from "@/lib/forgejo";
import { getCurrentUser } from "@/lib/session";
import AddMemberForm from "./add-member-form";

type RepoEntry = { name: string; path: string; type: string };

async function RepoContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (!/^\d{1,15}$/.test(id)) {
    notFound();
  }

  const result = await pool.query(
    `SELECT p.id, p.name, p.forgejo_repo, pm.role
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1 AND pm.user_id = $2`,
    [id, user.id],
  );
  const project = result.rows[0];
  if (!project) {
    notFound();
  }

  const membersResult = await pool.query(
    `SELECT u.display_name, u.email, pm.role
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = $1
      ORDER BY pm.joined_at`,
    [project.id],
  );
  const members = membersResult.rows;

  let entries: RepoEntry[] = [];
  let readme: string | null = null;
  let loadError: string | null = null;

  try {
    entries = await forgejoFetch<RepoEntry[]>(
      `/repos/${project.forgejo_repo}/contents`,
    );
    readme = await forgejoFetchText(
      `/repos/${project.forgejo_repo}/raw/README.md`,
    );
  } catch (error) {
    console.error("Forgejo load failed:", error);
    loadError = "Could not load this repository from Forgejo.";
  }

  entries.sort((a, b) =>
    a.type === b.type
      ? a.name.localeCompare(b.name)
      : a.type === "dir"
        ? -1
        : 1,
  );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8 sm:px-8">
      <Link href="/projects" className="text-sm underline">
        ← All projects
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight wrap-anywhere">{project.name}</h1>
        <p className="text-sm text-muted">
          {project.forgejo_repo} · {project.role}
        </p>
      </header>
      <nav aria-label="Project tools" className="flex flex-wrap gap-2">
        <Link href={`/projects/${project.id}/pulls`} className="button">
          Pull requests
        </Link>
        <Link href={`/projects/${project.id}/chat`} className="button">
          Team chat
        </Link>
        <Link href={`/projects/${project.id}/qa`} className="button">
          Codebase Q&A
        </Link>
      </nav>
      <section>
        <h2 className="mb-2 font-semibold">Members</h2>
        <ul className="rounded border border-line">
          {members.map((member) => (
            <li
              key={member.email}
              className="flex items-start justify-between gap-3 border-b border-line p-3 last:border-b-0"
            >
              <span className="min-w-0 wrap-anywhere">
                <span className="block font-medium">{member.display_name}</span>
                <span className="block text-sm text-muted">{member.email}</span>
              </span>
              <span className="text-sm text-muted">{member.role}</span>
            </li>
          ))}
        </ul>
        {project.role === "owner" && <AddMemberForm projectId={project.id} />}
      </section>

      {loadError && <p className="text-danger">{loadError}</p>}

      {!loadError && (
        <>
          <section>
            <h2 className="mb-2 font-semibold">Files</h2>
            {entries.length === 0 ? (
              <p className="text-muted">This repository has no files yet.</p>
            ) : (
              <ul className="rounded border border-line">
                {entries.map((entry) => (
                  <li
                    key={entry.path}
                    className="flex justify-between gap-3 border-b border-line p-3 last:border-b-0"
                  >
                    <code className="min-w-0 wrap-anywhere text-sm">{entry.name}</code>
                    <span className="text-sm text-muted">{entry.type === "dir" ? "Folder" : "File"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-semibold">README</h2>
            {readme === null ? (
              <p className="text-muted">No README.md found.</p>
            ) : (
              <pre className="whitespace-pre-wrap wrap-anywhere rounded border border-line p-3 text-sm">
                {readme}
              </pre>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default function RepoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <RepoContent params={params} />
    </Suspense>
  );
}
