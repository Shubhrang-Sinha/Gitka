import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(scriptDir, "..", "migrations");

// Arbitrary constant that identifies "a migration run" to Postgres.
// Every runner must use the same number.
const MIGRATION_LOCK_KEY = 827364501;

async function main() {
  // One dedicated connection for the whole run: advisory locks belong to a
  // connection, and each migration's transaction must stay on one connection too.
  const client = await pool.connect();
  let destroyClient = false;

  try {
    const got = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS locked",
      [MIGRATION_LOCK_KEY],
    );
    if (!got.rows[0].locked) {
      console.log("Another migration run is in progress. Waiting for it to finish...");
      await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_KEY]);
    }

    // Everything below runs while we hold the lock.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations",
    );
    const appliedSet = new Set(applied.rows.map((row) => row.filename));

    const files = (await readdir(migrationsDir))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`skip   ${file}`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        console.log(`apply  ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_KEY]);
    } catch {
      // The connection is broken. Destroying it closes the session, and Postgres
      // releases session-level locks when the connection closes.
      destroyClient = true;
    }
    client.release(destroyClient);
  }
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());