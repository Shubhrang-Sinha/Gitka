import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import Chat from "./chat";

async function ChatPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!/^\d{1,15}$/.test(id)) notFound();
  const project = await pool.query(
    "SELECT p.name FROM projects p JOIN project_members m ON m.project_id = p.id WHERE p.id = $1 AND m.user_id = $2",
    [id, user.id],
  );
  if (!project.rowCount) notFound();
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <Link href={`/projects/${id}`} className="text-sm underline">
        ← {project.rows[0].name}
      </Link>
      <h1 className="text-2xl font-bold">Team chat</h1>
      <Chat projectId={id} />
    </main>
  );
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <ChatPageContent params={params} />
    </Suspense>
  );
}
