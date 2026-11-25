"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      router.push("/projects");
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <form onSubmit={handleSubmit} className="auth-form">
        <h1 className="text-2xl font-bold">Log in</h1>

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
            autoComplete="current-password"
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="button button-primary w-full"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>

        <p className="text-sm text-muted">
          No account yet?{" "}
          <Link href="/register" className="font-medium text-accent underline underline-offset-4">
            Register
          </Link>
        </p>
      </form>
    </main>
  );
}
