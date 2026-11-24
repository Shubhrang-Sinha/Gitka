import { connection, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  await connection();
  try {
    const result = await pool.query(
      `SELECT current_database() AS db,
              (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS pgvector`,
    );
    return NextResponse.json({ ok: true, ...result.rows[0] });
  } catch (error) {
    console.error("PostgreSQL health check failed:", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
