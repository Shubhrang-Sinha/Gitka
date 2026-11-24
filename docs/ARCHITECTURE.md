# Architecture

Read this before adding a feature.

## Overview

Three pieces, all running locally in Docker or on your machine:

```
Browser  ->  Next.js app (web/, port 3000)  ->  PostgreSQL + pgvector (port 5432)
                       |  ^
                       |  |  webhooks (signed)
                       v  |
                     Forgejo REST API (port 3001)

Next.js app  ->  OpenRouter API (AI model for PR review)
```

- **Forgejo** hosts the git repositories. It has its own SQLite database and is only accessed through its REST API, never directly.
- **PostgreSQL** stores users, sessions, projects, membership, reviews, chat, and indexed source excerpts.
- **Next.js** (App Router, TypeScript, Tailwind, run with Bun) is both the UI and the API.

## Folder map

```
devplatform/
  docker-compose.yml        Postgres + Forgejo containers
  .env                      Docker secrets (git-ignored)
  docs/                     Documentation (this file)
  web/                      The Next.js app
    .env.local              App secrets (git-ignored). Template: .env.example
    migrations/             Numbered SQL files that build the schema
    scripts/migrate.ts      Runs pending migrations (bun run migrate)
    lib/                    Shared server helpers (see below)
    app/
      page.tsx              Placeholder home page
      login/page.tsx        Login form
      register/page.tsx     Register form
      projects/page.tsx     List of the user's projects + create form
      projects/[id]/page.tsx   Repo page: members, files, README
      api/auth/...          register, login, logout, me
      api/projects/route.ts            Create a project
      api/projects/[id]/members/route.ts   Add a member
      api/health/...        db and forgejo connection checks
      projects/[id]/pulls/page.tsx         Pull request list
      projects/[id]/pulls/[n]/page.tsx     PR detail page + AI review panel
      projects/[id]/pulls/[n]/review-panel.tsx   Client component: review button, status, comments
      api/projects/[id]/pulls/[n]/review/route.ts   POST start a review, GET latest review
      api/webhooks/forgejo/route.ts        Forgejo webhook: auto-review on PR open/update
```

`web/lib` and `web/migrations` live directly in `web/`, **not** inside `app/`.

## Shared helpers (`web/lib`)

| File          | What it gives you                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `db.ts`       | `pool`, the shared Postgres connection pool. Use `pool.query(sql, [values])`.                                              |
| `forgejo.ts`  | `forgejoFetch<T>(path)` for JSON and `forgejoFetchText(path)` for raw text. Both call `/api/v1` on Forgejo with the token. |
| `password.ts` | `hashPassword` and `verifyPassword` (bcrypt).                                                                              |
| `session.ts`  | `createSession`, `getCurrentUser()` (returns the user or `null`), `destroySession`.                                        |
| `forgejo-pulls.ts` | `listPulls`, `getPull`, `getPullDiff`, `forgejoPost` (uses the write token), `postReview`. |
| `diff.ts` | `parseDiff(raw)`: splits a diff per file, skips lockfiles/binaries/assets, decodes git-quoted paths, numbers lines, records valid comment lines. |
| `review.ts` | `reviewDiff(...)`: builds the prompt, calls OpenRouter via the Vercel AI SDK, validates findings against the diff. Falls back to a fake reviewer if `OPENROUTER_API_KEY` is unset. |
| `run-review.ts` | `startReview` (dedupe + claim) and `runReview` (review, save, post). Each attempt has an ownership token, so a stale worker can't overwrite its replacement. |

## Database

Tables created so far:

| Table               | Purpose                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `users`             | id, email (unique, stored lowercase), password_hash, display_name |
| `projects`          | id, name, forgejo_repo (`owner/name`, unique)                     |
| `project_members`   | project_id + user_id (composite key), role (`owner` or `member`)  |
| `sessions`          | random id (stored in the cookie), user_id, expires_at             |
| `schema_migrations` | which migration files have been applied                           |
| `pr_reviews` | One review per (project, PR, head commit): status (`pending`/`done`/`failed`), summary, model, token counts, `attempt_token`, `publish_started_at`. |
| `review_comments` | The findings of a review: path, line, severity, body, posted flag. |

