"use client";

import { useState } from "react";
import Link from "next/link";

type Props = {
  email: string;
  suggestedUsername: string;
  initialPassword?: string;
  initialError?: string | null;
};

export default function CreateForgejoForm({
  email,
  suggestedUsername,
  initialPassword,
  initialError = null,
}: Props) {
  const [username, setUsername] = useState(suggestedUsername);
  const [useSamePassword, setUseSamePassword] = useState(Boolean(initialPassword));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [accountExists, setAccountExists] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const chosenPassword = useSamePassword && initialPassword ? initialPassword : password;

    try {
      const res = await fetch("/api/auth/forgejo/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: chosenPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not create the Forgejo account.");
        if (data.exists) setAccountExists(true);
        setLoading(false);
        return;
      }

      window.location.replace("/api/auth/forgejo/start");
    } catch {
      setError("Could not reach the server.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h1 className="text-2xl font-bold">Create Forgejo account</h1>
      <p className="text-sm leading-relaxed text-muted">
        No Forgejo account was found for{" "}
        <strong className="break-all text-foreground">{email}</strong>. Create your Forgejo
        account below, then authorize Gitka to connect it.
      </p>

      <div className="space-y-1.5">
        <label htmlFor="forgejo-username" className="block text-sm font-medium">
          Forgejo username
        </label>
        <input
          id="forgejo-username"
          autoComplete="username"
          className="field"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={40}
          aria-describedby="forgejo-username-hint"
          required
        />
        <p id="forgejo-username-hint" className="text-sm text-muted">
          Letters, numbers, dots, underscores, or hyphens.
        </p>
      </div>

      {initialPassword !== undefined && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useSamePassword}
            onChange={(e) => setUseSamePassword(e.target.checked)}
            className="size-4 accent-accent"
          />
          <span>Use the same password as Gitka</span>
        </label>
      )}

      {(!initialPassword || !useSamePassword) && (
        <div className="space-y-1.5">
          <label htmlFor="forgejo-password" className="block text-sm font-medium">
            Forgejo password
          </label>
          <input
            id="forgejo-password"
            autoComplete="new-password"
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            aria-describedby="forgejo-password-hint"
            required
          />
          <p id="forgejo-password-hint" className="text-sm text-muted">
            Use at least 8 characters. You can use your Gitka password.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {accountExists ? (
        <a href="/api/auth/forgejo/start" className="button button-primary w-full">
          Connect Forgejo account
        </a>
      ) : (
        <button type="submit" disabled={loading} className="button button-primary w-full">
          {loading ? "Creating Forgejo account..." : "Create Forgejo account & connect"}
        </button>
      )}

      <p className="text-sm text-muted">
        Want a different Gitka account?{" "}
        <Link href="/login" className="text-accent underline underline-offset-4">
          Log in
        </Link>
        .
      </p>
    </form>
  );
}
