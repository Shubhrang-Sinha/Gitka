# Engineering Development Journal — Saurya

**Role:** Codebase Q&A / PR Review Workflows, Forgejo API Integration & Deployment Lead  
**Project:** Gitka (Self-Hosted Collaborative Development Platform)  
**Methodology:** Agile / Incremental SDLC (6 Sprints, Oct 15 – Nov 26, 2026)  
**Teammates:** Shubhrang (Backend, Docker & AI PR Review), Medha (Chat Messaging & Forgejo API), Akshita (Frontend, DB Engineering & Documentation)

---

## Sprint 1 (Week 1: Oct 15 – Oct 21, 2026) — Forgejo Bootstrap & API Connectivity
**Sprint Goal:** Configure Forgejo service integration, establish the REST API client layer, and validate cross-container Git/API communication.

- **Oct 15 (Thu) — Sprint 1 Planning:** Mapped out how Gitka interacts with Forgejo strictly through its REST API (`api/v1`) rather than touching Forgejo's internal SQLite database directly. Assigned Forgejo bootstrap and integration spikes between Medha and myself.
- **Oct 16–17 (Fri–Sat) — Local Forgejo Provisioning & Token Setup:** Brought up Shubhrang's Docker Compose stack, completed the Forgejo setup flow on port `3001`, and configured token-based authentication (`FORGEJO_URL`, `FORGEJO_TOKEN`) in `web/.env.local`.
- **Oct 18–20 (Sun–Tue) — Core Forgejo REST Client (`web/lib/forgejo.ts`):** Implemented `forgejoFetch<T>()` and `forgejoFetchText()` with `AbortSignal.timeout(8000)`, `cache: "no-store"`, and structured `ForgejoRequestError` / `ForgejoConfigurationError` handling. Built `GET /api/health/forgejo` to verify live repository connectivity.
- **Oct 21 (Wed) — Sprint 1 Review & Retro:** Verified `http://localhost:3000/api/health/forgejo` alongside `health/db` and documented setup steps with Akshita. *Retro note:* Setting explicit request timeouts early prevented Next.js server renders from hanging when Forgejo was restarting.

---

## Sprint 2 (Week 2: Oct 22 – Oct 28, 2026) — Pull Request Lifecycle & Forgejo Posting
**Sprint Goal:** Integrate Forgejo pull requests, diffs, repository creation, and automated review comment publishing.

- **Oct 22 (Thu) — Sprint 2 Planning:** Planned Increment 2 integration points with Shubhrang (AI review engine) and Akshita (PR detail UI). Took ownership of all Forgejo pull request read/write endpoints.
- **Oct 23–25 (Fri–Sun) — Forgejo Pulls Helper (`web/lib/forgejo-pulls.ts`):** Built `listPulls()`, `getPull()`, `getPullDiff()`, and `postReview()` to fetch open/closed PRs, pull raw unified diffs, and publish AI review summaries plus line-anchored inline comments back to Forgejo via `POST /repos/{owner}/{repo}/pulls/{n}/reviews`.
- **Oct 26–27 (Mon–Tue) — Repository & PR Creation APIs:** Implemented `POST /api/repositories/route.ts` (creating Forgejo repositories with `auto_init: true` directly from Gitka) and `POST /api/projects/[id]/pulls/route.ts` (creating pull requests across branches inside Gitka), plus standalone verification scripts `web/scripts/try-diff.ts`, `try-post.ts`, and `try-run.ts`.
- **Oct 28 (Wed) — Sprint 2 Review & Retro:** Demoed end-to-end PR creation in Gitka → automatic diff fetch → OpenRouter AI review → published review visible inside Forgejo. *Retro note:* URL-encoding repository owner/name segments consistently prevented bugs on repo names with dots or special characters.

---

## Sprint 3 (Week 3: Oct 29 – Nov 4, 2026) — Unified PR Discussion & URL Mapping
**Sprint Goal:** Unify Gitka and Forgejo navigation workflows with bidirectional PR comments and environment-aware deep links.

