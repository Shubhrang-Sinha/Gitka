"use client";

import { useState, type FormEvent } from "react";
import type { CodebaseSource } from "@/lib/codebase-qa";
import { forgejoSourceFromRepoUrl } from "@/lib/forgejo-links";

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

function Answer({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap wrap-anywhere leading-relaxed">
      {text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) => {
        if (index % 2 === 0) return part;
        return part.startsWith("`")
          ? <code key={index} className="rounded bg-panel px-1 text-sm">{part.slice(1, -1)}</code>
          : <strong key={index}>{part.slice(2, -2)}</strong>;
      })}
    </p>
  );
}

export default function CodebaseQuestions({
  projectId,
  repoUrl,
  isOwner,
  usesAi,
  initialIndex,
}: {
  projectId: string;
  repoUrl: string | null;
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
      <section className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-4">
        <div aria-live="polite" className="min-w-0 wrap-anywhere">
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
            className="button"
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
            className="field resize-y"
            placeholder="Where does the app handle sign-in?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            maxLength={1000}
            required
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending !== null || !question.trim()} className="button button-primary">
              {pending === "ask" ? "Searching…" : usesAi ? "Ask question" : "Find sources"}
            </button>
            <p className="text-sm opacity-80">
              {usesAi ? "Questions and matching excerpts are sent to OpenRouter." : "Search the index for matching excerpts."}
            </p>
          </div>
        </form>
      )}

      {index?.file_count === 0 && <p>This snapshot contains no eligible source files.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <p className="sr-only" role="status">
        {pending === "ask" ? "Searching the codebase." : result ? "Search results available." : ""}
      </p>
      {result && (
        <section aria-label="Search result" className="space-y-4">
          {result.answer && <Answer text={result.answer} />}
          {result.notice && <p>{result.notice}</p>}
          {result.sources.length > 0 && (
            <>
              <h2 className="font-semibold">Sources from <code className="text-sm">{result.commit.slice(0, 12)}</code></h2>
              <ol className="space-y-2">
                {result.sources.map((source, position) => {
                  const sourceHref = forgejoSourceFromRepoUrl(
                    repoUrl,
                    "commit",
                    result.commit,
                    source.path,
                    source.start_line,
                    source.end_line,
                  );
                  return (
                    <li key={`${source.path}:${source.start_line}`} className="rounded-md border border-line bg-panel">
                      <details>
                        <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm wrap-anywhere">
                          <span className="mr-2 text-muted">[{position + 1}]</span>
                          <code>{source.path}:{source.start_line}–{source.end_line}</code>
                        </summary>
                        <pre className="overflow-x-auto border-t border-line p-3 text-xs">
                          <code>{source.content}</code>
                        </pre>
                      </details>
                      {sourceHref && (
                        <a href={sourceHref} className="inline-flex min-h-11 items-center px-3 text-sm text-accent underline underline-offset-4">
                          Open source in Forgejo<span className="sr-only">: {source.path}, line {source.start_line}</span>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </section>
      )}
    </div>
  );
}
