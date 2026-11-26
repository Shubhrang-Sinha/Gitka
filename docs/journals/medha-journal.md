# Engineering Development Journal — Medha

**Role:** Real-Time Chat Messaging & Forgejo API Integration Lead  
**Project:** Gitka (Self-Hosted Collaborative Development Platform)  
**Methodology:** Agile / Incremental SDLC (6 Sprints, Oct 15 – Nov 26, 2026)  
**Teammates:** Shubhrang (Backend, Docker & AI PR Review), Saurya (Codebase Q&A, Forgejo API & Deployment), Akshita (Frontend, DB Engineering & Documentation)

---

## Sprint 1 (Week 1: Oct 15 – Oct 21, 2026) — Forgejo API Exploration & Repo Browsing
**Sprint Goal:** Establish Forgejo API integration patterns for repository inspection and verify project-level Forgejo connectivity.

- **Oct 15 (Thu) — Sprint 1 Planning:** Divided Forgejo REST API responsibilities with Saurya: Saurya focused on initial bootstrap and PR diff/review calls, while I focused on repository contents, member/repo verification, and team collaboration APIs.
- **Oct 16–18 (Fri–Sun) — Forgejo Repository Content & README Integration:** Tested Forgejo's `/api/v1/repos/{owner}/{repo}`, `/contents`, and `/raw/README.md` endpoints against the containerized Forgejo instance. Integrated safe path handling and clean `404` / `503` error mapping into `web/lib/forgejo.ts`.
- **Oct 19–20 (Mon–Tue) — Project Linking & Member Access Verification:** Implemented repository existence checks inside `POST /api/projects/route.ts` and member invitation checks in `POST /api/projects/[id]/members/route.ts` so projects can only link valid Forgejo repositories and owners can invite registered teammates cleanly.
- **Oct 21 (Wed) — Sprint 1 Review & Retro:** Validated repo file browsing and member management end-to-end with Akshita's project UI. *Retro note:* Enforcing `404` on non-member access across API routes early established a consistent security pattern for every feature afterward.

---

## Sprint 2 (Week 2: Oct 22 – Oct 28, 2026) — Project Chat MVP & Forgejo Branch/PR Extensions
**Sprint Goal:** Deliver an initial project chat API, extend Forgejo API wrappers for PR branches and comments, and support Increment 2 integration.

- **Oct 22 (Thu) — Sprint 2 Planning:** Coordinated with Shubhrang and Saurya on Forgejo PR endpoints needed for Increment 2 and began architectural planning for Increment 3 real-time project chat.
- **Oct 23–25 (Fri–Sun) — Forgejo Branch & Comment Endpoints:** Extended Forgejo REST integrations to support branch listing (`/branches?limit=100`), repository default branch detection, and PR issue/review comment lookups (`pullCommentsPath`), making sure all requests handle URL-encoded `owner/repo` pairs safely.
- **Oct 26–27 (Mon–Tue) — Project Chat Messages API (`web/app/api/projects/[id]/messages/route.ts`):** Built initial `GET` (latest 100 messages) and `POST` endpoints backed by `project_chat_messages`, enforcing session auth, membership checks, and message length constraints (`1..2000` chars).
- **Oct 28 (Wed) — Sprint 2 Review & Retro:** Verified Forgejo branch inspection and baseline project chat persistence alongside the team's AI PR review demo. *Retro note:* Polling chat worked for a prototype, which confirmed our Sprint 3 goal to move to push-based Server-Sent Events (SSE) with PostgreSQL `LISTEN`/`NOTIFY`.

---

## Sprint 3 (Week 3: Oct 29 – Nov 4, 2026) — Multi-Channel Real-Time Chat (SSE + LISTEN/NOTIFY)
**Sprint Goal:** Build production-grade multi-channel team chat with real-time PostgreSQL `LISTEN`/`NOTIFY` SSE streaming and cursor-based pagination.