- **Oct 29 (Thu) — Sprint 3 Planning:** Observed during Sprint 2 demos that reviewers wanted seamless switching between Gitka's AI review view and Forgejo's native Git/commit view, plus live human discussion synced with Forgejo.
- **Oct 30–Nov 1 (Fri–Sun) — PR Discussion Synchronization:** Collaborated with Medha on `GET/POST /api/projects/[id]/pulls/[n]/comments/route.ts` and updated `forgejo-pulls.ts` so comments posted from Gitka write directly to Forgejo (keeping Forgejo as the single source of truth without duplicating comment state in Postgres).
- **Nov 2–3 (Mon–Tue) — Forgejo Public/Internal URL Bridge (`web/lib/forgejo-links.ts`):** Built `web/lib/forgejo-links.ts` supporting `FORGEJO_PUBLIC_URL` separate from internal `FORGEJO_URL`—crucial for reverse-proxied VPS deployments where containers talk over Docker/localhost while browsers open public HTTPS links to files, commits, and line ranges (`#L10-L20`).
- **Nov 4 (Wed) — Sprint 3 Review & Retro:** Validated round-trip PR comments between Gitka and Forgejo in browser tests. *Retro note:* Separating `FORGEJO_URL` and `FORGEJO_PUBLIC_URL` in Sprint 3 made our eventual Saturnalia public server deployment painless.

---

## Sprint 4 (Week 4: Nov 5 – Nov 11, 2026) — Codebase Q&A, Hybrid Search & Indexing Worker
**Sprint Goal:** Deliver commit-pinned Codebase Q&A powered by AST-free bounded chunking, secret filtering, PostgreSQL full-text search, and pgvector semantic similarity.

- **Nov 5 (Thu) — Sprint 4 Planning:** Designed Increment 4 (Codebase Q&A) with Akshita (migrations `030_codebase_index.sql` and `042_qa_conversations_and_jobs.sql`) and Shubhrang (worker leases and rate limits).
- **Nov 6–8 (Fri–Sun) — Codebase Indexer (`web/lib/codebase-index.ts`) & Worker (`web/lib/qa-jobs.ts`, `web/scripts/qa-worker.ts`):** Built recursive Git tree traversal via Forgejo's `/git/trees/{commit}` and `/git/blobs/{sha}` APIs. Enforced strict safety bounds (max 200 files, 32 KB/file, 800 chunks, 50-line/2400-char chunks), path exclusions (`secrets/`, `node_modules/`, lockfiles), and `containsKnownSecret()` regex scrubbing before any excerpt enters Postgres or OpenRouter. Built atomic snapshot replacement so failed re-indexes preserve the previous valid index.
- **Nov 9–10 (Mon–Tue) — Tool-Using Q&A Engine (`web/lib/codebase-qa.ts` & `/api/projects/[id]/qa`):** Implemented hybrid retrieval combining PostgreSQL `tsvector` full-text search (`coalesce` guarded against NULL ranks) with `pgvector` cosine similarity when `QA_EMBEDDING_MODEL` is configured. Equipped the OpenRouter Q&A model with read-only tools (`search`, `listPaths`, `readLines`, max 6 steps / 60s) and commit-pinned file citations linking straight to Forgejo.
- **Nov 11 (Wed) — Sprint 4 Review & Retro:** Demoed asking natural-language architecture questions against indexed repositories and clicking directly to exact cited line ranges in Forgejo. *Retro note:* Guarding `ts_rank` arithmetic with `coalesce()` solved edge cases when hybrid queries had zero exact keyword hits.

---

## Sprint 5 (Week 5: Nov 12 – Nov 18, 2026) — Seed Automation, E2E Suite & VPS Staging
**Sprint Goal:** Automate reproducible environment seeding, integrate per-user Forgejo OAuth into Q&A/PRs, and pass full E2E verification before Saturnalia.

