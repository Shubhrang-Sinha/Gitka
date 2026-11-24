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
3. Open Forgejo at http://localhost:3001, complete the install wizard, create an admin account, and generate an API token (read access to repository and user).
4. Create `web/.env.local` with:
   ```
   DATABASE_URL=postgresql://devplatform:YOUR_PASSWORD@localhost:5432/devplatform
   FORGEJO_URL=http://localhost:3001
   FORGEJO_TOKEN=your_token_here
   ```
5. Install dependencies, apply database migrations, and start the app:
   ```
   cd web
   bun install
   bun run migrate
   bun run dev
   ```
6. The app runs at http://localhost:3000.

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
