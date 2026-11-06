# Contributing

Rules for working together on this project. Read this once before writing code, and read `docs/ARCHITECTURE.md` to see how the app is built.

## Golden rules

1. `main` always holds working code. **Nobody pushes directly to `main`.**
2. All work happens on a **branch** and reaches `main` through a **pull request (PR)** that another teammate reviews.
3. **Real secrets never go in git.** See "Security rules" below.
4. Keep branches and PRs small. A PR that does one thing is easy to review and easy to undo.

## Who owns what

| Increment | Owner | Migration numbers |
|---|---|---|
| 1. Core platform (done) | NAME | 001-009 |
| 2. AI PR review | NAME | 010-019 |
| 3. Team chat | NAME | 020-029 |
| 4. Codebase Q&A | NAME | 030-039 |
| 5. Dashboard and hardening | NAME | 040-049 |

Anyone may fix a bug anywhere, but tell the owner in your PR.

## First-time setup

1. Install Docker Desktop, Git and [Bun](https://bun.sh).
2. Clone the repo and open it in VS Code:
   ```
   git clone https://github.com/Shubhrang-Sinha/Gitka.git
   cd Gitka
   ```
3. Copy `.env.example` to `.env` (project root) and set your own Postgres password.
4. Start the services: `docker compose up -d`
5. Open Forgejo at http://localhost:3001, run the install wizard, and create **your own** admin account, a test repo (with a README), and an API token. Everyone runs their own copy of Forgejo and Postgres, so nobody can break anyone else's data.
6. Copy `web/.env.example` to `web/.env.local` and fill in your real password and token.
7. Install and start the app:
   ```
   cd web
   bun install
   bun run migrate
   bun run dev
   ```
8. Check http://localhost:3000/api/health/db and http://localhost:3000/api/health/forgejo both show `"ok":true`.

## Daily workflow

Start every new piece of work from an up-to-date `main`:

```
git switch main
git pull
git switch -c inc3-chat-messages
```

Branch names are `inc<number>-<short-description>`, for example `inc2-webhook-verify` or `inc4-chunking`. Bug fixes use `fix-<description>`.

While you work, commit small and often:

```
git status --short
git add <the files you changed>
git commit -m "Add chat message table and send route"
```

Check `git status --short` **before every commit**. Prefer naming files over `git add .` so a stray file can't slip in.

Commit messages: start with a verb ("Add", "Fix", "Update"), say what changed, and keep it under about 70 characters.

When a piece works, push your branch:

```
git push -u origin inc3-chat-messages
```

Then open GitHub, click **Compare & pull request**, and fill in the PR.

## Before you open a PR

- [ ] The app runs, and you tested your feature in the browser or with `Invoke-RestMethod`.
- [ ] `bun run lint` shows no errors.
- [ ] No `.env` or `.env.local` files and no secrets in `git status`.
- [ ] You pulled the latest `main` into your branch (see below) and nothing broke.
- [ ] If you added a table, route, or helper, you updated `docs/ARCHITECTURE.md`.

## Pull requests and reviews

- Write a short description: what changed, why, and how to test it.
- Ask one teammate to review. Reviewers check that it works, follows the conventions in `docs/ARCHITECTURE.md`, and contains no secrets.
- **Don't merge your own PR** until someone has approved it.
- Use **Squash and merge** so each PR becomes one clean commit on `main`.
- After merging, delete the branch, then `git switch main` and `git pull`.


## Database migrations

- **Never edit a migration that has been merged.** Add a new file instead.
- Run `bun run migrate` after pulling, in case someone else added tables.
- Never run SQL by hand against your database to "fix" the schema. If it needs to change, write a migration.

## Security rules

This repo may be public, so assume everything committed is visible to everyone.

1. **Never commit** passwords, API tokens, the Forgejo token, the LLM API key, or anything from `.env` or `web/.env.local`. Only `.env.example` files (with placeholder values) are committed.
2. **Never paste secrets** into issues, PR descriptions, screenshots, or chat.
3. **If a secret is committed, revoke it immediately** and generate a new one, then tell the team. Deleting the file is not enough because it stays in git history, and bots scan public repos within minutes.
4. Always use SQL placeholders (`$1, $2`). Never build SQL from user input by string concatenation.
5. Never return `password_hash` or tokens in API responses.
6. Validate all input in API routes, and check login and project membership on every page and route.
7. The AI bot is **advisory only**. It never merges, approves, or rejects PRs.

## Getting help

If something breaks, check "Known gotchas" in `docs/ARCHITECTURE.md` first. Then ask in the team chat with the **full error text** and what you ran, because screenshots cut off the important lines.