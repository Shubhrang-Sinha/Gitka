import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
export async function GET() {
  try {
    const result = await pool.query(
      `SELECT current_database() AS db,
              (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS pgvector`
    );
    return NextResponse.json({ ok: true, ...result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}