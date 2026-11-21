import { parseDiff } from "../lib/diff";

function mk(plusLine: string, gitLine: string) {
  return [
    `diff --git ${gitLine}`,
    "new file mode 100644",
    "index 0000000..e69de29",
    "--- /dev/null",
    plusLine,
    "@@ -0,0 +1 @@",
    "+x",
    "",
  ].join("\n");
}

const cases = [
  { name: "plain path", diff: mk("+++ b/src/app.ts", "a/src/app.ts b/src/app.ts"), path: "src/app.ts" },
  { name: "space + tab", diff: mk("+++ b/my file.ts\t", "a/my file.ts b/my file.ts"), path: "my file.ts" },
  {
    name: "quote in name",
    diff: mk(String.raw`+++ "b/a\"b.ts"`, String.raw`"a/a\"b.ts" "b/a\"b.ts"`),
    path: 'a"b.ts',
  },
  {
    name: "utf-8 octal escapes",
    diff: mk(String.raw`+++ "b/caf\303\251.ts"`, String.raw`"a/caf\303\251.ts" "b/caf\303\251.ts"`),
    path: "café.ts",
  },
  {
    name: "image with space is skipped",
    diff: mk("+++ b/my image.png\t", "a/my image.png b/my image.png"),
    path: "my image.png",
    skipped: true,
  },
];

let failed = 0;
for (const c of cases) {
  const [f] = parseDiff(c.diff);
  const ok = f?.path === c.path && (c.skipped ? !!f.skipped : !f.skipped);
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", c.name, ok ? "" : `-> got ${JSON.stringify(f?.path)}, skipped=${f?.skipped}`);
}
process.exit(failed ? 1 : 0);