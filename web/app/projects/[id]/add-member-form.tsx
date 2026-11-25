"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddMemberForm({
  projectId,
}: {
  projectId: number | string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not add member");
        return;
      }
      setEmail("");
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <label htmlFor="member-email" className="block text-sm font-medium">Member email</label>
      <input
        id="member-email"
        className="field"
        type="email"
        placeholder="Email of a registered user"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="button button-primary"
      >
        {loading ? "Adding..." : "Add member"}
      </button>
    </form>
  );
}
