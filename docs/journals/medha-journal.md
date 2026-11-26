Engineering Development Journal — Medha

Role: Real-Time Chat Messaging & Forgejo API Integration Lead
Project: Gitka (Self-Hosted Collaborative Development Platform)
Methodology: Agile / Incremental SDLC (software development life cycle), 6 sprints (short work cycles), Oct 15 – Nov 26, 2026
Teammates: Shubhrang (Backend, Docker & AI PR Review), Saurya (Codebase Q&A, Forgejo API & Deployment), Akshita (Frontend, DB Engineering & Documentation)

Sprint 1 (Week 1: Oct 15 – Oct 21, 2026) — Trying Out the Forgejo API & Browsing Repos

Sprint Goal: Set up the way Gitka talks to the Forgejo API to look at repositories, and check that each project can connect to Forgejo.

Oct 15 (Thu) — Sprint 1 Planning: Split the Forgejo REST API work with Saurya: Saurya took the initial setup and the calls for PR diffs and reviews, and I took repository contents, checking members and repos, and the APIs for team collaboration.
Oct 16–18 (Fri–Sun) — Forgejo Repository Contents & README: Tried Forgejo's /api/v1/repos/{owner}/{repo}, /contents, and /raw/README.md endpoints on the Forgejo instance running in Docker. Added safe handling of file paths and clear 404 / 503 error responses to web/lib/forgejo.ts.
Oct 19–20 (Mon–Tue) — Linking Projects & Checking Member Access: Added a check that the repository exists in POST /api/projects/route.ts, and a check when inviting members in POST /api/projects/[id]/members/route.ts, so projects can only be linked to real Forgejo repositories and owners can invite teammates who are already registered.
Oct 21 (Wed) — Sprint 1 Review & Retro: Tested repo file browsing and member management from start to finish with Akshita's project screens. Retro note: Returning 404 whenever a non-member tries to access something, in every API route from the start, gave us one consistent security pattern for every later feature.
Sprint 2 (Week 2: Oct 22 – Oct 28, 2026) — First Project Chat & More Forgejo Branch/PR Features

Sprint Goal: Deliver the first version of the project chat API, extend our Forgejo API helper code to cover PR branches and comments, and support the Increment 2 work.

Oct 22 (Thu) — Sprint 2 Planning: Agreed with Shubhrang and Saurya on the Forgejo PR endpoints needed for Increment 2, and began planning the design of Increment 3, real-time project chat.
Oct 23–25 (Fri–Sun) — Forgejo Branch & Comment Endpoints: Extended our Forgejo REST code to list branches (/branches?limit=100), find a repository's default branch, and look up PR issue and review comments (pullCommentsPath). Made sure every request handles URL-encoded owner/repo names safely.
Oct 26–27 (Mon–Tue) — Project Chat Messages API (web/app/api/projects/[id]/messages/route.ts): Built the first GET (latest 100 messages) and POST endpoints, which store messages in project_chat_messages. They require a logged-in session, a membership check, and a message length of 1 to 2000 characters (1..2000 chars).
Oct 28 (Wed) — Sprint 2 Review & Retro: Checked Forgejo branch viewing and basic chat message saving, alongside the team's AI PR review demo. Retro note: Chat that keeps asking the server for new messages (polling) was fine for a prototype, which confirmed our Sprint 3 goal of moving to Server-Sent Events (SSE), where the server pushes new messages to the browser, using PostgreSQL LISTEN/NOTIFY (a built-in way for the database to announce changes).
Sprint 3 (Week 3: Oct 29 – Nov 4, 2026) — Multi-Channel Live Chat (SSE + LISTEN/NOTIFY)

Sprint Goal: Build a team chat that is ready for real use, with several channels, live updates through SSE using PostgreSQL LISTEN/NOTIFY, and cursor-based pagination (loading messages page by page).

Oct 29 (Thu) — Sprint 3 Planning: Worked with Akshita to finish 020_create_chat_tables.sql (chat_channels + chat_messages + a combined (channel_id, created_at, id) index), and with Shubhrang on the size of the PostgreSQL connection pool (max: 5).
Oct 30–31 (Fri–Sat) — Channel & Paginated Message APIs: Built GET /api/projects/[id]/channels/route.ts and GET/POST /api/projects/[id]/channels/[channelId]/messages/route.ts:
Showed only the sender's id and display_name, and never included the user's email in chat data.
Built stable cursor pagination (an encoded bookmark, in base64url) based on (created_at, id), with limit capped at 100.
Put the message INSERT and SELECT pg_notify('chat_channel_' || channelId, payload) inside one SQL transaction, so if a save is undone, no false notification is sent. The notification only contains { channelId, messageId }.
Nov 1–3 (Sun–Tue) — Live SSE Stream (web/app/api/projects/[id]/channels/[channelId]/events/route.ts): Built the SSE stream carefully so it stays stable in real use:
Gave each SSE stream its own separate new Client() connection, outside the shared pool of 5 connections, so many listeners at once cannot use up the connections the app needs for normal queries.
Added protection against reading another project's channels by guessing IDs (called IDOR): the channel must belong to the project in the URL (chat_channels.project_id = id), otherwise the route returns 404.
Added a notificationQueue (handles notifications one at a time, in order) and a pendingEvents buffer (holds events that arrive before the stream is ready) to keep messages in strict order. Also sent a : keepalive signal every 15 seconds so the connection stays open, set X-Accel-Buffering: no so reverse proxies (servers placed in front of the app) don't hold back messages, and made the cleanup safe to run more than once when a user disconnects or cancels.
Nov 4 (Wed) — Sprint 3 Review & Retro: Showed instant messaging between several users in different browser tabs, using Akshita's chat.tsx frontend, with no lost messages when connections dropped and reconnected. Retro note: Setting X-Accel-Buffering: no and the 15-second keepalives from the start avoided reverse-proxy buffering problems later, during live fest traffic.
Sprint 4 (Week 4: Nov 5 – Nov 11, 2026) — Chat + Forgejo Access Checks Made Stronger

