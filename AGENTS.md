# Repository Guidelines

## Project Structure

Gitka is a Next.js App Router application backed by PostgreSQL with pgvector. Forgejo hosts Git repositories, and OpenRouter powers AI pull request reviews. Docker Compose runs PostgreSQL and Forgejo.

- `web/app/` contains pages, components, and API route handlers under `app/api/`.
- `web/lib/` contains shared server code for database access, sessions, Forgejo, and PR reviews.
- `web/migrations/` contains numbered SQL migrations. `web/scripts/` contains migration tooling, regression checks, and smoke scripts.
- `web/public/` contains static assets. See [Architecture](docs/ARCHITECTURE.md) and [Contributing](CONTRIBUTING.md) for project conventions.

## Build and Development

1. From the repository root, copy `.env.example` to `.env`, set a local Postgres password, and run `docker compose up -d`. Complete Forgejo setup at `http://localhost:3001`.
2. Copy `web/.env.example` to `web/.env.local` and fill in your local database and Forgejo credentials. Keep credentials out of Git.
3. From `web/`, run `bun install`, `bun run migrate` to apply pending migrations, and `bun run dev` to start the app at `http://localhost:3000`.
4. Run `bun run lint` for ESLint, `bun run build` for a production build, and `bun run start` to serve that build locally.

## Coding Style

Use TypeScript and TSX with two-space indentation. Match nearby code, using camelCase for functions and variables, PascalCase for React components, and kebab-case for supporting filenames. Follow Next.js conventions for `page.tsx` and `route.ts`. Validate API inputs, enforce project membership, and parameterize SQL. Add schema changes in a new three-digit migration within the increment’s assigned range.

## Testing

Run standalone Bun checks from `web/`, such as `bun scripts/test-diff-paths.ts`. Use a disposable local project and PR for `bun --env-file=.env.local scripts/test-stale-takeover.ts owner/repo 1`, which replaces the review record. Verify changed flows in the browser or through the API.

## Commits and Pull Requests

Branch from current `main` using `inc<number>-<description>` or `fix-<description>`. Write short, verb-led commits such as “Add Forgejo API helper.” In each PR, explain what changed, why, and how to test it. Update the architecture guide when adding tables, routes, or helpers. Bring in the latest `main`, pass lint, and get teammate approval before squash-merging.