- **Oct 29 (Thu) — Sprint 3 Planning:** Paired with Akshita to finalize `020_create_chat_tables.sql` (`chat_channels` + `chat_messages` + composite `(channel_id, created_at, id)` index) and with Shubhrang on PostgreSQL connection pool sizing (`max: 5`).
- **Oct 30–31 (Fri–Sat) — Channel & Paginated Message APIs:** Implemented `GET /api/projects/[id]/channels/route.ts` and `GET/POST /api/projects/[id]/channels/[channelId]/messages/route.ts`:
  - Exposed strictly `id` and `display_name` on senders (never leaking user `email` in chat payloads).
  - Built stable base64url cursor pagination over `(created_at, id)` with `limit` bounded up to 100.
  - Wrapped message `INSERT` and `SELECT pg_notify('chat_channel_' || channelId, payload)` inside a single SQL transaction so rolled-back writes never emit phantom notifications, keeping notification payloads strictly `{ channelId, messageId }`.
- **Nov 1–3 (Sun–Tue) — Real-Time SSE Stream (`web/app/api/projects/[id]/channels/[channelId]/events/route.ts`):** Engineered the SSE stream carefully for production stability:
  - Dedicated a standalone `new Client()` per SSE stream outside the shared 5-connection `pool` so concurrent listeners cannot starve app queries.
  - Added cross-project IDOR guards (`chat_channels.project_id = id`, returning `404`).
  - Implemented a serialized `notificationQueue` promise chain + pre-controller `pendingEvents` buffer to guarantee strict message ordering, 15s `: keepalive` heartbeats, `X-Accel-Buffering: no` for reverse proxies, and idempotent cleanup on abort/disconnect.
- **Nov 4 (Wed) — Sprint 3 Review & Retro:** Demoed instant multi-user messaging across browser tabs with Akshita's `chat.tsx` frontend and zero dropped messages under reconnects. *Retro note:* Setting `X-Accel-Buffering: no` and 15s keepalives upfront prevented reverse-proxy buffering issues later during live fest traffic.

---

## Sprint 4 (Week 4: Nov 5 – Nov 11, 2026) — Unified Chat + Forgejo Access Hardening
**Sprint Goal:** Align chat routes with Forgejo repository access checks, support PR discussion sync, and harden channel authorization.

- **Nov 5 (Thu) — Sprint 4 Planning:** Coordinated with Saurya on unified repository access checks (`web/lib/forgejo-access.ts`, `web/lib/codebase-access.ts`) and with Shubhrang on applying `rate-limit.ts` to chat endpoints.
- **Nov 6–8 (Fri–Sun) — PR Discussion & Chat Rate Limiting:** Collaborated on `/api/projects/[id]/pulls/[n]/comments/route.ts` for live Forgejo discussion round-trips and wired the 30 sends/min/user rate limit into chat `POST` handlers with clean `429` + `Retry-After` responses.
- **Nov 9–10 (Mon–Tue) — Repository Access Sync & Migration Adoption:** Worked with Akshita on `019_adopt_project_chat_messages.sql` and ensured every project creation (`POST /api/projects`) atomically provisions the default `general` channel in the same transaction. Added Forgejo repository verification to chat/project entry points so revoked Forgejo access is respected immediately.
- **Nov 11 (Wed) — Sprint 4 Review & Retro:** Verified SSE reconnection behavior, rate-limit handling, and cross-project isolation tests (`404` on foreign `channelId`). *Retro note:* Separating chat `pg_notify` payloads from message text kept us well under PostgreSQL's 8000-byte NOTIFY limit regardless of message size.

---

## Sprint 5 (Week 5: Nov 12 – Nov 18, 2026) — Per-User Forgejo OAuth2 PKCE & Token Encryption
**Sprint Goal:** Replace shared global Forgejo service tokens with per-user OAuth2 PKCE identities and encrypted token storage.

