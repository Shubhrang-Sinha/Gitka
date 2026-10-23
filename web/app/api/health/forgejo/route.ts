import { NextResponse } from "next/server";
import { forgejoFetch } from "@/lib/forgejo";

type ForgejoUser = { login: string };
type ForgejoRepo = { full_name: string; private: boolean };

export async function GET() {
  try {
    const user = await forgejoFetch<ForgejoUser>("/user");
    const repos = await forgejoFetch<ForgejoRepo[]>("/user/repos?limit=50");

    return NextResponse.json({
      ok: true,
      user: user.login,
      repos: repos.map((repo) => repo.full_name),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}