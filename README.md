# Self-Hosted Collaborative Development Platform

Forgejo + Next.js + PostgreSQL/pgvector, with AI-assisted PR review, team chat and codebase Q&A. Built as a college project using an incremental SDLC model.

## Architecture

- **Forgejo** hosts the git repositories (its own SQLite database).
- **PostgreSQL + pgvector** stores users, projects, sessions, chat messages, reviews, and the codebase index.
- **Next.js app** (`web/`) is the UI and API layer. It talks to Postgres directly and to Forgejo through its REST API.

Forgejo and PostgreSQL store their data on local Docker volumes. When OpenRouter is configured, AI features send relevant repository content to the provider.

## Prerequisites

- Docker Desktop
- [Bun](https://bun.sh) 1.3+
- Git

## Setup

1. Copy `.env.example` to `.env` and set your own Postgres password.
2. Start the services from the project root:
   ```
   docker compose up -d
   ```
3. Copy `web/.env.example` to `web/.env.local` and set the database URL and local demo password:
   ```
   DATABASE_URL=postgresql://devplatform:YOUR_PASSWORD@127.0.0.1:5433/devplatform
   FORGEJO_URL=http://localhost:3001
   GITKA_DEMO_PASSWORD=your_local_demo_password
   ```
5. Install dependencies, apply database migrations, and start the app:
   ```
   cd web
   bun install
   bun run migrate
   bun run seed:demo
   bun run dev
   ```
6. In a second terminal, run `cd web && bun run qa:worker` to process repository index jobs. The app runs at http://localhost:3000.

Set `OPENROUTER_API_KEY` and a tool-capable `LLM_MODEL` in `web/.env.local` for the assistant. Set `QA_EMBEDDING_MODEL` to an OpenRouter embedding model for semantic search; without it the assistant reports keyword-only retrieval. The worker must use the same environment as the web app and run continuously.

## Earl Grey theme

Docker Compose defaults Forgejo to Earl Grey using the vendored
[Earl Grey 1.0.41 stylesheet](forgejo/earl-grey/theme-earl-grey.css) and
[MIT license](forgejo/earl-grey/LICENSE). The stylesheet is pinned to
`Troplo/earl-grey@9b5769a3f10b14ffc097add553c0712e6c427ba7`.
Gitka uses the same dark palette in its own interface. Existing Forgejo
users with a saved theme can select **Earl Grey** in their appearance settings.

## Seed the demo

With Docker Compose running and `web/.env.local` configured, run these commands from `web/`:

```sh
bun run migrate
bun run seed:demo
bun run dev
```

Set `GITKA_DEMO_PASSWORD` in `web/.env.local` before running the seed. The seed
creates one demo account, `test@thapar.edu`, with the same password in Gitka
and Forgejo. It also provisions Forgejo read and write tokens in
`web/.env.local`. Restart Gitka after seeding if it was already running.

Use the credentials in `web/.env.demo.json` to sign in to each app. Keep that
file local. Gitka lists **Lantern Schedule**, backed by the private
`gitka-demo/gitka-demo` repository owned by the same demo account in Forgejo.

- **Pull requests** has an open change ready for live review and a closed change with a clearly labeled sample review. Select **Review this PR** on the open change to start a new review.
- **Team chat** starts with a welcome message from the demo owner.
- **Codebase Q&A** comes pre-indexed. Ask “What is the default lantern inspection interval?” and open the source excerpt in `src/schedule.ts`. OpenRouter enables generated answers and live model reviews. Without its key, Gitka provides keyword results and a placeholder PR reviewer.

## Codebase Q&A

Open a project and select **Codebase Q&A**. A project owner can build or refresh the index for the default branch. Members can search the indexed snapshot and see matching source excerpts. Set `OPENROUTER_API_KEY` and `LLM_MODEL` in `web/.env.local` to generate answers and optionally set `QA_EMBEDDING_MODEL` to enable semantic retrieval. Refresh the index after repository changes or changes to the embedding model.

## Health checks

- http://localhost:3000/api/health/db checks Postgres and pgvector
- http://localhost:3000/api/health/forgejo checks the Forgejo API connection

## Documentation

- [Architecture](docs/ARCHITECTURE.md): how the app is structured and how to add features
- [Contributing](CONTRIBUTING.md): git workflow, review rules and security rules

## Progress

- [x] Increment 1: Core platform (Docker, Next.js app, migrations, authentication, projects, repo viewing, member management)
- [x] Increment 2: AI PR review
- [x] Increment 3: Team chat
- [x] Increment 4: Codebase Q&A
- [x] Increment 5: Dashboard and hardening

## Forgejo account connection

Gitka users must connect a Forgejo account before accessing projects. Create a
**public** OAuth2 application in Forgejo with PKCE and register the exact callback
`http://localhost:3000/api/auth/forgejo/callback` (use your deployed Gitka URL
outside local development). Set `FORGEJO_OAUTH_CLIENT_ID`,
`FORGEJO_OAUTH_REDIRECT_URI`, and a stable 32-byte hex
`FORGEJO_TOKEN_ENCRYPTION_KEY` in `web/.env.local`; generate the latter with
`openssl rand -hex 32`. Back up this key securely: changing it makes existing
encrypted authorizations unreadable. Run `bun run migrate` and restart Gitka.

Registration creates a local login and directs users to connect or create their
Forgejo account. Existing Gitka users connect after their next login. The Forgejo
account must have the same verified email address. Forgejo controls the OAuth
consent screen and account registration; Gitka does not collect the user's
Forgejo password. Reconnecting is required after authorization is revoked.
