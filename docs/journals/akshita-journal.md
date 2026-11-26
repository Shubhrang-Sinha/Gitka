# Engineering Development Journal — Akshita

**Role:** Frontend Engineering, Database Engineering & Documentation Lead  
**Project:** Gitka (Self-Hosted Collaborative Development Platform)  
**Methodology:** Agile / Incremental SDLC (6 Sprints, Oct 15 – Nov 26, 2026)  
**Teammates:** Shubhrang (Backend, Docker & AI PR Review), Saurya (Codebase Q&A, Forgejo API & Deployment), Medha (Chat Messaging & Forgejo API)

---

## Sprint 1 (Week 1: Oct 15 – Oct 21, 2026) — Relational Schema, Migration Runner & Base UI
**Sprint Goal:** Design the initial PostgreSQL schema and deterministic migration tooling, establish the Next.js frontend shell, and bootstrap team documentation.

- **Oct 15 (Thu) — Sprint 1 Planning:** Worked with Shubhrang, Saurya, and Medha to define the database schema boundaries, Next.js App Router structure, and Agile increment numbering conventions.
- **Oct 16–18 (Fri–Sun) — Migration Runner & Core Tables (`001`–`002`):** Built `web/scripts/migrate.ts` with transactional tracking in `schema_migrations` so every teammate can apply SQL migrations idempotently via `bun run migrate`. Authored:
  - `web/migrations/001_create_users.sql` (`users` table with unique lowercase email constraint and `GENERATED ALWAYS AS IDENTITY` keys).
  - `web/migrations/002_create_projects_and_sessions.sql` (`projects`, `project_members` composite `(project_id, user_id)` key with `'owner' | 'member'` check constraint, and indexed `sessions`).
- **Oct 19–20 (Mon–Tue) — App Router Foundation & Documentation Skeleton:** Configured `web/app/layout.tsx`, `web/app/globals.css`, and landing `web/app/page.tsx`. Drafted initial `README.md` setup instructions so all four teammates could run Postgres, Forgejo, and Next.js consistently.
- **Oct 21 (Wed) — Sprint 1 Review & Retro:** Verified clean schema creation on fresh Docker Postgres instances. *Retro note:* Establishing three-digit migration ranges per increment early (`001–009`, `010–019`, `020–029`, `030–039`, `040–049`) prevented merge conflicts completely across all 6 weeks.

---

## Sprint 2 (Week 2: Oct 22 – Oct 28, 2026) — Auth/Project UI, Review Schema & Team Docs
**Sprint Goal:** Build user-facing authentication and project workflows, design AI PR review tables, and publish engineering standards in `ARCHITECTURE.md` and `CONTRIBUTING.md`.

- **Oct 22 (Thu) — Sprint 2 Planning:** Aligned with Shubhrang on `pr_reviews` / `review_comments` schema constraints and with Medha on project member UI flows.
- **Oct 23–24 (Fri–Sat) — Auth & Project Management Frontend:** Built `web/app/login/page.tsx`, `web/app/register/page.tsx`, `web/app/projects/page.tsx`, `create-project-form.tsx`, `logout-button.tsx`, `web/app/projects/[id]/page.tsx` (file tree + README view), and `add-member-form.tsx` (conditionally shown only to owners).
- **Oct 25–26 (Sun–Mon) — PR Review Database Engineering (`010`–`011`):** Authored `web/migrations/010_pr_reviews.sql` (`pr_reviews` keyed uniquely on `(project_id, pr_number, head_sha)`, cascading `review_comments` with severity checks) and `web/migrations/011_review_attempts.sql` adding `attempt_token` UUID and `publish_started_at` to support Shubhrang's stale-worker takeover logic.
- **Oct 27 (Tue) — Engineering Playbooks:** Authored `docs/ARCHITECTURE.md` and `CONTRIBUTING.md` documenting SQL parameterization rules, Next.js 16 `Promise` params, branch naming (`inc<number>-<description>`), PR review policy, and migration safety rules.
- **Oct 28 (Wed) — Sprint 2 Review & Retro:** Demoed the complete auth → create project → add member → open repo UI flow and ratified `CONTRIBUTING.md` with the team.

