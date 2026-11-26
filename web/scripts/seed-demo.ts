import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { indexCodebase } from "../lib/codebase-index";
import { pool } from "../lib/db";
import { forgejoFetch } from "../lib/forgejo";
import { hashPassword, verifyPassword } from "../lib/password";

const slug = "gitka-demo";
const projectName = "Lantern Schedule";
const marker = "Gitka demo fixture · Lantern Schedule";
const credentialsFile = new URL("../.env.demo.json", import.meta.url);
const source = `export const DEFAULT_INTERVAL_MINUTES = 17;

export function nextLanternCheck(now: Date, interval = DEFAULT_INTERVAL_MINUTES) {
  return new Date(now.getTime() + interval * 60_000);
}
`;

type Account = { email: string; password: string };

type Repository = { full_name: string; description: string; default_branch: string; private: boolean };
type Pull = { number: number; state: string; head: { sha: string; ref: string }; base: { ref: string } };

const username = "gitka-demo";
const email = "test@thapar.edu";
const envFile = new URL("../.env.local", import.meta.url);
const run = promisify(execFile);

async function bootstrapForgejo(base: URL, account: Account) {
  const api = (path: string) => new URL(`api/v1${path}`, base);
  const basic = "Basic " + Buffer.from(`${username}:${account.password}`).toString("base64");
  const identity = (authorization: string) => fetch(api("/user"), {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(10000),
  });
  const compose = ["compose", "exec", "-T", "--user", "git", "forgejo", "forgejo", "admin", "user"];
  if (!(await identity(basic)).ok) {
    const cwd = fileURLToPath(new URL("../../", import.meta.url));
    try {
      await run("docker", [...compose, "create", "--username", username, "--email", email,
        "--password", account.password, "--must-change-password=false"], { cwd });
    } catch {
      throw new Error("Could not create the local Forgejo demo account. Check that Compose is running and the account does not already have a different password.");
    }
  }
  const verified = await identity(basic);
  if (!verified.ok) throw new Error("Could not sign in to Forgejo as the demo account.");
  const user = await verified.json() as { login: string; email: string };
  if (user.login !== username || user.email !== email) {
    throw new Error("The Forgejo demo account has an unexpected identity.");
  }

  const env = await readFile(envFile, "utf8");
  let updated = env;
  for (const [key, scopes] of [
    ["FORGEJO_TOKEN", ["read:user", "read:repository", "read:issue"]],
    ["FORGEJO_WRITE_TOKEN", ["read:user", "write:repository", "write:issue"]],
  ] as const) {
    const previous = process.env[key];
    if (previous) {
      const response = await identity("token " + previous);
      if (response.ok && (await response.json() as { login: string }).login === username) continue;
    }
    const response = await fetch(api(`/users/${username}/tokens`), {
      method: "POST",
      headers: { Authorization: basic, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `gitka-demo-${key.toLowerCase()}-${randomUUID()}`, scopes }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Could not create ${key}: Forgejo returned HTTP ${response.status}.`);
    const { sha1: token } = await response.json() as { sha1: string };
    if (!token) throw new Error(`Forgejo did not return ${key}.`);
    process.env[key] = token;
    const setting = new RegExp(`^${key}=.*$`, "m");
    updated = setting.test(updated) ? updated.replace(setting, `${key}=${token}`)
      : `${updated.trimEnd()}\n${key}=${token}\n`;
    await writeFile(envFile, updated, { mode: 0o600 });
  }
  // Create a public PKCE OAuth client for the local Gitka callback. Preserve the
  // encryption key across seeds so previously linked accounts remain readable.
  const redirect = process.env.FORGEJO_OAUTH_REDIRECT_URI || "http://localhost:3000/api/auth/forgejo/callback";
  const appsResponse = await fetch(api("/user/applications/oauth2"), { headers: { Authorization: basic }, signal: AbortSignal.timeout(10000) });
  if (!appsResponse.ok) throw new Error(`Could not list Forgejo OAuth applications: HTTP ${appsResponse.status}.`);
  const applications = await appsResponse.json() as { client_id: string; name: string; confidential_client: boolean; redirect_uris: string[] }[];
  let application = applications.find((app) => app.name === "Gitka local" && !app.confidential_client && app.redirect_uris.includes(redirect));
  if (!application) {
    const response = await fetch(api("/user/applications/oauth2"), {
      method: "POST", headers: { Authorization: basic, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Gitka local", confidential_client: false, redirect_uris: [redirect] }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Could not register Gitka OAuth application: HTTP ${response.status}.`);
    application = await response.json();
  }
  if (!application?.client_id) throw new Error("Forgejo did not return an OAuth client ID.");
  for (const [key, value] of Object.entries({
    FORGEJO_OAUTH_CLIENT_ID: application.client_id,
    FORGEJO_OAUTH_REDIRECT_URI: redirect,
    FORGEJO_TOKEN_ENCRYPTION_KEY: process.env.FORGEJO_TOKEN_ENCRYPTION_KEY || randomBytes(32).toString("hex"),
  })) {
    process.env[key] = value;
    const setting = new RegExp(`^${key}=.*$`, "m");
    updated = setting.test(updated) ? updated.replace(setting, `${key}=${value}`) : `${updated.trimEnd()}\n${key}=${value}\n`;
  }
  await writeFile(envFile, updated, { mode: 0o600 });

  // Ensure an internal Forgejo admin service token for email checks and user provisioning.
  let adminToken = process.env.FORGEJO_ADMIN_TOKEN?.trim() || "";
  let adminValid = false;
  if (adminToken) {
    const check = await identity("token " + adminToken);
    if (check.ok && (await check.json() as { is_admin?: boolean }).is_admin === true) {
      adminValid = true;
    }
  }
  if (!adminValid) {
    const cwd = fileURLToPath(new URL("../../", import.meta.url));
    const adminUser = "gitka-admin";
    const scopes = "write:admin,read:admin,write:user,read:user";
    const tokenName = `gitka-onboarding-${randomUUID()}`;
    try {
      const { stdout } = await run("docker", [
        ...compose, "generate-access-token",
        "--username", adminUser, "--token-name", tokenName, "--scopes", scopes, "--raw",
      ], { cwd });
      adminToken = stdout.trim().split(/\s+/).at(-1) ?? "";
    } catch {
      const { stdout } = await run("docker", [
        ...compose, "create",
        "--username", adminUser, "--email", "gitka-admin@gitka.local",
        "--admin", "--random-password", "--must-change-password=false",
        "--access-token", "--access-token-name", tokenName, "--access-token-scopes", scopes,
      ], { cwd });
      const match = stdout.match(/Access token was successfully created\.\.\.\s+(\S+)/);
      adminToken = match?.[1] ?? "";
    }
    if (!adminToken) throw new Error("Could not provision FORGEJO_ADMIN_TOKEN.");
    process.env.FORGEJO_ADMIN_TOKEN = adminToken;
    const setting = /^FORGEJO_ADMIN_TOKEN=.*$/m;
    updated = setting.test(updated)
      ? updated.replace(setting, `FORGEJO_ADMIN_TOKEN=${adminToken}`)
      : `${updated.trimEnd()}\nFORGEJO_ADMIN_TOKEN=${adminToken}\n`;
    await writeFile(envFile, updated, { mode: 0o600 });
  }

  return basic;
}

function forgejoClient(base: URL, authorization: string) {
  return async function request<T>(path: string, method = "GET", body?: object, allowMissing = false): Promise<T | null> {
    const response = await fetch(new URL(`api/v1${path}`, base), {
      method,
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`Forgejo ${method} ${path} returned HTTP ${response.status}`);
    return await response.json() as T;
  };
}

async function seedRepository(request: ReturnType<typeof forgejoClient>, login: string) {
  const repoPath = `/repos/${encodeURIComponent(login)}/${slug}`;
  const repo = await request<Repository>(repoPath, "GET", undefined, true)
    ?? await request<Repository>("/user/repos", "POST", {
      name: slug, description: marker, private: true, auto_init: true, default_branch: "main",
    });
  if (!repo?.private || repo.description !== marker || repo.default_branch !== "main") {
    throw new Error(`Will not seed ${login}/${slug} because it does not match the private demo repository.`);
  }
  // Verify that the normal app token can read this repository before populating it.
  await forgejoFetch(repoPath);

  async function ensureFile(branch: string, path: string, content: string) {
    const endpoint = `${repoPath}/contents/${path}`;
    if (await request(endpoint + `?ref=${branch}`, "GET", undefined, true)) return;
    await request(endpoint, "POST", {
      branch, content: Buffer.from(content).toString("base64"), message: `Add ${path}`,
    });
  }

  await ensureFile("main", "docs/lantern-schedule.md", `# Lantern Schedule

The default inspection interval is 17 minutes. The \`nextLanternCheck\` helper
in \`src/schedule.ts\` calculates the next check from a start time.
`);
  await ensureFile("main", "src/schedule.ts", source);

  async function ensurePull(branch: string, title: string, path: string, content: string) {
    if (!await request(`${repoPath}/branches/${branch}`, "GET", undefined, true)) {
      await request(`${repoPath}/branches`, "POST", { new_branch_name: branch, old_branch_name: "main" });
    }
    await ensureFile(branch, path, content);
    const pulls = await request<Pull[]>(`${repoPath}/pulls?state=all&head=${branch}&base=main`);
    const pull = pulls?.find((candidate) => candidate.head.ref === branch && candidate.base.ref === "main")
      ?? await request<Pull>(`${repoPath}/pulls`, "POST", { title, head: branch, base: "main" });
    if (!pull) throw new Error(`Could not seed pull request for ${branch}.`);
    return pull;
  }

  const open = await ensurePull("demo-interval", "Add a custom lantern interval", "src/custom-interval.ts", `import { nextLanternCheck } from "./schedule";

// The supplied minutes should be passed through unchanged.
export function customLanternCheck(now: Date, minutes: number) {
  return nextLanternCheck(now, minutes * 60);
}
`);
  const archived = await ensurePull("demo-archived", "Add a lantern checklist", "docs/checklist.md",
    "# Inspection checklist\n\nCheck the battery and record the inspection time.\n");
  if (archived.state === "open") {
    await request(`${repoPath}/pulls/${archived.number}`, "PATCH", { state: "closed" });
  }
  return { repository: repo.full_name, open, archived };
}

async function ensureUser(client: PoolClient, account: Account, name: string) {
  await client.query(
    "INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
    [account.email, name, await hashPassword(account.password)],
  );
  const { rows: [user] } = await client.query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = $1", [account.email],
  );
  if (!await verifyPassword(account.password, user.password_hash)) {
    throw new Error("A demo account already exists with a different password.");
  }
  return user.id;
}

async function seedProject(client: PoolClient, account: Account, repository: string, archived: Pull) {
  const owner = await ensureUser(client, account, "Demo Owner");
  const { rows: [created] } = await client.query<{ id: string }>(
    "INSERT INTO projects (name, forgejo_repo) VALUES ($1, $2) ON CONFLICT (forgejo_repo) DO NOTHING RETURNING id",
    [projectName, repository],
  );
  let projectId = created?.id;
  if (projectId) {
    await client.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')", [projectId, owner]);
  } else {
    const { rows: [existing] } = await client.query<{ id: string }>(
      `SELECT p.id FROM projects p JOIN project_members m ON m.project_id = p.id
        WHERE p.forgejo_repo = $1 AND m.user_id = $2 AND m.role = 'owner'`,
      [repository, owner],
    );
    if (!existing) throw new Error("The demo repository is already linked to a project owned by another account.");
    projectId = existing.id;
  }
  const message = "Try reviewing the open pull request, then ask Codebase Q&A about the default lantern inspection interval.";
  await client.query(
    `INSERT INTO project_chat_messages (project_id, user_id, body)
     SELECT $1, $2, $3 WHERE NOT EXISTS (
       SELECT 1 FROM project_chat_messages WHERE project_id = $1 AND user_id = $2 AND body = $3
     )`,
    [projectId, owner, message],
  );
  await client.query(
    `INSERT INTO pr_reviews (project_id, pr_number, head_sha, status, summary, model, created_by)
     VALUES ($1, $2, $3, 'done', $4, 'demo-fixture', $5)
     ON CONFLICT (project_id, pr_number, head_sha) DO NOTHING`,
    [projectId, archived.number, archived.head.sha, "Demo fixture: this change adds an inspection checklist. No issues found.", owner],
  );
  await client.query(
    `INSERT INTO review_comments (review_id, path, line, severity, body)
     SELECT r.id, 'docs/checklist.md', 3, 'info', $4 FROM pr_reviews r
      WHERE r.project_id = $1 AND r.pr_number = $2 AND r.head_sha = $3 AND r.model = 'demo-fixture'
        AND NOT EXISTS (SELECT 1 FROM review_comments c WHERE c.review_id = r.id)`,
    [projectId, archived.number, archived.head.sha, "Consider linking to the schedule so teammates can check the inspection interval."],
  );
  return projectId;
}

async function main() {
  const url = process.env.FORGEJO_URL;
  const password = process.env.GITKA_DEMO_PASSWORD;
  if (!url || !password || !process.env.DATABASE_URL) {
    throw new Error("Set DATABASE_URL, FORGEJO_URL, and GITKA_DEMO_PASSWORD in .env.local.");
  }
  const account = { email, password };
  const base = new URL(url.replace(/\/?$/, "/"));
  const database = new URL(process.env.DATABASE_URL);
  if (![base, database].every(({ hostname }) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname))) {
    throw new Error("The demo seed requires local PostgreSQL and Forgejo URLs.");
  }
  const client = await pool.connect();
  let demo: Awaited<ReturnType<typeof seedRepository>>;
  let projectId: string;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [163621792]);
    const basic = await bootstrapForgejo(base, account);
    demo = await seedRepository(forgejoClient(base, basic), username);
    projectId = await seedProject(client, account, demo.repository, demo.archived);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const index = await indexCodebase(projectId, demo.repository);
  console.log(`Demo project: http://localhost:3000/projects/${projectId}`);
  console.log(`Forgejo repository: ${new URL(demo.repository, base)}`);
  console.log(`Open PR #${demo.open.number} · Closed PR #${demo.archived.number} · ${index.file_count} indexed files`);
  await writeFile(credentialsFile, JSON.stringify({ owner: account }, null, 2) + "\n", { mode: 0o600 });
  console.log(`Demo sign-in for both apps: ${email}. Password is stored in web/.env.demo.json.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exitCode = 1;
}).finally(() => pool.end());
