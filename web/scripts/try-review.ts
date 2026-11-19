import { getPull, getPullDiff } from "../lib/forgejo-pulls";
import { parseDiff } from "../lib/diff";
import { reviewDiff } from "../lib/review";

const [repo, n] = process.argv.slice(2);
if (!repo || !n) {
  console.error("Usage: bun --env-file=.env.local scripts/try-review.ts owner/name PR_NUMBER");
  process.exit(1);
}
const pr = await getPull(repo, Number(n));
const files = parseDiff(await getPullDiff(repo, Number(n)));
const result = await reviewDiff(pr.title, pr.body ?? "", files);
console.log(JSON.stringify(result, null, 2));