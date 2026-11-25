"use client";

import Link from "next/link";

export default function RouteError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-5 py-12 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">This page could not load</h1>
      <p role="alert" className="text-muted">Try loading it again or go back to your projects.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="button button-primary" onClick={retry}>Try again</button>
        <Link href="/projects" className="button">Go to projects</Link>
      </div>
    </main>
  );
}
