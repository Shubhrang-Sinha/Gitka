import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-5 py-12 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted">The page may have moved, or you may not have access to it.</p>
      <Link href="/projects" className="button button-primary">Go to your projects</Link>
    </main>
  );
}
