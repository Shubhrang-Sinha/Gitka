# Architecture

Read this before adding a feature.

## Overview

Three pieces, all running locally in Docker or on your machine:

```
Browser  ->  Next.js app (web/, port 3000)  ->  PostgreSQL + pgvector (host port 5433)
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
      api/projects/[id]/channels/route.ts  List chat channels
      api/projects/[id]/channels/[channelId]/messages/route.ts  Get history / post message
      api/projects/[id]/channels/[channelId]/events/route.ts    SSE real-time stream
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
| `forgejo.ts`  | `forgejoFetchAs`, `forgejoFetchTextAs`, and `forgejoPostAs` use a connected user’s OAuth token; service-token helpers remain for demo setup. |
| `forgejo-onboarding.ts` | `checkForgejoEmail` and `createForgejoUser` verify whether a registering email exists in Forgejo and provision missing accounts before OAuth linking. |
| `password.ts` | `hashPassword` and `verifyPassword` (bcrypt).                                                                              |
| `session.ts`  | `createSession`, `getCurrentUser()` (returns the user or `null`), `destroySession`.                                        |
| `forgejo-pulls.ts` | `listPulls`, `getPull`, `getPullDiff`, and `postReview` access Forgejo pull requests. |
| `diff.ts` | `parseDiff(raw)`: splits a diff per file, skips lockfiles/binaries/assets, decodes git-quoted paths, numbers lines, records valid comment lines. |
| `review.ts` | `reviewDiff(...)`: builds the prompt, calls OpenRouter via the Vercel AI SDK, validates findings against the diff. Falls back to a fake reviewer if `OPENROUTER_API_KEY` is unset. |
| `run-review.ts` | `startReview` (dedupe + claim) and `runReview` (review, save, post). Each attempt has an ownership token, so a stale worker can't overwrite its replacement. |

## Database

Tables created so far:

| Table | Purpose |
|---|---|
| `users` | id, email (unique, stored lowercase), password_hash, display_name |
| `projects` | id, name, forgejo_repo (`owner/name`, unique) |
| `project_members` | project_id + user_id (composite key), role (`owner` or `member`) |
| `sessions` | random id (stored in the cookie), user_id, expires_at |
| `chat_channels` | id, project_id (references `projects`, cascades on delete), name, created_at; unique constraint on `(project_id, name)` |
| `chat_messages` | id, channel_id (references `chat_channels`, cascades on delete), user_id (references `users`, cascades on delete), content (1 to 2000 chars), created_at |
| `schema_migrations` | which migration files have been applied |

Chat constraints and indexes:
- `chat_channels` enforces unique channel names per project (`UNIQUE (project_id, name)`), which also indexes queries filtering by `project_id`.
- `chat_messages` enforces content length via check constraint `CHECK (char_length(trim(content)) BETWEEN 1 AND 2000)`.
- `chat_messages` uses a composite index `chat_messages_channel_created_idx` on `(channel_id, created_at, id)` to optimize chronological message retrieval and cursor-based pagination.

Migration rules:

- Files in `web/migrations/` run in filename order. Run them with `bun run migrate`.
- **Never edit a migration that has already been applied.** Add a new file instead.
- To avoid number clashes, each increment owns a range: Inc 2 = 010-019, Inc 3 = 020-029, Inc 4 = 030-039, Inc 5 = 040-049. Always use three digits (`010_`, not `10_`).

## Authentication

1. `POST /api/auth/register` validates input, hashes the password, inserts a user, creates a session, and checks whether the email already exists in Forgejo.
2. If the email does not exist in Forgejo, `/register` and `/connect-forgejo` prompt the user to create a Forgejo account via `POST /api/auth/forgejo/register` before starting OAuth (`/api/auth/forgejo/start`). If it already exists, `/connect-forgejo` prompts only for OAuth connection.
3. `POST /api/auth/login` checks the password, creates a row in `sessions`, and sets an HttpOnly cookie `session_id` holding a random 32-byte ID.
4. Anything that needs to know who is calling uses `getCurrentUser()`, which looks the cookie up in `sessions` and returns the user (if connected to Forgejo), or `null`.
5. `POST /api/auth/logout` deletes the session row and clears the cookie.

## Access control

A logged-in user may only touch projects they have a `project_members` row for.

- Pages: call `getCurrentUser()`; if `null`, `redirect("/login")`.
- Project pages and routes: also query `project_members` for (project, user). No row means `notFound()` or a 404, so outsiders can't tell a project exists.
- Owner-only actions (like adding members) also check `role === 'owner'` and return 403 otherwise.
- The UI hides owner-only forms from members, but the API check is the real protection.

Copy `app/projects/[id]/page.tsx` and `app/api/projects/[id]/members/route.ts` as examples of this pattern.

## Pull request discussion

Project routes share a header with the active tool and a link to the same
repository in Forgejo. `web/lib/forgejo-links.ts` builds browser-facing
repository, PR, and source URLs. Set `FORGEJO_PUBLIC_URL` if the browser uses
a different Forgejo address from the server-side `FORGEJO_URL`. A browser
session also needs permission to open a private repository in Forgejo.

Forgejo owns pull requests and their published discussion. Gitka reads the
current comments through `GET /api/projects/[id]/pulls/[n]/comments` and submits
new comments through `POST` on the same route. Both operations check Gitka
project membership. Refreshing the discussion reads Forgejo again. Gitka
stores no copy of the comments.

Comments submitted from Gitka use the connected user’s Forgejo identity. AI review status remains in PostgreSQL, and published reviews remain visible in Forgejo. Webhook-triggered reviews run as a connected project owner.

`POST /api/repositories` creates a Forgejo repository and links it to a Gitka project. `POST /api/projects/[id]/pulls` creates a pull request as the connected user. The pull request page displays a bounded diff and branch selectors for the same repository.

## Team chat

Project members can read and send messages at `/projects/[id]/chat`. The client polls
`GET /api/projects/[id]/messages` for the latest 100 messages and sends messages with
`POST` to the same route. Both methods check membership. Messages are stored in
`project_chat_messages` and deleted with their project or author.

## Codebase Q&A

The project assistant stores private, user-owned conversations in `qa_conversations`
and messages with commit-pinned sources in `qa_messages`. Every request checks
project membership, Forgejo repository access, and conversation ownership. The model receives the last 12
messages (bounded to 4,000 characters each) and has read-only search, path-listing,
and file-range tools. Each run is limited to six model steps and 60 seconds.
Repository text is untrusted; model outputs can be wrong and citations are inspectable.

On opening Q&A, Gitka checks the Forgejo default-branch head and enqueues an index
job if needed. Owners may retry failures. `qa_index_jobs` records durable jobs;
The worker uses a connected project owner’s Forgejo credentials and fails closed if no owner is connected. `bun run qa:worker` must run as a separate long-lived process with the same
configuration as the web app. PostgreSQL claims jobs with a lease and recovers
expired claims. Indexing keeps the prior snapshot on failure and atomically replaces
it on success. Snapshots cover at most 200 eligible text files, 800 excerpts, and
32 KB per file. Paths with common secrets or dependencies and files containing some
recognizable credentials are excluded; this is not comprehensive secret detection.
Review repository contents and provider settings before enabling AI. Messages, retrieved code, and source chunks used for semantic indexing are sent to OpenRouter.

PostgreSQL full-text search is combined with pgvector similarity when an OpenRouter
embedding model is configured with `QA_EMBEDDING_MODEL`. Without one, the UI
explicitly reports keyword-only retrieval. A tool-capable `LLM_MODEL` and
`OPENROUTER_API_KEY` are required for answers. Indexes are bounded snapshots and
cannot guarantee that an answer covers every file or recent unindexed change.

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

## Channel chat API

Project-scoped text chat channels with real-time delivery via Server-Sent Events (SSE).

### Channels
- Every project has chat channels. When a new project is created, a default `general` channel is automatically inserted in the same transaction.
- Migration `020_create_chat_tables.sql` backfills a default `general` channel for any existing projects.
- `chat_channels` enforces a unique constraint on `(project_id, name)`.

### Routes
- `GET /api/projects/[id]/channels`: lists all channels for a project ordered chronologically.
- `GET /api/projects/[id]/channels/[channelId]/messages`: retrieves message history in chronological order.
  - Returns sender `id` and `display_name` (sender email is never exposed).
  - Defaults to the latest 50 messages, up to a maximum `limit` of 100.
  - Supports stable cursor-based pagination using `(created_at, id)` via `?cursor=<base64url>` or `?before_created_at=...&before_id=...`. Invalid limit or cursor values return 400.
- `POST /api/projects/[id]/channels/[channelId]/messages`: sends a text message.
  - Validates that `content` trimmed length is 1 to 2,000 characters (returns 400 if invalid).
  - Atomically inserts the message and triggers a PostgreSQL notification (`SELECT pg_notify(...)`) in a single transaction. If the transaction rolls back, no notification is sent.
  - The notification payload contains strictly `channelId` and `messageId` (no user-generated text).
- `GET /api/projects/[id]/channels/[channelId]/events`: real-time message delivery over Server-Sent Events (SSE).
  - Uses headers `text/event-stream`, `Connection: keep-alive`, `Cache-Control: no-cache, no-transform`, and `X-Accel-Buffering: no`.
  - Connects using a dedicated PostgreSQL client (`new Client(...)`) outside the shared pool to avoid exhausting the 5-connection pool.
  - Runs `LISTEN chat_channel_<channelId>`. When a notification arrives, it queries PostgreSQL for the message and sender display name before enqueueing the event (`id: <message_id>\nevent: message\ndata: <json>`).
  - Employs a serialized promise queue to guarantee strictly in-order message delivery, and buffers pre-controller events until the stream starts.
  - Sends a `: keepalive\n\n` comment every 15 seconds.
  - Cleans up client connections and listeners idempotently upon request abort, stream cancellation, or connection errors.

### Authorization
- Every chat endpoint calls `getCurrentUser()` and returns 401 if not logged in.
- Queries `project_members` for the user. Non-members receive 404 (same as non-existent projects) to avoid leaking project existence.
- Channel-scoped routes also verify that the channel belongs to the project (`chat_channels.project_id = id`), preventing cross-project IDOR attacks with a 404.

## AI PR review (Increment 2)

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
DATABASE_URL=postgresql://devplatform:YOUR_PASSWORD@127.0.0.1:5433/devplatform
FORGEJO_URL=http://localhost:3001
# Optional when the browser and Gitka server use different addresses:
# FORGEJO_PUBLIC_URL=https://forgejo.example.test
FORGEJO_TOKEN=your_forgejo_token_here
FORGEJO_WRITE_TOKEN=your_forgejo_write_token_here
FORGEJO_ADMIN_TOKEN=your_forgejo_admin_token_here
FORGEJO_OAUTH_CLIENT_ID=your_public_oauth_client_id
FORGEJO_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/forgejo/callback
FORGEJO_TOKEN_ENCRYPTION_KEY=your_64_hex_character_key
FORGEJO_WEBHOOK_SECRET=your_random_secret_here
OPENROUTER_API_KEY=your_openrouter_key_here
LLM_MODEL=openrouter/free
QA_EMBEDDING_MODEL=nvidia/nemotron-3.5-embed-1b:free
```

Interactive repository actions use the linked user’s encrypted OAuth credentials. The legacy service tokens are retained for local demo setup and health checks, not user authorization. Keep the encryption key stable and secret.

## Running locally

1. Start Docker Desktop, then from the project root: `docker compose up -d`.
2. `cd web`, then `bun install`, `bun run migrate`, `bun run dev`.
3. Register a public OAuth application with the configured callback URL and configure the OAuth environment variables. Start the Q&A worker as described in README. Register at http://localhost:3000 and connect a Forgejo account with the same verified email; create or link a repository from `/projects`.
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
