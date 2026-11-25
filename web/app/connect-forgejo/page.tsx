import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser } from "@/lib/session";
import { forgejoHomeUrl } from "@/lib/forgejo-links";

async function Connect({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  const signup = forgejoHomeUrl("user", "sign_up");
  return <main className="auth-form">
    <h1 className="text-2xl font-bold">Connect Forgejo</h1>
    <p className="text-sm leading-relaxed text-muted">A Forgejo account is required. Sign in to Forgejo and authorize Gitka. Your Forgejo account must have the verified email <strong className="break-all text-foreground">{user.email}</strong>.</p>
    {error && <p role="alert" className="text-sm text-danger">{error === "email" ? "The authorized Forgejo account does not have a matching verified email. Sign in with the correct account and try again." : error === "configuration" ? "Forgejo sign-in is not configured. Contact the administrator." : "Could not connect the Forgejo account. Please try again."}</p>}
    <a href="/api/auth/forgejo/start" className="button button-primary w-full">Connect Forgejo account</a>
    {signup && <p className="text-sm text-muted">Need a Forgejo account? <a href={signup} className="text-accent underline underline-offset-4">Create one in Forgejo</a>, then return here to connect it.</p>}
    <p className="text-sm text-muted">Want a different Gitka account? <Link href="/login" className="text-accent underline underline-offset-4">Log in</Link>.</p>
  </main>;
}
export default function ConnectPage(props: { searchParams: Promise<{ error?: string }> }) {
  return <Suspense fallback={<p role="status" className="p-8">Loading…</p>}><Connect {...props} /></Suspense>;
}
