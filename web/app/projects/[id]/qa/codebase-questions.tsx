"use client";

import { useState, type FormEvent } from "react";
import type { CodebaseSource } from "@/lib/codebase-qa";

type Index = {
  branch: string;
  commit_sha: string;
  file_count: number;
  limited: boolean;
};

type Result = {
  commit: string;
  sources: CodebaseSource[];
  answer: string | null;
  notice: string | null;
};

const primaryButton = "rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-85 disabled:opacity-45";

export default function CodebaseQuestions({
  projectId,
  isOwner,
  usesAi,
  initialIndex,
}: {
  projectId: string;
  isOwner: boolean;
  usesAi: boolean;
  initialIndex: Index | null;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<"index" | "ask" | null>(null);
  const [error, setError] = useState("");
  const endpoint = `/api/projects/${projectId}/qa`;

  async function refreshIndex() {
    setPending("index");
    setError("");
    try {
      const response = await fetch(`${endpoint}/index`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not refresh the index.");
      setIndex(data.index);
      if (index?.commit_sha !== data.index.commit_sha) setResult(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not refresh the index.");
    } finally {
      setPending(null);
    }
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("ask");
    setError("");
    setResult(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not search the codebase.");
      setResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not search the codebase.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3 border-y border-gray-400 py-4">
        <div aria-live="polite">
          {index ? (
            <>
              <p className="text-sm">
                <strong>{index.branch}</strong> at <code>{index.commit_sha.slice(0, 12)}</code>
                {" · "}{index.file_count} {index.file_count === 1 ? "file" : "files"} indexed
              </p>
              {index.limited && <p className="mt-1 text-sm opacity-80">Some eligible files exceeded the indexing limits.</p>}
            </>
          ) : (
            <p className="text-sm">
              {isOwner ? "Index the default branch to get started." : "Ask a project owner to index the repository."}
            </p>
          )}
        </div>
        {isOwner && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={refreshIndex}
            className="rounded-md border border-gray-400 px-3 py-2 text-sm font-medium hover:bg-foreground/10 disabled:opacity-45"
          >
            {pending === "index" ? "Indexing…" : index ? "Refresh index" : "Index repository"}
          </button>
        )}
      </section>

      {index && index.file_count > 0 && (
        <form onSubmit={ask} className="space-y-3">
          <label htmlFor="codebase-question" className="block font-semibold">Question about the repository</label>
          <textarea
            id="codebase-question"
            className="block w-full resize-y rounded-md border border-gray-400 bg-background p-3 focus-visible:outline-2"
            placeholder="Where does the app handle sign-in?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            maxLength={1000}
            required
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending !== null || !question.trim()} className={primaryButton}>
              {pending === "ask" ? "Searching…" : usesAi ? "Ask question" : "Find sources"}
            </button>
            <p className="text-sm opacity-80">
              {usesAi ? "Questions and matching excerpts are sent to OpenRouter." : "Search the index for matching excerpts."}
            </p>
          </div>
        </form>
      )}

      {index?.file_count === 0 && <p>This snapshot contains no eligible source files.</p>}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}

      {result && (
        <section aria-label="Search result" aria-live="polite" className="space-y-4">
          {result.answer && <p className="whitespace-pre-wrap wrap-break-word">{result.answer}</p>}
          {result.notice && <p>{result.notice}</p>}
          {result.sources.length > 0 && (
            <>
              <h2 className="font-semibold">Sources from <code className="text-sm">{result.commit.slice(0, 12)}</code></h2>
              <ol className="space-y-2">
                {result.sources.map((source, position) => (
                  <li key={`${source.path}:${source.start_line}`}>
                    <details className="rounded-md border border-gray-400">
                      <summary className="cursor-pointer px-3 py-2 text-sm wrap-anywhere">
                        <span className="mr-2 opacity-80">[{position + 1}]</span>
                        <code>{source.path}:{source.start_line}–{source.end_line}</code>
                      </summary>
                      <pre className="overflow-x-auto border-t border-gray-400 p-3 text-xs">
                        <code>{source.content}</code>
                      </pre>
                    </details>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
    </div>
  );
}
