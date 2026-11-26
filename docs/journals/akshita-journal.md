Engineering Development Journal — Akshita

Role: Frontend Engineering, Database Engineering & Documentation Lead
Project: Gitka (Self-Hosted Collaborative Development Platform)
Methodology: Agile / Incremental SDLC (software development life cycle), 6 sprints (short work cycles), Oct 15 – Nov 26, 2026
Teammates: Shubhrang (Backend, Docker & AI PR Review), Saurya (Codebase Q&A, Forgejo API & Deployment), Medha (Chat Messaging & Forgejo API)

Sprint 1 (Week 1: Oct 15 – Oct 21, 2026) — Database Tables, Migration Tool & Basic UI

Sprint Goal: Design the first PostgreSQL database layout (schema), build a reliable tool for running database changes (migrations), set up the basic Next.js frontend, and start the team documentation.

Oct 15 (Thu) — Sprint 1 Planning: Worked with Shubhrang, Saurya, and Medha to decide what the database schema would cover, how the Next.js App Router would be laid out, and how we would number our Agile increments.
Oct 16–18 (Fri–Sun) — Migration Tool & Core Tables (001–002): Built web/scripts/migrate.ts, which records every applied change in the schema_migrations table (each change is applied completely or not at all). This lets every teammate run the SQL migrations safely, even more than once, with bun run migrate. Wrote:
web/migrations/001_create_users.sql (the users table, where each email must be unique and lowercase, and ids are generated automatically with GENERATED ALWAYS AS IDENTITY).
web/migrations/002_create_projects_and_sessions.sql (the projects, project_members, and sessions tables; project_members uses the combined key (project_id, user_id) and only allows the roles 'owner' or 'member'; sessions has an index for faster lookups).
Oct 19–20 (Mon–Tue) — App Router Setup & Documentation Outline: Set up web/app/layout.tsx, web/app/globals.css, and the landing page web/app/page.tsx. Wrote the first setup instructions in README.md so all four teammates could run Postgres, Forgejo, and Next.js the same way.
Oct 21 (Wed) — Sprint 1 Review & Retro: Checked that the schema builds correctly on brand-new Docker Postgres databases. Retro note: Deciding early that each increment gets its own range of three-digit migration numbers (001–009, 010–019, 020–029, 030–039, 040–049) completely avoided merge conflicts across all 6 weeks.
Sprint 2 (Week 2: Oct 22 – Oct 28, 2026) — Login/Project Screens, Review Tables & Team Docs

Sprint Goal: Build the login and project screens users see, design the database tables for AI PR review, and publish our engineering rules in ARCHITECTURE.md and CONTRIBUTING.md.

Oct 22 (Thu) — Sprint 2 Planning: Agreed with Shubhrang on the rules for the pr_reviews and review_comments tables, and with Medha on how the project member screens should work.
Oct 23–24 (Fri–Sat) — Login & Project Management Frontend: Built web/app/login/page.tsx, web/app/register/page.tsx, web/app/projects/page.tsx, create-project-form.tsx, logout-button.tsx, web/app/projects/[id]/page.tsx (file tree + README view), and add-member-form.tsx (shown only to project owners).
Oct 25–26 (Sun–Mon) — PR Review Database Work (010–011): Wrote web/migrations/010_pr_reviews.sql (pr_reviews, where each combination of (project_id, pr_number, head_sha) can appear only once, and review_comments, which are deleted automatically when their review is deleted and only allow valid severity values) and web/migrations/011_review_attempts.sql, which adds an attempt_token (a unique ID) and publish_started_at so Shubhrang's logic can take over a review whose earlier worker got stuck (stale).
Oct 27 (Tue) — Engineering Playbooks: Wrote docs/ARCHITECTURE.md and CONTRIBUTING.md, which explain our rules for writing SQL safely with parameters, how Next.js 16 passes params as a Promise, branch naming (inc<number>-<description>), the pull request review process, and rules for safe migrations.
Oct 28 (Wed) — Sprint 2 Review & Retro: Showed the full flow of logging in, creating a project, adding a member, and opening a repo, and got the team's approval of CONTRIBUTING.md.
Sprint 3 (Week 3: Oct 29 – Nov 4, 2026) — Chat Database, PR Pages & Live Chat Screen

