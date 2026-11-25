import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { forgejoFetch, forgejoFetchText } from "@/lib/forgejo";
import { forgejoPublicUrl } from "@/lib/forgejo-links";
import { getCurrentUser } from "@/lib/session";
import AddMemberForm from "./add-member-form";
import RetryRepository from "./retry-repository";

export const metadata: Metadata = { title: "Project overview" };

type RepoEntry = { name: string; path: string; type: string; html_url?: string };
type Project = { id: number; forgejo_repo: string; role: string };
type Member = { display_name: string; email: string; role: string };

async function RepositoryFiles({ repo }: { repo: string }) {
  let entries: RepoEntry[];
  try {
    entries = await forgejoFetch<RepoEntry[]>(`/repos/${repo}/contents`);
  } catch (error) {
    console.error("Forgejo files load failed:", error);
    return <RetryRepository section="files" />;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted">This repository has no files yet.</p>;
  }

  entries.sort((a, b) =>
    a.type === b.type
      ? a.name.localeCompare(b.name)
      : a.type === "dir"
        ? -1
        : 1,
  );

  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
      {entries.map((entry) => {
        const url = entry.html_url && forgejoPublicUrl(entry.html_url);
        return (
          <li key={entry.path} className="flex min-h-11 items-center justify-between gap-3 px-3">
            {url ? (
              <a href={url} className="flex min-h-11 min-w-0 items-center wrap-anywhere font-mono text-sm text-accent hover:underline">
                {entry.name}
              </a>
            ) : (
              <code className="min-w-0 wrap-anywhere text-sm">{entry.name}</code>
            )}
            <span className="text-xs text-muted">{entry.type === "dir" ? "Folder" : "File"}</span>
          </li>
        );
      })}
    </ul>
  );
}

async function RepositoryReadme({ repo }: { repo: string }) {
  let readme: string | null;
  try {
    readme = await forgejoFetchText(`/repos/${repo}/raw/README.md`);
  } catch (error) {
    console.error("Forgejo README load failed:", error);
    return <RetryRepository section="README" />;
  }

  return readme === null ? (
    <p className="text-sm text-muted">No README.md found.</p>
  ) : (
    <pre className="overflow-auto whitespace-pre-wrap wrap-anywhere rounded-xl border border-line bg-panel p-4 text-sm">
      {readme}
    </pre>
  );
}

async function ProjectMembers({ project }: { project: Project }) {
  const { rows: members } = await pool.query<Member>(
    `SELECT u.display_name, u.email, pm.role
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = $1
      ORDER BY pm.joined_at`,
    [project.id],
  );

  return (
    <>
      <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
        {members.map((member) => (
          <li key={member.email} className="flex items-start justify-between gap-3 p-3">
            <span className="min-w-0 wrap-anywhere">
              <span className="block text-sm font-medium">{member.display_name}</span>
              <span className="block text-xs text-muted">{member.email}</span>
            </span>
            <span className="text-xs text-muted">{member.role}</span>
          </li>
        ))}
      </ul>
      {project.role === "owner" && <AddMemberForm projectId={project.id} />}
    </>
  );
}

function LoadingSection({ children }: { children: string }) {
  return <p role="status" className="text-sm text-muted">{children}</p>;
}

async function RepoContent({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!/^\d{1,15}$/.test(id)) notFound();

  const { rows: [project] } = await pool.query<Project>(
    `SELECT p.id, p.forgejo_repo, pm.role
       FROM projects p JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1 AND pm.user_id = $2`,
    [id, user.id],
  );
  if (!project) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Project overview</h1>
      <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="repository-files">
            <h2 id="repository-files" className="mb-3 font-semibold">Repository files</h2>
            <Suspense fallback={<LoadingSection>Loading files…</LoadingSection>}>
              <RepositoryFiles repo={project.forgejo_repo} />
            </Suspense>
          </section>

          <section aria-labelledby="repository-readme">
            <h2 id="repository-readme" className="mb-3 font-semibold">README</h2>
            <Suspense fallback={<LoadingSection>Loading README…</LoadingSection>}>
              <RepositoryReadme repo={project.forgejo_repo} />
            </Suspense>
          </section>
        </div>

        <section aria-labelledby="project-members" className="min-w-0">
          <h2 id="project-members" className="mb-3 font-semibold">Members</h2>
          <Suspense fallback={<LoadingSection>Loading members…</LoadingSection>}>
            <ProjectMembers project={project} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

export default function RepoPage(props: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<LoadingSection>Loading overview…</LoadingSection>}>
      <RepoContent {...props} />
    </Suspense>
  );
}
