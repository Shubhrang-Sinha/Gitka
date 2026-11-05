import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user });
}