import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-24 lg:grid-cols-[1fr_1.15fr] lg:items-center">
      <section>
        <h1 className="max-w-[15ch] text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Turn code review into a conversation.
        </h1>
        <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted">
          Work with your Forgejo pull requests in Gitka. Review changes with AI, talk them through with your team, and trace answers back to the source.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/projects" className="button button-primary">Open projects</Link>
          <Link href="/register" className="button">Create an account</Link>
        </div>
      </section>

      <section aria-labelledby="workflow-example" className="min-w-0 rounded-xl border border-line bg-panel">
        <header className="border-b border-line p-5 sm:p-6">
          <p className="text-sm text-muted">Lantern Schedule · Example pull request</p>
          <h2 id="workflow-example" className="mt-2 text-xl font-semibold tracking-tight">
            Add a custom lantern interval
          </h2>
        </header>
        <ol className="divide-y divide-line">
          <li className="p-5 sm:px-6">
            <h3 className="text-sm font-semibold">AI review</h3>
            <p className="mt-1 break-all font-mono text-xs text-accent">src/custom-interval.ts</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The scheduling helper already expects minutes. Multiplying by 60 makes the next check much later than intended.
            </p>
          </li>
          <li className="p-5 sm:px-6">
            <h3 className="text-sm font-semibold">Shared discussion</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Comment in Gitka and continue the same discussion in Forgejo.
            </p>
          </li>
        </ol>
      </section>
    </main>
  );
}