---

## Sprint 3 (Week 3: Oct 29 – Nov 4, 2026) — Chat Database, PR Views & Interactive Chat UI
**Sprint Goal:** Engineer high-performance chat tables and indexes, build the PR list/detail and AI review panel, and ship the real-time team chat interface.

- **Oct 29 (Thu) — Sprint 3 Planning:** Paired with Medha on chat channel schema + cursor indexing and with Shubhrang/Saurya on the PR review panel UX.
- **Oct 30–31 (Fri–Sat) — Chat Database Engineering (`019`–`021`):**
  - Authored `web/migrations/020_create_chat_tables.sql` creating `chat_channels` (`UNIQUE (project_id, name)`), `chat_messages` (`CHECK (char_length(trim(content)) BETWEEN 1 AND 2000)`), a composite `chat_messages_channel_created_idx` index on `(channel_id, created_at, id)` for fast cursor pagination, and automatic backfill of a `general` channel for existing projects.
  - Added `019_adopt_project_chat_messages.sql` and `021_project_chat_messages.sql` so channel and project chat migrations remain safely ordered and idempotent.
- **Nov 1–3 (Sun–Tue) — PR & Chat Frontend Components:**
  - Built `web/app/projects/[id]/pulls/page.tsx`, `pulls/[n]/page.tsx`, and `review-panel.tsx` (status polling while pending, color-coded severity badges for `critical`/`warning`/`info`, and diff line links).
  - Built `web/app/projects/[id]/chat/page.tsx` and `chat.tsx` connecting cleanly to Medha's SSE endpoint with live message rendering and optimistic form handling.
- **Nov 4 (Wed) — Sprint 3 Review & Retro:** Tested PR review rendering and live multi-user chat in browser sessions, updating `docs/ARCHITECTURE.md` with the chat schema and SSE route map.

---

## Sprint 4 (Week 4: Nov 5 – Nov 11, 2026) — Codebase Q&A Schema, Earl Grey UI & PR Discussion
**Sprint Goal:** Design pgvector database migrations for Codebase Q&A, build the Q&A and PR discussion interfaces, and unify Gitka and Forgejo under the Earl Grey theme.

