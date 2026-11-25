import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCodebaseProject } from "@/lib/codebase-access";
import Chat from "./chat";

export const metadata: Metadata = { title: "Team chat" };
export const instant = false;

async function ChatPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await getCodebaseProject(id);
  if (!user) redirect("/login");
  if (!project) notFound();
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