Migration rules:

- Files in `web/migrations/` run in filename order. Run them with `bun run migrate`.
- **Never edit a migration that has already been applied.** Add a new file instead.
- To avoid number clashes, each increment owns a range: Inc 2 = 010-019, Inc 3 = 020-029, Inc 4 = 030-039, Inc 5 = 040-049. Always use three digits (`010_`, not `10_`).

## Authentication

1. `POST /api/auth/register` validates input, hashes the password, inserts a user.
2. `POST /api/auth/login` checks the password, creates a row in `sessions`, and sets an HttpOnly cookie `session_id` holding a random 32-byte ID.
3. Anything that needs to know who is calling uses `getCurrentUser()`, which looks the cookie up in `sessions` and returns the user, or `null`.
4. `POST /api/auth/logout` deletes the session row and clears the cookie.

## Access control

A logged-in user may only touch projects they have a `project_members` row for.

- Pages: call `getCurrentUser()`; if `null`, `redirect("/login")`.
- Project pages and routes: also query `project_members` for (project, user). No row means `notFound()` or a 404, so outsiders can't tell a project exists.
- Owner-only actions (like adding members) also check `role === 'owner'` and return 403 otherwise.
- The UI hides owner-only forms from members, but the API check is the real protection.

Copy `app/projects/[id]/page.tsx` and `app/api/projects/[id]/members/route.ts` as examples of this pattern.

## Team chat

Project members can read and send messages at `/projects/[id]/chat`. The client polls
`GET /api/projects/[id]/messages` for the latest 100 messages and sends messages with
`POST` to the same route. Both methods check membership. Messages are stored in
`chat_messages` and deleted with their project or author.

## Codebase Q&A

The `/projects/[id]/qa` page uses `GET /api/projects/[id]/qa` for index status and
`POST` to ask a question. Both require project membership. Owners can refresh the
index with `POST /api/projects/[id]/qa/index`. Indexing reads Forgejo source at a
specific default-branch commit, then stores searchable excerpts with file paths
and line ranges. Each snapshot covers up to 200 eligible text files and 800
excerpts. Refreshing replaces the old snapshot atomically. Answers use up to
six retrieved excerpts and include source references.
PostgreSQL keyword search works without a provider key. To add semantic search,
configure `QA_EMBEDDING_MODEL` and rebuild the index. With OpenRouter enabled,
configure projects for which sending source excerpts to the provider is permitted.

## Dashboard and request limits

The `/projects` dashboard lists only projects the signed-in user belongs to. It
shows the latest stored AI review activity and links to the project tools.
`web/lib/rate-limit.ts` uses PostgreSQL counters shared across app processes.
Login allows 10 attempts per minute per normalized email and 120 across the
instance. Registration allows 30 attempts per minute across the instance. Chat
allows 30 sends per minute per user. Q&A accepts 10 questions per minute per user
and three refresh requests per minute per project. Rate-limited responses include
`Retry-After`.
New and reset passwords are limited to 72 UTF-8 bytes for bcrypt compatibility.

## AI PR review (Increment 2)

Flow: PR opened or updated -> `startReview` -> `runReview` -> comments posted to Forgejo.

1. A review starts from the button (`POST /api/projects/[id]/pulls/[n]/review`, members only)
   or from the Forgejo webhook (`POST /api/webhooks/forgejo`, no login, HMAC-signed).
2. `startReview` fetches the PR and inserts a `pending` row. The unique key
   (project, PR, head SHA) means a commit is reviewed once. A `failed` row, or a
   `pending` row older than 10 minutes, can be taken over; the take-over issues a new
   `attempt_token`.
3. `runReview` runs in the background via `after()`: fetch diff, `parseDiff`, ask the model,
   validate findings against real diff lines (max 10), save to `review_comments`, claim
   publishing, post one review to Forgejo (event COMMENT, never approves), mark `done`.
   Every write is conditional on the attempt token.
4. The review panel polls `GET .../review` every 3 seconds while status is `pending`.

Rules:
- The diff is untrusted input. The prompt marks it as data, and the model only returns
  structured findings; it has no tools.
