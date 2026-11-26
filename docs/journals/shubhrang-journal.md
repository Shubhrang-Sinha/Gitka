# Engineering Development Journal — Shubhrang

**Role:** Backend Architecture, Docker Infrastructure & AI PR Review Lead  
**Project:** Gitka (Self-Hosted Collaborative Development Platform)  
**Methodology:** Agile / Incremental SDLC (6 Sprints, Oct 15 – Nov 26, 2026)  
**Teammates:** Saurya (Codebase Q&A, Forgejo API & Deployment), Medha (Chat Messaging & Forgejo API), Akshita (Frontend, DB Engineering & Documentation)

---

## Sprint 1 (Week 1: Oct 15 – Oct 21, 2026) — Core Foundation & Container Infrastructure
**Sprint Goal:** Stand up reproducible local Docker infrastructure (PostgreSQL + pgvector, Forgejo) and bootstrap the Next.js backend with core authentication and health endpoints.

- **Oct 15 (Thu) — Sprint 1 Planning & Architecture Kickoff:** Aligned with Saurya, Medha, and Akshita on a three-tier self-hosted architecture: Next.js App Router (served via Bun), PostgreSQL 16 with `pgvector` for relational and vector storage, and Forgejo for Git hosting. Defined Sprint 1 stories and agreed on environment isolation rules so secrets never enter Git.
- **Oct 16 (Fri) — Docker Compose & Service Orchestration:** Authored `docker-compose.yml`, `.env.example`, and root `.gitignore`. Configured the `pgvector/pgvector:pg16` service exposed on host port `5433` and the Forgejo service (`codeberg.org/forgejo/forgejo:15`) on port `3001` (HTTP) and `2222` (SSH) with persistent named volumes.
- **Oct 17–18 (Sat–Sun) — Next.js Backend & Pool Configuration:** Initialized the `web/` Next.js 16 workspace with Bun and TypeScript. Created `web/lib/db.ts` using a singleton `pg` `Pool` (`max: 5`) with an explicit pool error listener so dropped idle connections never crash the Node/Bun runtime. Implemented `GET /api/health/db` to validate PostgreSQL and `pgvector` readiness.
- **Oct 19–20 (Mon–Tue) — Password Hashing, Sessions & Auth APIs:** Built `web/lib/password.ts` (bcryptjs cost factor 12 with an explicit 72-byte UTF-8 boundary check) and `web/lib/session.ts` (`createSession`, `getCurrentUser`, `destroySession` backed by `HttpOnly` `session_id` cookies). Implemented `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, and `/api/auth/me` using parameterized SQL from Akshita's `001` and `002` migrations.
- **Oct 21 (Wed) — Sprint 1 Review & Retro:** Demonstrated working `docker compose up -d`, live database migrations, and cookie-authenticated API routes to the team. *Retro note:* Keeping Forgejo and Postgres completely containerized made onboarding Saurya and Medha's local environments take under 5 minutes.

---

## Sprint 2 (Week 2: Oct 22 – Oct 28, 2026) — AI PR Review Engine & Diff Parsing
**Sprint Goal:** Build the deterministic diff parser, Vercel AI SDK + OpenRouter review pipeline, and PR review endpoint so Gitka can analyze Forgejo pull requests automatically.

- **Oct 22 (Thu) — Sprint 2 Planning & Diff Parser Design:** Paired with Saurya on how Forgejo exposes unified `.diff` payloads and with Akshita on the `pr_reviews` / `review_comments` data model (`010_pr_reviews.sql`). Decided the AI reviewer must strictly validate line numbers against the actual new-file diff hunks before saving or posting comments.
- **Oct 23–24 (Fri–Sat) — Unified Diff Parser (`web/lib/diff.ts`):** Implemented `parseDiff(raw)` to split multi-file unified diffs, decode C-style git-quoted file paths (octal/unicode escapes), skip binary files, lockfiles, and minified assets, and annotate every added/context line with exact `L<num>` line numbers and a `validLines` set per file.
- **Oct 25–26 (Sun–Mon) — OpenRouter AI Reviewer (`web/lib/review.ts`):** Integrated `@openrouter/ai-sdk-provider` with the Vercel AI SDK (`generateText`). Engineered prompt injection boundaries by wrapping diffs in untrusted `<diff>` tags, enforcing strict JSON schema parsing, sorting findings by severity (`critical` > `warning` > `info`), capping comments at 10 per PR, and adding a deterministic `fakeReview()` fallback when `OPENROUTER_API_KEY` is unset.
- **Oct 27 (Tue) — Manual Review Endpoint & CLI Harnesses:** Built `POST/GET /api/projects/[id]/pulls/[n]/review/route.ts` with membership validation (`404` on non-members to prevent project enumeration) and created `web/scripts/try-diff.ts` and `web/scripts/try-review.ts` to verify diff parsing and OpenRouter JSON output independently of the UI.
- **Oct 28 (Wed) — Sprint 2 Review & Retro:** Reviewed Sprint 2 progress with Akshita's PR pages and Saurya's Forgejo PR poster. *Retro note:* Encountered malformed line numbers from smaller LLMs early on; filtering LLM findings against `validLines` from `diff.ts` eliminated 100% of rejected Forgejo review comment calls.

---

## Sprint 3 (Week 3: Oct 29 – Nov 4, 2026) — Concurrency Control & Signed Webhooks
**Sprint Goal:** Harden AI PR review orchestration against race conditions and deliver real-time automated reviews via signed Forgejo webhooks.

- **Oct 29 (Thu) — Sprint 3 Planning:** Identified two critical reliability gaps from Sprint 2 testing: duplicate concurrent review clicks/webhooks on the same commit SHA, and unauthenticated webhook risk. Coordinated with Medha on keeping `web/lib/db.ts` pool usage tight while her SSE chat stream opened dedicated clients.
- **Oct 30–31 (Fri–Sat) — Orchestrator & Stale Attempt Takeover (`web/lib/run-review.ts`):** Implemented `startReview()` and `runReview()` backed by Akshita's `011_review_attempts.sql` (`attempt_token` + `publish_started_at`). Built atomic `ON CONFLICT (project_id, pr_number, head_sha) DO UPDATE` takeover logic so a retry after failure or a 10-minute stale pending job issues a new UUID `attempt_token`. Every stage inside `runReview()` calls `authorize()` so an invalidated worker aborts via `StaleAttemptError` before touching Forgejo or overwriting newer findings.
- **Nov 1–2 (Sun–Mon) — Signed Forgejo Webhook Handler:** Implemented `POST /api/webhooks/forgejo/route.ts` with timing-safe HMAC-SHA256 verification against `FORGEJO_WEBHOOK_SECRET`. Handled `pull_request` `opened` and `synchronized` events, triggering `startReview` / `runReview` asynchronously while returning `202` quickly so Forgejo doesn't time out.
- **Nov 3 (Tue) — Docker Host Networking & Automated Regression Checks:** Updated `docker-compose.yml` (`FORGEJO__webhook__ALLOWED_HOST_LIST: private`) so the Forgejo container could deliver webhooks to `host.docker.internal:3000`. Wrote `web/scripts/test-diff-paths.ts`, `web/scripts/test-stale-takeover.ts`, and `web/scripts/try-webhook.ts`.
- **Nov 4 (Wed) — Sprint 3 Review & Retro:** Verified stale-attempt takeover and end-to-end webhook auto-reviews alongside Medha's real-time SSE team chat rollout. *Retro note:* Adding `test-stale-takeover.ts` caught a subtle edge case where `publish_started_at` wasn't checked before allowing takeover.

---

## Sprint 4 (Week 4: Nov 5 – Nov 11, 2026) — Background Workers & Multi-Tenant Hardening
**Sprint Goal:** Support Saurya's Codebase Q&A worker pipeline and harden backend APIs with PostgreSQL-backed rate limiting.

- **Nov 5 (Thu) — Sprint 4 Planning:** Aligned with Saurya on running Codebase Q&A indexing asynchronously outside web request timeouts, and with Akshita on rate-limit schema requirements (`040_rate_limits.sql`).
- **Nov 6–7 (Fri–Sat) — Lease-Based Index Job Execution:** Collaborated with Saurya on `web/lib/qa-jobs.ts` and `web/scripts/qa-worker.ts`, applying the same stale-lease pattern used in PR reviews so crashed indexing workers recover automatically without locking a project out of Q&A refreshes.
- **Nov 8–9 (Sun–Mon) — Shared PostgreSQL Rate Limiter (`web/lib/rate-limit.ts`):** Designed a fixed-window atomic rate limiter in PostgreSQL (`INSERT ... ON CONFLICT DO UPDATE`) so limits hold accurately across both the Next.js server and background processes without requiring Redis. Enforced limits across login (10/min per email, 120/min global), registration (30/min), chat (30/min per user), Q&A questions (10/min per user), and index refreshes (3/min per project) with standard `Retry-After` headers.
- **Nov 10 (Tue) — Webhook & Backend Error Transparency:** Audited API route handlers (`login`, `register`, `messages`, `review`) for uniform `{ ok: false, error }` responses, strict input length checks, and non-blocking error persistence in `pr_reviews.error`.
- **Nov 11 (Wed) — Sprint 4 Review & Retro:** Full team demo of Codebase Q&A + unified Earl Grey UI. *Retro note:* Sharing PostgreSQL for both rate limits and job leases kept our production container footprint minimal (`db` + `forgejo` + `web` + `qa-worker`), which paid off hugely for deployment simplicity.

---

## Sprint 5 (Week 5: Nov 12 – Nov 18, 2026) — OAuth Ownership, Security Audit & Staging Freeze
**Sprint Goal:** Transition AI PR reviews and webhooks to per-user Forgejo OAuth identities and complete pre-Saturnalia staging verification.

- **Nov 12 (Thu) — Sprint 5 Planning:** Coordinated with Medha and Saurya on moving `run-review.ts` and `/api/webhooks/forgejo` away from global admin/service tokens toward connected user credentials (`forgejoFetchAs`).
- **Nov 13–14 (Fri–Sat) — Connected-Owner Review & Webhook Attribution:** Updated `runReview()` and `startReview()` to resolve and validate `userId` ownership on every stage, ensuring webhook-triggered AI reviews resolve a connected project `owner` from `project_members` + `forgejo_identities` and fail closed if no owner has an active Forgejo connection.
- **Nov 15–16 (Sun–Mon) — Security & Boundary Review:** Audited `review.ts`, `diff.ts`, and `rate-limit.ts` with Saurya and Akshita. Verified `password_hash` and Forgejo token ciphertexts never leave server boundaries, tested webhook HMAC rejection on tampered payloads, and ran `test-stale-takeover.ts` and `test-qa-access.ts`.
- **Nov 17–18 (Tue–Wed) — Saturnalia Staging Dry-Run:** Packed production build scripts (`bun run build`, `bun run qa:worker`) and verified Docker Compose container startup profiles, volume persistence, and OpenRouter fallback behavior ahead of the Nov 19 fest deployment.

---

## Sprint 6 (Week 6: Nov 19 – Nov 26, 2026) — Saturnalia Live Deployment, Production Merges & Retro
**Sprint Goal:** Operate Gitka + Forgejo live on the Saturnalia fest server, support real-time payment debugging and event hotfixes, and fold production learnings into final polish.

- **Nov 19 (Thu) — Saturnalia Live Server Launch & Payment Mirror Setup:** Worked with Saurya to deploy the Dockerized PostgreSQL/pgvector + Forgejo + Next.js + `qa-worker` stack on Saturnalia's production server. Configured the **Saturnalia main backend mirror** repository with webhook triggers and Q&A indexing so backend engineers could immediately debug live fest payment gateway and verification mismatches using Gitka's AI chat / Codebase Q&A and team chat.
- **Nov 20 (Fri) — Live Payment Triage & "Perplexed" Hosting:** Monitored AI PR review workers and OpenRouter throughput during peak fest traffic. Helped the backend team validate payment callback hotfix PRs in the mirrored repo while hosting the flagship **"Perplexed"** (`perplexed-backend`) repository cleanly on our Forgejo + Gitka instance.
- **Nov 21 (Sat) — Direct Server-Side Production Merges for "Perplexed":** Instead of routing through slow external GitHubOps pipelines during live fest rounds, we used Gitka + Forgejo directly on the Saturnalia server to review, approve, merge, and ship hotfixes for **Perplexed** (`Sync production server changes onto main (i2k2, 2026-11-21)`). The AI PR review pipeline flagged regressions in seconds before every production merge, keeping the event rock-solid for hundreds of participants and organizers.
- **Nov 22–24 (Sun–Tue) — Post-Fest Telemetry Review & Cleanup:** Reviewed Saturnalia database metrics (`pr_reviews`, `rate_limits`, `qa_index_jobs`)—zero unhandled pool crashes and zero webhook signature failures throughout the fest. Updated `web/scripts/seed-demo.ts` to auto-provision `FORGEJO_ADMIN_TOKEN` safely in local and staging setups.
- **Nov 25–26 (Wed–Thu) — Sprint 6 Review & Final Sign-off:** Assisted Saurya and Akshita in verifying the new inline Forgejo registration endpoint (`/api/auth/forgejo/register`) and `nvidia/nemotron-3.5-embed-1b:free` embedding configuration (`bun run lint`, `bun run build`). Concluded Sprint 6 Retrospective celebrating a highly successful Saturnalia launch.
