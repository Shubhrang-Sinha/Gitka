# Architecture

How the app is built today (end of Increment 1). Read this before adding a feature.

## Overview

Three pieces, all running locally in Docker or on your machine:

```
Browser  ->  Next.js app (web/, port 3000)  ->  PostgreSQL + pgvector (port 5432)
                       |
                       +-------------------->  Forgejo REST API (port 3001)
```

- **Forgejo** hosts the git repositories. It has its own SQLite database and is only accessed through its REST API, never directly.
- **PostgreSQL** stores everything the app owns: users, sessions, projects, membership, and team chat. Later: embeddings.
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
```

`web/lib` and `web/migrations` live directly in `web/`, **not** inside `app/`.

## Shared helpers (`web/lib`)

| File | What it gives you |
|---|---|
| `db.ts` | `pool`, the shared Postgres connection pool. Use `pool.query(sql, [values])`. |
| `forgejo.ts` | `forgejoFetch<T>(path)` for JSON and `forgejoFetchText(path)` for raw text. Both call `/api/v1` on Forgejo with the token. |
| `password.ts` | `hashPassword` and `verifyPassword` (bcrypt). |
| `session.ts` | `createSession`, `getCurrentUser()` (returns the user or `null`), `destroySession`. |

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
```

The Forgejo token is read-only (repository and user read). Features that write to Forgejo, like posting PR comments, need their own token with write permission.

## Running locally

1. Start Docker Desktop, then from the project root: `docker compose up -d`.
2. `cd web`, then `bun install`, `bun run migrate`, `bun run dev`.
3. Open http://localhost:3000 and register an account. Create a repo in Forgejo (http://localhost:3001), then link it from `/projects`.

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

## Status

- [x] Increment 1: Core platform (auth, projects, repo viewing, members)
- [ ] Increment 2: AI PR review
- [ ] Increment 3: Team chat (backend complete)
- [ ] Increment 4: Codebase Q&A
- [ ] Increment 5: Dashboard and hardening

Known gaps: passwords are not yet capped at 72 bytes (bcrypt limit), and there is no rate limiting yet (Increment 5).