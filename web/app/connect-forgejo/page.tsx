import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { forgejoHomeUrl } from "@/lib/forgejo-links";
import {
  canProvisionForgejoAccount,
  checkForgejoEmail,
  suggestForgejoUsername,
} from "@/lib/forgejo-onboarding";
import { getCurrentUser, getSessionUser } from "@/lib/session";
import CreateForgejoForm from "./create-forgejo-form";

function describeError(error?: string) {
  if (!error) return null;
  if (error === "email") {
    return "The authorized Forgejo account does not have a matching verified email. Sign in with the correct account and try again.";
  }
  if (error === "configuration") {
    return "Forgejo sign-in is not configured. Contact the administrator.";
  }
  return "Could not connect the Forgejo account. Please try again.";
}

async function Connect({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  if (!error && (await getCurrentUser())) redirect("/");

  const errorMessage = describeError(error);
  const forgejoStatus = await checkForgejoEmail(String(user.email));
  const signup = forgejoHomeUrl("user", "sign_up");

  if (forgejoStatus === "not_found" && canProvisionForgejoAccount()) {
    return (
      <main>
        <CreateForgejoForm
          email={String(user.email)}
          suggestedUsername={suggestForgejoUsername(String(user.email), String(user.display_name))}
          initialError={errorMessage}
        />
      </main>
    );
  }

  return (
    <main className="auth-form">
      <h1 className="text-2xl font-bold">Connect Forgejo</h1>
      {forgejoStatus === "exists" ? (
        <p className="text-sm leading-relaxed text-muted">
          A Forgejo account already exists for{" "}
          <strong className="break-all text-foreground">{user.email}</strong>. Sign in to
          Forgejo and authorize Gitka to connect your accounts.
        </p>
      ) : forgejoStatus === "not_found" ? (
        <p className="text-sm leading-relaxed text-muted">
          No Forgejo account was found for{" "}
          <strong className="break-all text-foreground">{user.email}</strong>. Create a Forgejo
          account with that verified email, then return here to connect it.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted">
          A Forgejo account is required. Sign in to Forgejo and authorize Gitka. Your Forgejo
          account must have the verified email{" "}
          <strong className="break-all text-foreground">{user.email}</strong>.
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      {forgejoStatus === "not_found" && signup ? (
        <>
          <a href={signup} className="button button-primary w-full">
            Create Forgejo account
          </a>
          <p className="text-sm text-muted">
            Already created it?{" "}
            <a href="/api/auth/forgejo/start" className="text-accent underline underline-offset-4">
              Connect Forgejo account
            </a>
            .
          </p>
        </>
      ) : (
        <>
          <a href="/api/auth/forgejo/start" className="button button-primary w-full">
            Connect Forgejo account
          </a>
          {forgejoStatus === "unknown" && signup && (
            <p className="text-sm text-muted">
              Need a Forgejo account?{" "}
              <a href={signup} className="text-accent underline underline-offset-4">
                Create one in Forgejo
              </a>
              , then return here to connect it.
            </p>
          )}
        </>
      )}
      <p className="text-sm text-muted">
        Want a different Gitka account?{" "}
        <Link href="/login" className="text-accent underline underline-offset-4">
          Log in
        </Link>
        .
      </p>
    </main>
  );
}

export default function ConnectPage(props: { searchParams: Promise<{ error?: string }> }) {
  return (
    <Suspense fallback={<p role="status" className="p-8">Loading…</p>}>
      <Connect {...props} />
    </Suspense>
  );
}