- The webhook verifies the signature before doing anything, and refuses all requests if
  `FORGEJO_WEBHOOK_SECRET` is unset. The head commit comes from Forgejo's API, not the payload.
- Free models (`openrouter/free`) are chosen at random and may log prompts. Use test
  repos only; pin `LLM_MODEL` for consistent quality.

## Conventions

- **Always use SQL placeholders** (`$1, $2`) and never build SQL by string concatenation.
- **Never return `password_hash`** to the client.
- Validate every input in API routes (type, length, format) and return clear JSON errors: `{ ok: false, error: "..." }` with a proper status code.
- **Server vs client components:** pages are server components by default and can query the database directly. Anything with typing or clicking needs `"use client"` at the top and calls an API route with `fetch`.
- **Cache Components is enabled** (Next.js 16). A page that reads cookies or the URL must put that work inside a component wrapped in `<Suspense>`. See `app/projects/page.tsx`.
- In Next.js 16, `params` is a Promise: `const { id } = await params;`.
- Secrets go only in `.env` and `web/.env.local`. **Never commit them**, and run `git status` before every commit.

## Environment variables (`web/.env.local`)

```
DATABASE_URL=postgresql://devplatform:YOUR_PASSWORD@localhost:5432/devplatform
FORGEJO_URL=http://localhost:3001
FORGEJO_TOKEN=your_forgejo_token_here
FORGEJO_WRITE_TOKEN=your_forgejo_write_token_here
FORGEJO_WEBHOOK_SECRET=your_random_secret_here
OPENROUTER_API_KEY=your_openrouter_key_here
LLM_MODEL=openrouter/free
QA_EMBEDDING_MODEL=
```

The Forgejo token is read-only (repository and user read). Features that write to Forgejo, like posting PR comments, need their own token with write permission.

## Running locally

1. Start Docker Desktop, then from the project root: `docker compose up -d`.
2. `cd web`, then `bun install`, `bun run migrate`, `bun run dev`.
3. Open http://localhost:3000 and register an account. Create a repo in Forgejo (http://localhost:3001), then link it from `/projects`.
4. For automatic reviews: set `FORGEJO__webhook__ALLOWED_HOST_LIST: private` on the forgejo
   service in `docker-compose.yml` (already done), then add a webhook in the repo's Settings:
   URL `http://host.docker.internal:3000/api/webhooks/forgejo`, JSON, the same secret as
   `FORGEJO_WEBHOOK_SECRET`, events Pull Request + Pull Request Synchronized.

## Adding a new feature: checklist

1. Branch from the latest `main`.
2. Schema changes go in a new migration in your number range.
3. Put server logic in an API route under `app/api/<feature>/` and shared logic in `web/lib/`.
4. Put pages under `app/projects/[id]/<feature>/` so they inherit the project URL.
5. Check login and membership in every page and route.
6. Test with the browser, or with `Invoke-RestMethod` in PowerShell.
7. Update this document if you add a table, route, or helper.

## Known gotchas

- Files created in the wrong folder cause confusing errors. `lib/`, `migrations/`, `scripts/` and `.env.local` all belong directly in `web/`.
- Next.js reads the saved file on disk. An unsaved editor tab causes errors like "default export is not a React Component".
- `.env.local` is only read at server start, so restart `bun run dev` after editing it.
- `bun run migrate` loads `.env.local` via `--env-file`.
- Windows PowerShell 5 has no `-SkipHttpErrorCheck`. Wrap calls in `try/catch` to see error statuses.
- Run `bun run migrate` from `web/`, not the project root.
- In `docker-compose.yml`, `environment:` uses `KEY: value` style; a `- KEY=value` line breaks it.
- VS Code can show a stale "cannot find module" error for a new file. Run "TypeScript: Restart TS Server".
- The review code swallows nothing silently: check the `error` column of `pr_reviews` and Forgejo's Recent Deliveries when a review doesn't appear.

## Status

- [x] Increment 1: Core platform (auth, projects, repo viewing, members)
- [x] Increment 2: AI PR review
- [x] Increment 3: Team chat
- [x] Increment 4: Codebase Q&A
- [x] Increment 5: Dashboard and hardening
