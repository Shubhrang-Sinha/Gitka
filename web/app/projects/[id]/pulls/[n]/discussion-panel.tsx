"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import type { PullComment } from "@/lib/forgejo-pulls";

const MAX_COMMENT_LENGTH = 4000;
const LOAD_FAILURE = "Could not load the discussion. Select Refresh comments to try again.";
const POST_FAILURE = "Could not confirm that Forgejo received your comment. Refresh comments before trying again.";

async function requestDiscussion<T>(
  url: string,
  fallbackError: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options }).catch(() => {
    throw new Error(fallbackError);
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : fallbackError);
  }
  return data as T;
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function DiscussionPanel({
  projectId,
  prNumber,
  forgejoPullUrl,
}: {
  projectId: number;
  prNumber: number;
  forgejoPullUrl: string | null;
}) {
  const url = `/api/projects/${projectId}/pulls/${prNumber}/comments`;
  const id = useId();
  const [comments, setComments] = useState<PullComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [postError, setPostError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    requestDiscussion<{ comments: PullComment[] }>(url, LOAD_FAILURE, {
      signal: controller.signal,
    })
      .then(({ comments }) => {
        if (!controller.signal.aborted) setComments(comments);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(messageFor(error, LOAD_FAILURE));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url]);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    setNotice("");
    try {
      const data = await requestDiscussion<{ comments: PullComment[] }>(url, LOAD_FAILURE);
      setComments(data.comments);
      setNotice("Discussion refreshed.");
    } catch (error) {
      setLoadError(messageFor(error, LOAD_FAILURE));
    } finally {
      setLoading(false);
    }
  }

  async function postComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || loading || posting || comments === null) return;

    setPosting(true);
    setPostError("");
    setNotice("");
    try {
      const { comment } = await requestDiscussion<{ comment: PullComment }>(url, POST_FAILURE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      setComments([...comments, comment]);
      setDraft("");
      setNotice("Comment posted to Forgejo.");
    } catch (error) {
      setPostError(messageFor(error, POST_FAILURE));
    } finally {
      setPosting(false);
    }
  }

  return (
    <section id="discussion" aria-labelledby={`${id}-heading`} className="scroll-mt-6 space-y-4 border-t border-line pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-lg font-semibold">Discussion</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || posting}
          className="button"
        >
          {loading ? "Loading comments…" : "Refresh comments"}
        </button>
      </div>

      <div aria-busy={loading}>
        {loadError && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {loadError} {comments !== null && "Showing the last loaded discussion."}
          </p>
        )}
        {comments?.length === 0 && !loadError && (
          <p className="text-sm text-muted">No comments yet.</p>
        )}
        {!!comments?.length && (
          <ol className="divide-y divide-line rounded border border-line">
            {comments.map((comment) => {
              // Retain Forgejo's comment anchor, using the public PR URL as its base.
              const fragment = `#issuecomment-${comment.id}`;
              const permalink = forgejoPullUrl && comment.html_url?.endsWith(fragment)
                ? forgejoPullUrl + fragment
                : null;
              return (
                <li key={comment.id} className="space-y-2 bg-panel p-4 first:rounded-t-[inherit] last:rounded-b-[inherit]">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 wrap-anywhere">
                    <span className="text-sm font-semibold">{comment.user?.login ?? "Unknown user"}</span>
                    <time className="text-xs text-muted" dateTime={comment.created_at}>
                      {new Date(comment.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                    {permalink && <a href={permalink} className="text-sm text-accent underline underline-offset-4">View comment in Forgejo</a>}
                  </div>
                  <p dir="auto" className="whitespace-pre-wrap wrap-anywhere text-sm sm:text-base">
                    {comment.body}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <form onSubmit={postComment} className="space-y-2">
        <label htmlFor={`${id}-comment`} className="block text-sm font-medium">Add a comment</label>
        <textarea
          id={`${id}-comment`}
          className="field min-h-24"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          readOnly={posting}
          maxLength={MAX_COMMENT_LENGTH}
          required
          aria-describedby={`${id}-attribution`}
        />
        <p id={`${id}-attribution`} className="text-sm text-muted">
          Comments are posted as your connected Forgejo account.
        </p>
        {postError && <p role="alert" className="text-sm text-danger">{postError}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="submit"
            disabled={!draft.trim() || loading || posting || comments === null}
            className="button button-primary"
          >
            {posting ? "Posting comment…" : "Post comment"}
          </button>
          <p role="status" className="text-sm text-muted">{notice}</p>
        </div>
      </form>
    </section>
  );
}