Sprint Goal: Make the chat routes follow the same Forgejo repository access checks, support syncing PR discussions, and tighten who is allowed to use each channel.

Nov 5 (Thu) — Sprint 4 Planning: Worked with Saurya on one shared way to check repository access (web/lib/forgejo-access.ts, web/lib/codebase-access.ts), and with Shubhrang on using rate-limit.ts on the chat endpoints.
Nov 6–8 (Fri–Sun) — PR Discussion & Chat Rate Limiting: Worked together on /api/projects/[id]/pulls/[n]/comments/route.ts so discussions are sent to and loaded from Forgejo live. Added the limit of 30 messages per minute per user to the chat POST handlers, which return a clear 429 response with a Retry-After header (telling the user how long to wait).
Nov 9–10 (Mon–Tue) — Repository Access Sync & Migration Adoption: Worked with Akshita on 019_adopt_project_chat_messages.sql and made sure that creating a project (POST /api/projects) also creates the default general channel in the same transaction (both happen, or neither does). Added a Forgejo repository check at the chat and project entry points, so if someone's Forgejo access is removed, it takes effect immediately.
Nov 11 (Wed) — Sprint 4 Review & Retro: Checked how SSE reconnects, how rate limits behave, and the tests that keep projects separate from each other (404 when a channelId belongs to another project). Retro note: Keeping the message text out of the pg_notify data kept us well under PostgreSQL's 8000-byte NOTIFY limit, no matter how long a message was.
Sprint 5 (Week 5: Nov 12 – Nov 18, 2026) — Per-User Forgejo OAuth2 PKCE & Encrypted Tokens

Sprint Goal: Replace the one shared Forgejo token with a separate connection for each user, using OAuth2 PKCE (a secure login method), and store the tokens encrypted.

Nov 12 (Thu) — Sprint 5 Planning: Planned the security design with Akshita (043_forgejo_identity.sql) and Saurya, so every Gitka user connects to Forgejo as themselves instead of everyone sharing one global API token.
Nov 13–14 (Fri–Sat) — AES-256-GCM Token Encryption & OAuth Start/Callback:
Built web/lib/forgejo-token-crypto.ts, which encrypts with AES-256-GCM (using FORGEJO_TOKEN_ENCRYPTION_KEY) and adds extra authenticated data (gitka:forgejo:${userId}:${purpose}), so every encrypted secret is tied to its owner and its purpose (oauth-state, access, or refresh).
Built GET /api/auth/forgejo/start/route.ts (it creates a PKCE S256 challenge and stores a SHA-256 hash of the state value in forgejo_oauth_states) and /api/auth/forgejo/callback/route.ts (before saving the link in forgejo_identities, it checks that Forgejo returns a verified email (verified: true) that matches the email of the Gitka account).
Nov 15–16 (Sun–Mon) — Per-User Request Helpers & Token Refresh (web/lib/forgejo-auth.ts, web/lib/forgejo.ts): Built getForgejoAccessToken(userId), which locks the database row (FOR UPDATE) while it works and automatically gets a new token using the refresh token when the current one is within 60 seconds of expiring. Started using forgejoFetchAs(), forgejoFetchTextAs(), and forgejoPostAs() in projects, PRs, comments, and chat access checks, with protection against path traversal tricks (any path containing .. is rejected).
Nov 17–18 (Tue–Wed) — Testing OAuth and Sessions Together: Tested with web/scripts/test-forgejo-auth.ts and updated getCurrentUser() in session.ts so a user must have a connected Forgejo account. Users who haven't connected one are sent smoothly to /connect-forgejo.
Sprint 6 (Week 6: Nov 19 – Nov 26, 2026) — Saturnalia Operations & Easier Onboarding

Sprint Goal: Support live team coordination and Forgejo OAuth sign-ins during Saturnalia (Nov 19–21), and make Forgejo onboarding simpler after the fest.

Nov 19 (Thu) — Saturnalia Launch & Live Chat/Payment Issue Room: Supported the live Saturnalia launch while teams used Gitka's real-time SSE team chat together with the Codebase Q&A / AI chat feature on the mirror (copy) of the main Saturnalia backend repo. Backend and organizing leads shared Q&A source links directly in project chat while sorting out live payment callback issues, with no SSE dropouts and without running out of database connections.
Nov 20 (Fri) — Many Users Signing In With Their Own Identity: Watched dozens of active festival coordinators and student developers sign in through Forgejo OAuth2 PKCE, across both the payment-debugging mirror and the "Perplexed" repository. Made sure each person's PR comments and review triggers were credited to the right developer's Forgejo account.
Nov 21 (Sat) — Live "Perplexed" PR Teamwork on the Server: Supported live PR discussions and status updates in Gitka while Saurya and Shubhrang merged and deployed to production directly from the Saturnalia server for Perplexed (2026-11-21), instead of waiting for external GitHubOps pipelines. Participants and organizers gave overwhelmingly positive feedback.
Nov 22–25 (Sun–Wed) — Post-Fest Forgejo Email Check & Better Onboarding: Saw during fest onboarding that new teammates were sometimes unsure whether they already had a Forgejo account. Helped Saurya and Akshita add checkForgejoEmail() to POST /api/auth/register, so /connect-forgejo and /register first check whether a Forgejo account exists before starting PKCE OAuth.
Nov 26 (Thu) — Sprint 6 Review & Retro: Checked all OAuth, chat SSE, and Forgejo integration flows, using bun run build, and closed Sprint 6 with the team.