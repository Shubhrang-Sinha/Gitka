"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Registration failed");
        return;
      }
      router.push("/connect-forgejo");
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <form onSubmit={handleSubmit} className="auth-form">
        <h1 className="text-2xl font-bold">Create an account</h1>

        <div className="space-y-1.5">
          <label htmlFor="display-name" className="block text-sm font-medium">Display name</label>
          <input
            id="display-name"
            autoComplete="nickname"
            className="field"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input
            id="email"
            autoComplete="email"
            className="field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
          <input
            id="password"
            autoComplete="new-password"
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            aria-describedby="password-hint"
            required
          />
          <p id="password-hint" className="text-sm text-muted">Use at least 8 characters.</p>
        </div>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="button button-primary w-full"
        >
          {loading ? "Creating..." : "Register"}
        </button>

        <p className="text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent underline underline-offset-4">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
