import { getPull, getPullDiff, postReview } from "../lib/forgejo-pulls";
import { parseDiff } from "../lib/diff";
import { reviewDiff } from "../lib/review";

const [repo, n] = process.argv.slice(2);
if (!repo || !n) {
  console.error("Usage: bun --env-file=.env.local scripts/try-post.ts owner/name PR_NUMBER");
  process.exit(1);
}
const num = Number(n);
const pr = await getPull(repo, num);
const files = parseDiff(await getPullDiff(repo, num));
const result = await reviewDiff(pr.title, pr.body ?? "", files);
console.log(`Model: ${result.model}, findings: ${result.findings.length}`);

const posted = await postReview(repo, num, pr.head.sha, result.summary, result.findings);
console.log("Posted review id:", posted.id);