- **Nov 5 (Thu) — Sprint 4 Planning:** Coordinated with Saurya on `pgvector` schema design and with the whole team on visual consistency between Gitka and Forgejo.
- **Nov 6–7 (Fri–Sat) — Vector & Q&A Database Migrations (`030`, `042`):** Authored `web/migrations/030_codebase_index.sql` (`codebase_indexes` + `codebase_chunks` with `pgvector` `vector` storage and `tsvector` GIN indexing for Saurya's hybrid search) and `web/migrations/042_qa_conversations_and_jobs.sql` (`qa_conversations`, `qa_messages`, and `qa_index_jobs` lease queue).
- **Nov 8–9 (Sun–Mon) — Earl Grey Unification & Shared Project Shell:**
  - Vendored the `Earl Grey` stylesheet (`forgejo/earl-grey/theme-earl-grey.css`, `forgejo/earl-grey/LICENSE`) and created `forgejo/branding/gitka.svg` + `web/public/GitkaLogo.png` so Forgejo and Gitka share one unified dark palette and brand identity.
  - Built `web/app/projects/[id]/layout.tsx`, `project-nav.tsx`, `error.tsx`, `not-found.tsx`, and refined `globals.css` with consistent layout spacing and navigation across Overview, Pull Requests, Team Chat, and Codebase Q&A.
- **Nov 10 (Tue) — Q&A & PR Creation/Discussion Interfaces:** Built `web/app/projects/[id]/qa/page.tsx`, `codebase-questions.tsx` (streaming Q&A answers with clickable commit-pinned Forgejo source citations), `discussion-panel.tsx`, `create-pull-form.tsx`, and `create-repository-form.tsx`.
- **Nov 11 (Wed) — Sprint 4 Review & Retro:** Demoed the unified Earl Grey look across both apps and verified zero horizontal overflow on mobile viewports (`375px`).

---

## Sprint 5 (Week 5: Nov 12 – Nov 18, 2026) — Hardening Migrations, WCAG Audit & QA Docs
**Sprint Goal:** Finalize Increment 5 database schemas, complete Next.js 16 Suspense/Cache Components audits, verify accessibility contrast, and write formal QA documentation.

- **Nov 12 (Thu) — Sprint 5 Planning:** Focused on Increment 5 hardening migrations (`040`–`043`), frontend accessibility, and comprehensive documentation ahead of Saturnalia.
- **Nov 13–14 (Fri–Sat) — Increment 5 Migrations (`040`, `041`, `043`):**
  - `web/migrations/040_rate_limits.sql` for Shubhrang's PostgreSQL rate-limit counters.
  - `web/migrations/041_dashboard_latest_review.sql` to optimize `/projects` dashboard latest-review queries.
  - `web/migrations/043_forgejo_identity.sql` (`forgejo_identities` and `forgejo_oauth_states`) for Medha's PKCE OAuth linking.
- **Nov 15–16 (Sun–Mon) — Frontend Polishing & Accessibility Audit:** Wrapped cookie/URL reads inside `<Suspense>` boundaries for Next.js 16 Cache Components compliance (`projects/page.tsx`, `connect-forgejo/page.tsx`), fixed browser login/logout document navigation bugs, and verified WCAG contrast ratios on the Earl Grey theme (`11.87:1` primary text, `6.52:1` muted text, `8.71:1` primary button) plus zero overflow at `375px`.
- **Nov 17–18 (Tue–Wed) — Formal QA & Architecture Documentation:** Authored `docs/QA-DEMO.md` capturing all 22 E2E checks, mobile layout passes, and simulated upstream error preservation tests, and updated `README.md` and `docs/ARCHITECTURE.md` to mark Increments 1–5 complete.

---

## Sprint 6 (Week 6: Nov 19 – Nov 26, 2026) — Saturnalia Support, Onboarding UI & Final Docs
**Sprint Goal:** Support live fest users on the Saturnalia server, refine the Forgejo registration UX from real user feedback, and finalize project documentation.

- **Nov 19 (Thu) — Saturnalia Live Rollout & UI Support:** Assisted Saurya and Shubhrang during the Saturnalia production deployment. Helped backend responders navigate the **Codebase Q&A** UI on the mirrored Saturnalia main backend repo to inspect payment handler citations cleanly on both desktop and mobile during live issue triage, while team chat coordinated fixes across organizers.
- **Nov 20–21 (Fri–Sat) — Live "Perplexed" Fest Operations:** Monitored UI workflows and database migrations/indexes on the Saturnalia instance as the team reviewed and merged production hotfixes for **"Perplexed"** directly on the server (`2026-11-21`) instead of using GitHubOps. Dozens of coordinators and participants used the platform smoothly throughout the fest with great feedback.
- **Nov 22–25 (Sun–Wed) — Inline Forgejo Onboarding UI & Semantic Search Status:** Based on real coordinator onboarding feedback during Saturnalia, built `web/app/connect-forgejo/create-forgejo-form.tsx`, upgraded `web/app/register/page.tsx` and `web/app/connect-forgejo/page.tsx` so users without an existing Forgejo account can provision one inline without leaving Gitka, and updated `codebase-questions.tsx` to display the active semantic embedding model (`nvidia/nemotron-3.5-embed-1b:free`).
- **Nov 26 (Thu) — Sprint 6 Review & Final Documentation Sign-Off:** Updated `docs/ARCHITECTURE.md` with `forgejo-onboarding.ts`, `/api/auth/forgejo/register`, and `QA_EMBEDDING_MODEL`. Verified clean `bun run lint` and `bun run build` and archived the 6-week project log.
