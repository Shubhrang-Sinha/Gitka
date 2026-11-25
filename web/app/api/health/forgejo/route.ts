import { NextResponse } from "next/server";
import { forgejoFetch } from "@/lib/forgejo";

type ForgejoUser = { login: string };

export async function GET() {
  try {
    // One cheap call is enough to prove the server is reachable and the token works.
    await forgejoFetch<ForgejoUser>("/user");
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Details stay in the server logs, not in the response.
    console.error("Forgejo health check failed:", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}