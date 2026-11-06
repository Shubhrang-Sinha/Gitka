"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [forgejoRepo, setForgejoRepo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, forgejoRepo }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not create project");
        return;
      }
      setName("");
      setForgejoRepo("");
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-gray-400 p-4">
      <h2 className="font-semibold">New project</h2>
      <input
        className="w-full rounded border border-gray-400 bg-transparent p-2"
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="w-full rounded border border-gray-400 bg-transparent p-2"
        placeholder="Forgejo repo (owner/name)"
        value={forgejoRepo}
        onChange={(e) => setForgejoRepo(e.target.value)}
        required
      />
      {error && <p className="text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create project"}
      </button>
    </form>
  );
}