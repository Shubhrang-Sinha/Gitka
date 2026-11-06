import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { pool } from "@/lib/db";
import LogoutButton from "./logout-button";
import CreateProjectForm from "./create-project-form";

async function ProjectsContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const result = await pool.query(
    `SELECT p.id, p.name, p.forgejo_repo, pm.role
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
      WHERE pm.user_id = $1
      ORDER BY p.created_at DESC`,
    [user.id]
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your projects</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm">{user.display_name}</span>
          <LogoutButton />
        </div>
      </header>

      {result.rows.length === 0 ? (
        <p className="text-gray-500">You are not a member of any projects yet.</p>
      ) : (
        <ul className="space-y-2">
          {result.rows.map((project) => (
            <li key={project.id} className="rounded border border-gray-400 p-3">
              <div className="font-semibold">{project.name}</div>
              <div className="text-sm text-gray-500">
                {project.forgejo_repo} · {project.role}
              </div>
            </li>
          ))}
        </ul>
      )}
      <CreateProjectForm />

    </main>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <ProjectsContent />
    </Suspense>
  );
}