- **Nov 12 (Thu) — Sprint 5 Planning:** Designed the security architecture with Akshita (`043_forgejo_identity.sql`) and Saurya so every Gitka user authenticates with Forgejo under their own identity instead of sharing one global API token.
- **Nov 13–14 (Fri–Sat) — AES-256-GCM Token Crypto & OAuth Start/Callback:**
  - Built `web/lib/forgejo-token-crypto.ts` using AES-256-GCM (`FORGEJO_TOKEN_ENCRYPTION_KEY`) with Authenticated Additional Data (`gitka:forgejo:${userId}:${purpose}`) binding every encrypted secret to its owning user and purpose (`oauth-state`, `access`, `refresh`).
  - Implemented `GET /api/auth/forgejo/start/route.ts` (PKCE S256 challenge + SHA-256 hashed state stored in `forgejo_oauth_states`) and `/api/auth/forgejo/callback/route.ts` (verifying that Forgejo returns a `verified: true` email matching the Gitka account email before linking `forgejo_identities`).
- **Nov 15–16 (Sun–Mon) — Per-User Request Helpers & Refresh Rotation (`web/lib/forgejo-auth.ts`, `web/lib/forgejo.ts`):** Implemented `getForgejoAccessToken(userId)` with row-level `FOR UPDATE` locking and automatic OAuth refresh-token rotation when within 60 seconds of expiry. Rolled out `forgejoFetchAs()`, `forgejoFetchTextAs()`, and `forgejoPostAs()` across projects, PRs, comments, and chat access checks, with path-traversal protection (`..` segment rejection).
- **Nov 17–18 (Tue–Wed) — OAuth & Session Integration Testing:** Verified with `web/scripts/test-forgejo-auth.ts` and updated `getCurrentUser()` in `session.ts` to require a connected Forgejo identity, redirecting unconnected users seamlessly to `/connect-forgejo`.

---

## Sprint 6 (Week 6: Nov 19 – Nov 26, 2026) — Saturnalia Operations & Onboarding Refinement
**Sprint Goal:** Support real-time coordination and Forgejo OAuth user workflows during Saturnalia (Nov 19–21), and streamline post-fest Forgejo onboarding.

- **Nov 19 (Thu) — Saturnalia Launch & Live Chat/Payment War-Room:** Supported the live Saturnalia deployment as teams used Gitka's real-time SSE team chat alongside the **Codebase Q&A / AI chat** feature on the mirrored Saturnalia main backend repo. Backend and organizing leads shared Q&A citations directly in project chat while triaging live payment callback issues without any SSE drops or connection pool exhaustion.
- **Nov 20 (Fri) — Multi-User Identity Scaling:** Monitored dozens of active festival coordinators and student developers authenticating via Forgejo OAuth2 PKCE across both the payment-debugging mirror and the **"Perplexed"** repository, ensuring per-user PR comments and review triggers attributed accurately to each developer's Forgejo account.
- **Nov 21 (Sat) — Live "Perplexed" Server-Side PR Collaboration:** Supported real-time PR discussions and status updates in Gitka as Saurya and Shubhrang executed production merges and deployments directly from the Saturnalia server for **Perplexed** (`2026-11-21`) instead of waiting on external GitHubOps pipelines. Participant and organizer feedback was overwhelmingly positive.
- **Nov 22–25 (Sun–Wed) — Post-Fest Forgejo Email Check & Onboarding Improvement:** Noticed during fest onboarding that new teammates were occasionally confused about whether they already had a Forgejo account. Helped Saurya and Akshita wire `checkForgejoEmail()` into `POST /api/auth/register` so `/connect-forgejo` and `/register` inspect Forgejo account existence upfront before starting PKCE OAuth.
- **Nov 26 (Thu) — Sprint 6 Review & Retro:** Verified all OAuth, chat SSE, and Forgejo integration flows against `bun run build` and closed Sprint 6 with the team.
