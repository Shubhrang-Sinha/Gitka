import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import Chat from "./chat";

export const metadata: Metadata = { title: "Team chat" };

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
    <main className="mx-auto w-full max-w-4xl space-y-4 px-5 py-8 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight wrap-anywhere">Team chat</h1>
      <Chat key={id} projectId={id} />
    </main>
  );
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p role="status" className="p-8">Loading team chat…</p>}>
      <ChatPageContent params={params} />
    </Suspense>
  );
}
