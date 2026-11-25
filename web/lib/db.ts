import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });
  // An idle client can die (DB restart, network drop). Without a listener, Node
  // treats the pool's "error" event as an uncaught exception and can kill the process.
  // The pool removes the broken client itself; we only need to log it.
  p.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error", err);
  });
  return p;
}

export const pool = globalForPg.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}