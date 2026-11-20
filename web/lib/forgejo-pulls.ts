import { forgejoFetch, forgejoFetchText } from "./forgejo";

export type PullRequest = {
  number: number;
  title: string;
  body: string;
  state: string;
  user: { login: string };
  head: { sha: string; ref: string };
  base: { ref: string };
  created_at: string;
};

export function listPulls(
  repo: string,
  state: "open" | "closed" | "all" = "open",
) {
  return forgejoFetch<PullRequest[]>(`/repos/${repo}/pulls?state=${state}`);
}

export function getPull(repo: string, number: number) {
  return forgejoFetch<PullRequest>(`/repos/${repo}/pulls/${number}`);
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

// Write helper: uses the separate write token, only for posting reviews.
export async function forgejoPost<T>(path: string, body: unknown): Promise<T> {
  const url = process.env.FORGEJO_URL;
  const token = process.env.FORGEJO_WRITE_TOKEN;
  if (!url || !token) {
    throw new Error("FORGEJO_URL or FORGEJO_WRITE_TOKEN is not set");
  }
  const res = await fetch(`${url}/api/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Forgejo POST ${path} failed: ${res.status} ${await res.text()}`,
    );
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
