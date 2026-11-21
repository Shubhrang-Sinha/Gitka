"use client";

import { useCallback, useEffect, useState } from "react";

type Review = {
  id: number;
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
  critical: "bg-red-100 text-red-800",
  warning: "bg-yellow-100 text-yellow-800",
  info: "bg-blue-100 text-blue-800",
};

// Pure network helper: it never touches React state.
async function fetchReview(url: string): Promise<LoadResult> {
  try {
    const res = await fetch(url, { cache: "no-store" });
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
}: {
  projectId: number;
  prNumber: number;
}) {
  const base = `/api/projects/${projectId}/pulls/${prNumber}/review`;
  const [review, setReview] = useState<Review | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Copies a load result into state. Only ever called from async callbacks.
  const apply = useCallback((result: LoadResult) => {
    if ("error" in result) {
      setError(result.error);
    } else {
      setReview(result.review);
      setComments(result.comments);
      setError(null);
    }
    setLoading(false);
  }, []);

  // Re-fetch on demand (after a click, and while polling).
  const load = useCallback(async () => {
    apply(await fetchReview(base));
  }, [base, apply]);

  // Initial load. State is set in the .then callback, not in the effect body.
  useEffect(() => {
    let cancelled = false;
    fetchReview(base).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [base, apply]);

  // Poll while a review is running.
  useEffect(() => {
    if (review?.status !== "pending") return;
    const timer = setInterval(() => {
      load();
    }, 3000);
    return () => clearInterval(timer);
  }, [review?.status, load]);

  async function start() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(base, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not start the review");
      } else if (data.started === false && data.status === "done") {
        setNotice("The latest commit has already been reviewed.");
      }
      await load();
    } catch {
      setError("Network error while starting the review");
    } finally {
      setBusy(false);
    }
  }

  const pending = review?.status === "pending";

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={start}
          disabled={busy || pending || loading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? "Reviewing..." : review ? "Review latest commit" : "Review this PR"}
        </button>
        {pending && <span className="text-sm text-gray-500">This usually takes under a minute.</span>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-gray-600">{notice}</p>}

      {review?.status === "failed" && (
        <p className="rounded border border-red-300 p-3 text-sm text-red-700">
          Review failed: {review.error ?? "unknown error"}
        </p>
      )}

      {review?.status === "done" && (
        <div className="space-y-3">
          {review.summary && <p className="text-sm">{review.summary}</p>}
          <p className="text-xs text-gray-500">
            Model: {review.model} · {review.input_tokens ?? "?"} tokens in,{" "}
            {review.output_tokens ?? "?"} out
          </p>
          {comments.length === 0 && <p className="text-sm">No issues found.</p>}
          <ul className="space-y-2">
            {comments.map((c, i) => (
              <li key={i} className="rounded border p-3">
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span className={`rounded px-2 py-0.5 text-xs ${BADGE[c.severity]}`}>
                    {c.severity}
                  </span>
                  <code>
                    {c.path}:{c.line}
                  </code>
                </div>
                <p className="whitespace-pre-wrap text-sm">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}