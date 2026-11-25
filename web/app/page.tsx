import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-14 sm:px-8 sm:py-24 md:grid-cols-[1.35fr_1fr] md:items-start">
      <section>
        <h1 className="max-w-[15ch] text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          A workspace for your Forgejo repositories
        </h1>
        <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted">
          Review pull requests, discuss changes with your team, and find answers in your codebase.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/projects" className="button button-primary">Open projects</Link>
          <Link href="/register" className="button">Create an account</Link>
        </div>
      </section>

      <section aria-label="What you can do" className="divide-y divide-line border-y border-line">
        <div className="py-4">
          <h2 className="font-semibold">Pull request reviews</h2>
          <p className="mt-1 text-sm text-muted">See AI review findings alongside the change.</p>
        </div>
        <div className="py-4">
          <h2 className="font-semibold">Team chat</h2>
          <p className="mt-1 text-sm text-muted">Keep project discussions in one place.</p>
        </div>
        <div className="py-4">
          <h2 className="font-semibold">Codebase Q&amp;A</h2>
          <p className="mt-1 text-sm text-muted">Search an indexed commit and open the source excerpts.</p>
        </div>
      </section>
    </main>
  );
}
