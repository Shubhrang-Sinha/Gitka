import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

// Use --write only with a disposable PR. The two test comments are retained.
type Account = { email: string; password: string };
type Comment = { id: number; body: string };
type Comments = { ok: boolean; comments: Comment[] };

const [, , projectId, repository, pr, option] = process.argv;
if (!/^\d+$/.test(projectId ?? "") || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") ||
    !/^[1-9]\d*$/.test(pr ?? "") || (option !== undefined && option !== "--write")) {
  console.error("Usage: bun --env-file=.env.local scripts/test-demo-e2e.ts PROJECT_ID OWNER/REPO PR_NUMBER [--write]");
  process.exit(1);
}

function localUrl(value: string) {
  const url = new URL(value);
  assert(
    ["http:", "https:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    "Use local HTTP demo services",
  );
  return url;
}

const app = localUrl(process.env.GITKA_TEST_URL ?? "http://localhost:3000");
const forgejo = localUrl(process.env.FORGEJO_URL ?? "http://localhost:3001");
const readToken = process.env.FORGEJO_TOKEN;
const writeToken = process.env.FORGEJO_WRITE_TOKEN;
assert(readToken, "FORGEJO_TOKEN is required");
if (option === "--write") assert(writeToken, "FORGEJO_WRITE_TOKEN is required with --write");
const credentials = JSON.parse(await readFile(new URL("../.env.demo.json", import.meta.url), "utf8")) as {
  owner: Account;
};

const detail = `/projects/${projectId}/pulls/${pr}`;
const discussion = `/api${detail}/comments`;
const remoteDiscussion = `/api/v1/repos/${repository}/issues/${pr}/comments`;

async function request(label: string, base: URL, path: string, status: number, init?: RequestInit) {
  const response = await fetch(new URL(path, base), {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, status, `${label}: unexpected HTTP status`);
  console.log(`PASS ${label} (${status})`);
  return response;
}

function post(value: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
  };
}

async function testOwner() {
  const role = "owner";
  const login = await request(`${role} login`, app, "/api/auth/login", 200, post(credentials[role]));
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert(cookie && cookie.startsWith("session_id="), "Login must set the session cookie");
  const headers = { Cookie: cookie };

  try {
    await request(`${role} session`, app, "/api/auth/me", 200, { headers });
    const dashboard = await request(`${role} dashboard`, app, "/projects", 200, { headers });
    assert((await dashboard.text()).includes("Lantern Schedule"), "Demo project missing from dashboard");
    const pullPage = await request(`${role} PR detail`, app, detail, 200, { headers });
    const detailHtml = await pullPage.text();
    assert(detailHtml.includes("Open repository in Forgejo"), "Expected project-level Forgejo navigation");
    assert(detailHtml.includes("View in Forgejo") && detailHtml.includes(`/${repository}/pulls/${pr}`),
      "Expected a Forgejo link to this PR");
    await request(`${role} reads discussion`, app, discussion, 200, { headers });
    await request(`${role} blank comment rejected`, app, discussion, 400, post({ body: "   " }, headers));

    if (option === "--write") {
      const marker = randomUUID();
      const gitkaBody = `Gitka E2E ${marker}`;
      const forgejoBody = `Forgejo E2E ${marker}`;
      const created = await request("Gitka posts comment", app, discussion, 201, post({ body: gitkaBody }, headers));
      const { comment: gitkaComment } = await created.json() as { comment: Comment };
      const remoteHeaders = { Authorization: `token ${readToken}` };
      const singleComment = `/api/v1/repos/${repository}/issues/comments/${gitkaComment.id}`;
      const remote = await request("Forgejo reads Gitka comment", forgejo, singleComment, 200, { headers: remoteHeaders });
      assert.equal((await remote.json() as Comment).body, gitkaBody);

      const reply = await request("Forgejo posts reply", forgejo, remoteDiscussion, 201,
        post({ body: forgejoBody }, { Authorization: `token ${writeToken}` }));
      const forgejoComment = await reply.json() as Comment;
      const refresh = await request("Gitka refreshes discussion", app, discussion, 200, { headers });
      const { comments } = await refresh.json() as Comments;
      assert(comments.some(({ id, body }) => id === gitkaComment.id && body === gitkaBody),
        "Gitka comment missing from the shared PR discussion");
      assert(comments.some(({ id, body }) => id === forgejoComment.id && body === forgejoBody),
        "Forgejo reply missing from the Gitka discussion");
    }
  } finally {
    await request(`${role} logout`, app, "/api/auth/logout", 200, { method: "POST", headers });
  }

  await request(`${role} old session rejected`, app, "/api/auth/me", 401, { headers });
  await request(`${role} logged-out discussion rejected`, app, discussion, 401, { headers });
}

await request("Signed-out discussion read rejected", app, discussion, 401);
await request("Signed-out comment write rejected", app, discussion, 401, post({ body: "Signed-out test" }));
await testOwner();
