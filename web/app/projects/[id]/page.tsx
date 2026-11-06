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
    [id, user.id]
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
    [project.id]
  );
  const members = membersResult.rows;

  let entries: RepoEntry[] = [];
  let readme: string | null = null;
  let loadError: string | null = null;

  try {
    entries = await forgejoFetch<RepoEntry[]>(
      `/repos/${project.forgejo_repo}/contents`
    );
    readme = await forgejoFetchText(`/repos/${project.forgejo_repo}/raw/README.md`);
  } catch (error) {
    console.error("Forgejo load failed:", error);
    loadError = "Could not load this repository from Forgejo.";
  }

  entries.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <Link href="/projects" className="text-sm underline">
        ← All projects
      </Link>

      <header>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-gray-500">
          {project.forgejo_repo} · {project.role}
        </p>
      </header>
      <section>
        <h2 className="mb-2 font-semibold">Members</h2>
        <ul className="rounded border border-gray-400">
          {members.map((member) => (
            <li
              key={member.email}
              className="flex justify-between border-b border-gray-400 p-2 last:border-b-0"
            >
              <span>
                {member.display_name}{" "}
                <span className="text-sm text-gray-500">{member.email}</span>
              </span>
              <span className="text-sm text-gray-500">{member.role}</span>
            </li>
          ))}
        </ul>
        {project.role === "owner" && <AddMemberForm projectId={project.id} />}
      </section>

      {loadError && <p className="text-red-500">{loadError}</p>}

      {!loadError && (
        <>
          <section>
            <h2 className="mb-2 font-semibold">Files</h2>
            {entries.length === 0 ? (
              <p className="text-gray-500">This repository has no files yet.</p>
            ) : (
              <ul className="rounded border border-gray-400">
                {entries.map((entry) => (
                  <li
                    key={entry.path}
                    className="border-b border-gray-400 p-2 last:border-b-0"
                  >
                    {entry.type === "dir" ? "📁" : "📄"} {entry.name}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-semibold">README</h2>
            {readme === null ? (
              <p className="text-gray-500">No README.md found.</p>
            ) : (
              <pre className="whitespace-pre-wrap rounded border border-gray-400 p-3 text-sm">
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