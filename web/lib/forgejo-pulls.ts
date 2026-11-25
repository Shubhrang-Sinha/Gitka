import { ForgejoConfigurationError, ForgejoRequestError, forgejoFetch, forgejoFetchText } from "./forgejo";

export type PullRequest = {
  number: number;
  title: string;
  body: string;
  state: string;
  user: { login: string };
  head: { sha: string; ref: string; repo?: { full_name: string } | null };
  base: { ref: string };
  created_at: string;
};

export function listPulls(
  repo: string,
  state: "open" | "closed" | "all" = "open",
  signal?: AbortSignal,
) {
  return forgejoFetch<PullRequest[]>(`/repos/${repo}/pulls?state=${state}`, signal);
}

export function getPull(repo: string, number: number, signal?: AbortSignal) {
  return forgejoFetch<PullRequest>(`/repos/${repo}/pulls/${number}`, signal);
}

export async function getPullDiff(
  repo: string,
  number: number,
): Promise<string> {
  const diff = await forgejoFetchText(`/repos/${repo}/pulls/${number}.diff`);
  if (diff === null) {
    throw new Error(
      `Could not fetch diff for ${repo} PR #${number} (not found?)`,
    );
  }
  return diff;
}

export type PullComment = {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
  updated_at: string;
  html_url: string;
};

function pullCommentsPath(repo: string, number: number) {
  return `/repos/${repo}/issues/${number}/comments`;
}

function publicPullComment({ id, body, user, created_at, updated_at, html_url }: PullComment): PullComment {
  return { id, body, user: user ? { login: user.login } : null, created_at, updated_at, html_url };
}

export async function listPullComments(repo: string, number: number) {
  const signal = AbortSignal.timeout(8000);
  // Forgejo shares this endpoint with issues, so confirm the number is a PR.
  await getPull(repo, number, signal);
  const comments = await forgejoFetch<PullComment[]>(pullCommentsPath(repo, number), signal);
  return comments.map(publicPullComment);
}

export async function postPullComment(repo: string, number: number, body: string) {
  const signal = AbortSignal.timeout(8000);
  await getPull(repo, number, signal);
  const comment = await forgejoPost<PullComment>(pullCommentsPath(repo, number), { body }, signal);
  return publicPullComment(comment);
}

// Write helper: uses the separate write token for comments and reviews.
export async function forgejoPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const url = process.env.FORGEJO_URL;
  const token = process.env.FORGEJO_WRITE_TOKEN;
  if (!url || !token) {
    throw new ForgejoConfigurationError("FORGEJO_URL or FORGEJO_WRITE_TOKEN is not set");
  }
  const res = await fetch(`${url}/api/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new ForgejoRequestError(res.status, path);
  }
  return (await res.json()) as T;
}

import type { Finding } from "./review";

const SEVERITY_LABEL = {
  critical: "🔴 Critical",
  warning: "🟡 Warning",
  info: "🔵 Info",
} as const;

export async function postReview(
  repo: string,
  number: number,
  headSha: string,
  summary: string,
  findings: Finding[],
) {
  return forgejoPost<{ id: number }>(`/repos/${repo}/pulls/${number}/reviews`, {
    body: `🤖 **AI review**\n\n${summary}`,
    commit_id: headSha,
    event: "COMMENT", // plain comment review: never approves or blocks the PR
    comments: findings.map((f) => ({
      path: f.path,
      body: `**${SEVERITY_LABEL[f.severity]}**\n\n${f.body}`,
      new_position: f.line, // line number in the new version of the file
      old_position: 0,
    })),
  });
}
