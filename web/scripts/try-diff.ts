import { getPullDiff } from "../lib/forgejo-pulls";
import { parseDiff } from "../lib/diff";

const [repo, n] = process.argv.slice(2);
if (!repo || !n) {
  console.error("Usage: bun --env-file=.env.local scripts/try-diff.ts owner/name PR_NUMBER");
  process.exit(1);
}

const files = parseDiff(await getPullDiff(repo, Number(n)));
for (const f of files) {
  console.log(`\n=== ${f.path} [${f.status}]`, f.skipped ? `SKIPPED: ${f.skipped}` : "");
  if (!f.skipped) {
    console.log(f.numbered);
    console.log("valid lines:", [...f.validLines].join(","));
  }
}