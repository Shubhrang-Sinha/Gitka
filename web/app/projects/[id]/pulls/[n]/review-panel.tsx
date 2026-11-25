"use client";

import { useEffect, useRef, useState } from "react";
import { forgejoSourceFromRepoUrl } from "@/lib/forgejo-links";

type Review = {
  id: number;
  head_sha: string;
  status: "pending" | "done" | "failed";
  summary: string | null;
  error: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
};
type ReviewComment = {
  path: string;
  line: number;
  severity: "info" | "warning" | "critical";
  body: string;
};

type LoadResult =
  | { review: Review | null; comments: ReviewComment[] }
  | { error: string };

const BADGE: Record<ReviewComment["severity"], string> = {
  critical: "text-danger",
  warning: "text-foreground",
  info: "text-muted",
};

async function fetchReview(url: string, signal: AbortSignal): Promise<LoadResult> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { error: data.error ?? "Could not load the review" };
    }
    return { review: data.review, comments: data.comments };
  } catch {
    return { error: "Network error while loading the review" };
  }
}

export default function ReviewPanel({
  projectId,
  prNumber,
  headSha,
  repoUrl,
}: {
  projectId: number;
  prNumber: number;
  headSha: string;
  repoUrl: string | null;
}) {
  const base = `/api/projects/${projectId}/pulls/${prNumber}/review`;
  const [review, setReview] = useState<Review | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const keepPolling = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function load() {
      const result = await fetchReview(base, controller.signal);
      if (controller.signal.aborted) return;
      setLoading(false);
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setReview(result.review);
        setComments(result.comments);
        keepPolling.current = result.review?.status === "pending";
      }
      if (keepPolling.current) timer = setTimeout(load, "error" in result ? 6000 : 3000);
    }

    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [base, requestVersion]);

  function refresh() {
    setLoading(true);
    setRequestVersion((version) => version + 1);
  }

  async function start() {
    setBusy(true);
    setStartError(null);
    setNotice(null);
    try {
      const res = await fetch(base, { method: "POST", signal: AbortSignal.timeout(12000) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setStartError(data?.error ?? "Could not start the review.");
      } else if (data.started === false && data.status === "done") {
        setNotice("The latest commit has already been reviewed.");
      } else if (data.status === "pending") {
        keepPolling.current = true;
      }
    } catch {
      setStartError("Could not confirm that the review started. Check the updated status before retrying.");
    } finally {
      refresh();
      setBusy(false);
    }
  }

  const pending = review?.status === "pending";
  const latest = review?.head_sha === headSha;
  const complete = latest && review?.status === "done";
  let status = "No review yet";
  if (loading) status = "Checking review status…";
  else if (loadError) status = "Review status may be out of date";
  else if (pending) status = "Review in progress";
  else if (complete) status = "Latest commit reviewed";
  else if (review?.status === "done") status = "Earlier commit reviewed";
  else if (review?.status === "failed") status = "Review failed";

  return (
    <section id="ai-review" aria-labelledby="ai-review-heading" className="scroll-mt-6 space-y-4 rounded-xl border border-line bg-panel p-4 sm:p-6">
      <div>
        <h2 id="ai-review-heading" className="text-lg font-semibold">AI review</h2>
        <p role="status" className="mt-1 text-sm text-muted">{status}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {!complete && (
          <button
            type="button"
            onClick={start}
            disabled={busy || pending || loading || Boolean(loadError)}
            className="button button-primary"
          >
            {busy || pending ? "Reviewing…" : review?.status === "failed" && latest ? "Retry review" : "Review latest commit"}
          </button>
        )}
        {loadError && <button type="button" onClick={refresh} disabled={loading} className="button">Retry status check</button>}
        {pending && <span className="text-sm text-muted">This usually takes under a minute.</span>}
      </div>

      {loadError && <p role="alert" className="text-sm text-danger">{loadError}</p>}
      {startError && <p role="alert" className="text-sm text-danger">{startError}</p>}
      {notice && <p role="status" className="text-sm text-muted">{notice}</p>}

      {review?.status === "failed" && (
        <p role="alert" className="wrap-anywhere rounded border border-line p-3 text-sm text-danger">
          Review failed: {review.error ?? "unknown error"}
        </p>
      )}

      {review?.status === "done" && (
        <div className="space-y-3">
          {review.summary && <p className="max-w-[72ch] wrap-anywhere text-sm leading-relaxed">{review.summary}</p>}
          <p className="wrap-anywhere text-sm text-muted">
            Model: {review.model} · {review.input_tokens ?? "?"} tokens in,{" "}
            {review.output_tokens ?? "?"} out
          </p>
          {comments.length === 0 && <p className="text-sm">No issues found.</p>}
          <ul className="space-y-2">
            {comments.map((c, i) => {
              const sourceHref = forgejoSourceFromRepoUrl(repoUrl, "commit", review.head_sha, c.path, c.line);
              return (
                <li key={i} className="rounded-md border border-line p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded border border-line px-2 py-0.5 text-xs font-semibold capitalize ${BADGE[c.severity]}`}>
                      {c.severity}
                    </span>
                    {sourceHref ? (
                      <a href={sourceHref} className="min-w-0 wrap-anywhere text-accent underline underline-offset-4">
                        <code>{c.path}:{c.line}</code><span className="sr-only"> in Forgejo</span>
                      </a>
                    ) : <code className="min-w-0 wrap-anywhere">{c.path}:{c.line}</code>}
                  </div>
                  <p className="whitespace-pre-wrap wrap-anywhere text-sm">{c.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