Sprint Goal: Design fast chat tables and indexes, build the PR list and PR detail pages and the AI review panel, and deliver the real-time team chat screen.

Oct 29 (Thu) — Sprint 3 Planning: Worked with Medha on the chat channel tables and the index used for cursor pagination (loading messages page by page), and with Shubhrang and Saurya on how the PR review panel should look and feel.
Oct 30–31 (Fri–Sat) — Chat Database Work (019–021):
Wrote web/migrations/020_create_chat_tables.sql, which creates chat_channels (each channel name must be unique within a project: UNIQUE (project_id, name)), chat_messages (message text must be 1 to 2000 characters after trimming spaces: CHECK (char_length(trim(content)) BETWEEN 1 AND 2000)), and a combined index chat_messages_channel_created_idx on (channel_id, created_at, id) so messages load quickly page by page. It also automatically adds a general channel to projects that already existed.
Added 019_adopt_project_chat_messages.sql and 021_project_chat_messages.sql so the channel and project chat migrations run in the right order and are safe to run more than once.
Nov 1–3 (Sun–Tue) — PR & Chat Frontend Components:
Built web/app/projects/[id]/pulls/page.tsx, pulls/[n]/page.tsx, and review-panel.tsx (it keeps checking the status while a review is pending, shows color-coded severity badges for critical, warning, and info, and links to lines in the diff).
Built web/app/projects/[id]/chat/page.tsx and chat.tsx, connected to Medha's SSE endpoint (the server pushes new messages to the browser as they arrive). Messages show up live, and the form updates instantly before the server confirms.
Nov 4 (Wed) — Sprint 3 Review & Retro: Tested how PR reviews display and how live chat works with several users in different browser sessions, and updated docs/ARCHITECTURE.md with the chat tables and a map of the SSE routes.
Sprint 4 (Week 4: Nov 5 – Nov 11, 2026) — Codebase Q&A Tables, Earl Grey Look & PR Discussion

Sprint Goal: Design the pgvector database migrations (pgvector stores data used for meaning-based search) for Codebase Q&A, build the Q&A and PR discussion screens, and give Gitka and Forgejo the same Earl Grey look.

