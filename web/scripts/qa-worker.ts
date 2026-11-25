import { runNextIndexJob } from "../lib/qa-jobs";
import { pool } from "../lib/db";

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
console.log("Q&A index worker started");
while (!stopping) {
  try {
    if (await runNextIndexJob()) continue;
  } catch (error) {
    console.error("Q&A worker could not claim a job", error instanceof Error ? error.message : "Unknown error");
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
await pool.end();