- **Nov 12 (Thu) — Sprint 5 Planning:** Focused on deployment ergonomics, OAuth integration across all Forgejo callers (`codebase-index.ts`, `codebase-access.ts`), and automated verification scripts.
- **Nov 13–14 (Fri–Sat) — Demo Seed & OAuth App Provisioning (`web/scripts/seed-demo.ts`):** Built an idempotent seed pipeline that creates Forgejo demo accounts, mints OAuth2 PKCE applications, provisions tokens, seeds a realistic repository (`Lantern Schedule`) with open/closed PRs, and indexes it into `codebase_chunks`.
- **Nov 15–16 (Sun–Mon) — Production Verification Suite:** Authored `web/scripts/test-demo-e2e.ts` (22 scripted HTTP/write checks against the production build), `web/scripts/test-qa-access.ts`, and `web/scripts/test-forgejo-auth.ts`. Verified non-member isolation (`404`), OAuth access enforcement, and Q&A citation accuracy.
- **Nov 17–18 (Tue–Wed) — Semantic Model Verification & Deployment Prep:** Tested OpenRouter embedding models (`nvidia/nemotron-3.5-embed-1b:free`, 2048 dimensions) with `pgvector` similarity queries, verified `bun run build` and `qa-worker.ts` systemd/process configuration, and prepared the deployment checklist for Saturnalia's server.

---

## Sprint 6 (Week 6: Nov 19 – Nov 26, 2026) — Saturnalia Fest Deployment & Production Operations
**Sprint Goal:** Deploy Gitka + Forgejo on Saturnalia's production server, support live payment debugging via Codebase Q&A, and run autonomous server-side production deployments for "Perplexed".

- **Nov 19 (Thu) — Saturnalia Production Rollout & Payment Debugging Mirror:** Deployed Gitka + Forgejo (`web`, `qa-worker`, `db`, `forgejo`) onto Thapar's Saturnalia server behind the reverse proxy (`FORGEJO_PUBLIC_URL`). Set up two mission-critical repositories on our self-hosted instance:
  1. **Saturnalia Main Backend Mirror:** Hosted and indexed a mirror of the main fest backend so engineers could debug live registration and **payment gateway callback issues** using **Gitka's Codebase Q&A (AI chat) feature**. Indexing the payment/webhook handlers allowed responders to query exact status-transition logic and pinpoint mismatch edge cases within minutes instead of digging through files manually under fest pressure.
  2. **"Perplexed" Main Event Repo (`perplexed-backend`):** Imported and linked the flagship event repository so organizers and developers had full PR review, chat, and Q&A tooling on the same server.
- **Nov 20 (Fri) — Live Fest Support:** Coordinated with Medha and Akshita as fest organizers, coordinators, and developers logged in with linked Forgejo accounts, verified indexed payment fixes in the backend mirror, and tracked "Perplexed" round/admin updates through Gitka pull requests.
- **Nov 21 (Sat) — Direct Server-Side Merges & Production Deployments for "Perplexed":** Instead of relying on external GitHubOps workflows during time-critical live rounds, used **Gitka + Forgejo directly on the Saturnalia server** to run AI PR reviews, verify diffs, merge branches onto `main`, and deploy production updates straight from the server (`Sync production server changes onto main (i2k2, 2026-11-21)`). The self-hosted workflow cut hotfix turnaround dramatically, and the event ran smoothly with high user satisfaction across participants and organizers.
- **Nov 22–25 (Sun–Wed) — Post-Fest Onboarding Upgrade:** Taking feedback from onboarding ~50 fest coordinators quickly, designed `web/lib/forgejo-onboarding.ts` and `POST /api/auth/forgejo/register` so Gitka checks `checkForgejoEmail()` at registration and provisions missing Forgejo accounts seamlessly via `FORGEJO_ADMIN_TOKEN`. Enabled `QA_EMBEDDING_MODEL=nvidia/nemotron-3.5-embed-1b:free` in `.env.example` and updated `seed-demo.ts`.
- **Nov 26 (Thu) — Sprint 6 Review & Final Retro:** Completed final lint, build, and deployment sign-off (`bun run lint`, `bun run build`). Documented Saturnalia success metrics in the team retrospective.
