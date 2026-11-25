# Gitka classroom demo QA

## Earl Grey and navigation regression pass

- Opened the dashboard and the project overview, PR list, PR detail, chat, and
  Q&A in T3 Code. The project shell showed the active tool and the Forgejo
  repository action. The project pages had no horizontal overflow at 375 px.
- Posted a uniquely marked comment using the Gitka browser form and verified
  it in the signed-in Forgejo PR. Posted a reply using the Forgejo browser form
  and saw it after selecting **Refresh comments** in Gitka.
- Asked about the default lantern interval from the Q&A form. Opened a source
  citation in Forgejo and verified it rendered the expected file at the cited
  commit and line range.
- Verified Forgejo loaded Earl Grey and both browser applications used the
  same canvas color. The primary text, muted text, and primary button token
  pairs measured 11.87:1, 6.52:1, and 8.71:1.
- All 22 scripted checks with writes passed against the production build,
  including the repository and PR links for both demo roles. Lint, the
  production build, and the diff-path regression checks passed.

## Initial functional pass

Tested on the local Gitka and Forgejo stack using the seeded Lantern Schedule
project and a disposable Forgejo PR. This report covers the classroom demo
flow and its regressions.

| Check | Expected | Observed |
| --- | --- | --- |
| Landing page → Open projects → login, reload, and logout | Owner and teammate reach the dashboard, keep the session on reload, and lose access after logout | Passed in T3 Code after the fix |
| Open PR in Forgejo, then open Gitka’s PR list | Same PR number, title, and open state | Passed in T3 Code |
| Post a comment from Gitka | 201, confirmation, and the same comment in Forgejo | Passed using the T3 form and Forgejo API |
| Post a reply directly in Forgejo and refresh Gitka | Forgejo 201, Gitka 200, reply displayed | Passed using the Forgejo API and Gitka’s refresh button |
| Signed out, nonmember, blank input, missing PR | 401, 404, 400, and 404 respectively | Passed. Nonmember GET and POST both returned 404 |
| Comment submission encounters an upstream error | Visible error and draft preserved | Passed with a simulated 502 in the browser |
| Review the disposable PR | 202 on request, completed review published to Forgejo | Passed with the configured OpenRouter model. Forgejo returned a published COMMENT review |
| Chat and Q&A | Teammate receives a chat message and Q&A retrieves an answer | Owner’s chat POST returned 201 and teammate’s GET returned 200 with the message. Q&A returned 200 and included the seeded 17-minute interval |
| Discussion at a 375 px viewport | No page-level horizontal overflow | Passed |

The login regression was reproducible by following **Open projects** from
the landing page and signing in. The server returned 200 and the session
endpoint confirmed the session, but the browser stayed on the login page.
After login and logout now use document navigation, the browser loads
protected pages with the current cookie.

The Forgejo browser profile was signed out and received 404 on the private
PR, so the Forgejo side of the round trip was verified through its
authenticated API. The outage check exercised Gitka’s draft preservation
with a simulated 502. It did not take Forgejo offline. Next.js can return a
streamed HTML 200 for a page that renders a not-found view. The discussion
API returns a 404 for a missing PR. Gitka displays discussion bodies as plain
text and attributes Gitka submissions to the configured Forgejo account.

From `web/`, run the reproducible test against the seeded local stack.
Substitute your project ID, Forgejo repository, and disposable PR number.

```sh
bun --env-file=.env.local scripts/test-demo-e2e.ts 5 gitka-smoke/gitka-demo 3
bun --env-file=.env.local scripts/test-demo-e2e.ts 5 gitka-smoke/gitka-demo 3 --write
```

The second command adds two marked comments to the disposable PR. For a
browser pass, start at the Gitka landing page, select **Open projects**,
sign in, open the disposable PR, and submit a uniquely identifiable comment.
Open the same PR in an authenticated Forgejo session and reply. Select
**Refresh comments** in Gitka and inspect the browser network and console.

Lint, the production build, and the standalone diff-path regression checks
passed. All 22 scripted HTTP checks passed against the production build
with `GITKA_TEST_URL=http://localhost:3011` and `--write`.
