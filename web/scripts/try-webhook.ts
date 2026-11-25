import { createHmac } from "node:crypto";

const [repo, n] = process.argv.slice(2);
const secret = process.env.FORGEJO_WEBHOOK_SECRET;
if (!repo || !n || !secret) {
  console.error("Usage: bun --env-file=.env.local scripts/try-webhook.ts owner/name PR_NUMBER");
  process.exit(1);
}

const body = JSON.stringify({
  action: "synchronized",
  number: Number(n),
  pull_request: { number: Number(n) },
  repository: { full_name: repo },
});

async function send(label: string, signature: string) {
  const res = await fetch("http://localhost:3000/api/webhooks/forgejo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forgejo-Event": "pull_request_sync",
      "X-Forgejo-Signature": signature,
    },
    body,
  });
  console.log(label, res.status, await res.text());
}

await send("bad signature :", "deadbeef");
await send("good signature:", createHmac("sha256", secret).update(body).digest("hex"));