Nov 5 (Thu) — Sprint 4 Planning: Worked with Saurya on the pgvector table design and with the whole team on making Gitka and Forgejo look consistent.
Nov 6–7 (Fri–Sat) — Vector & Q&A Database Migrations (030, 042): Wrote web/migrations/030_codebase_index.sql (codebase_indexes and codebase_chunks, with pgvector vector columns for meaning-based search and a tsvector GIN index for keyword search, both used by Saurya's hybrid search) and web/migrations/042_qa_conversations_and_jobs.sql (qa_conversations, qa_messages, and qa_index_jobs, a job queue where a worker temporarily "leases" a job).
Nov 8–9 (Sun–Mon) — Shared Earl Grey Look & Common Project Layout:
Copied the Earl Grey stylesheet into the project (forgejo/earl-grey/theme-earl-grey.css, forgejo/earl-grey/LICENSE) and created forgejo/branding/gitka.svg + web/public/GitkaLogo.png, so Forgejo and Gitka share the same dark colors and branding.
Built web/app/projects/[id]/layout.tsx, project-nav.tsx, error.tsx, not-found.tsx, and improved globals.css so spacing and navigation are consistent across Overview, Pull Requests, Team Chat, and Codebase Q&A.
Nov 10 (Tue) — Q&A & PR Creation/Discussion Screens: Built web/app/projects/[id]/qa/page.tsx, codebase-questions.tsx (shows answers as they are generated, with clickable source links to the exact Forgejo commit), discussion-panel.tsx, create-pull-form.tsx, and create-repository-form.tsx.
Nov 11 (Wed) — Sprint 4 Review & Retro: Showed the shared Earl Grey look across both apps and checked that nothing spills sideways on mobile screens (375px wide).
Sprint 5 (Week 5: Nov 12 – Nov 18, 2026) — Safety Migrations, Accessibility (WCAG) Check & QA Docs

Sprint Goal: Finish the Increment 5 database tables, check that all pages follow the Next.js 16 Suspense / Cache Components rules, verify that text is easy enough to read (color contrast), and write the formal QA (testing) documentation.

Nov 12 (Thu) — Sprint 5 Planning: Planned the Increment 5 hardening migrations (040–043) (changes that make the app safer and more reliable), frontend accessibility, and full documentation before Saturnalia.
Nov 13–14 (Fri–Sat) — Increment 5 Migrations (040, 041, 043):
web/migrations/040_rate_limits.sql for Shubhrang's rate-limit counters in PostgreSQL (they limit how often something can be done).
web/migrations/041_dashboard_latest_review.sql to make the latest-review lookups on the /projects dashboard faster.
web/migrations/043_forgejo_identity.sql (forgejo_identities and forgejo_oauth_states) for Medha's PKCE OAuth linking (a secure way to connect a user's Forgejo account).
Nov 15–16 (Sun–Mon) — Frontend Polish & Accessibility Check: Put the code that reads cookies and URLs inside <Suspense> so it follows the Next.js 16 Cache Components rules (projects/page.tsx, connect-forgejo/page.tsx), fixed bugs where the browser did not move to the right page after login and logout, and checked color contrast against the WCAG accessibility standard on the Earl Grey theme (11.87:1 for main text, 6.52:1 for muted text, 8.71:1 for the main button). Also confirmed nothing spills sideways at 375px.
Nov 17–18 (Tue–Wed) — Formal QA & Architecture Documentation: Wrote docs/QA-DEMO.md, which records all 22 end-to-end (E2E) checks, the mobile layout checks, and the tests that simulate errors from services Gitka depends on and check that the error details are kept. Updated README.md and docs/ARCHITECTURE.md to show Increments 1–5 as complete.
Sprint 6 (Week 6: Nov 19 – Nov 26, 2026) — Saturnalia Support, Sign-Up Screen & Final Docs

Sprint Goal: Help live fest users on the Saturnalia server, improve the Forgejo registration experience using real user feedback, and finish the project documentation.

Nov 19 (Thu) — Saturnalia Goes Live & UI Support: Helped Saurya and Shubhrang while Saturnalia went live on the production server (the real, live server). Helped backend responders use the Codebase Q&A screen on the copy (mirror) of the main Saturnalia backend repo, so they could read the source links (citations) for payment handlers on both desktop and mobile while sorting out live issues. Meanwhile, team chat was used to coordinate fixes among organizers.
Nov 20–21 (Fri–Sat) — Live "Perplexed" Fest Operations: Watched the screens and the database changes and indexes on the Saturnalia server while the team reviewed and merged urgent live fixes (hotfixes) for "Perplexed" directly on the server (2026-11-21) instead of using GitHubOps. Dozens of coordinators and participants used the platform smoothly during the fest and gave great feedback.
Nov 22–25 (Sun–Wed) — Built-in Forgejo Account Creation & Search Model Display: Using feedback from real coordinators who signed up during Saturnalia, built web/app/connect-forgejo/create-forgejo-form.tsx and upgraded web/app/register/page.tsx and web/app/connect-forgejo/page.tsx, so users who don't have a Forgejo account can create one right inside Gitka without leaving it. Also updated codebase-questions.tsx to show which meaning-based search (embedding) model is in use (nvidia/nemotron-3.5-embed-1b:free).
Nov 26 (Thu) — Sprint 6 Review & Final Documentation Sign-Off: Updated docs/ARCHITECTURE.md with forgejo-onboarding.ts, /api/auth/forgejo/register, and QA_EMBEDDING_MODEL. Confirmed that bun run lint and bun run build ran without errors, and archived the 6-week project log.