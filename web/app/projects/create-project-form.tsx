"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateProjectForm({ forgejoUrl }: { forgejoUrl: string | null }) {
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
    <form
      onSubmit={handleSubmit}
      className="space-y-3 border-t border-line pt-5"
    >
      <h2 className="font-semibold">Link a repository</h2>
      <label htmlFor="project-name" className="block text-sm font-medium">Project name</label>
      <input
        id="project-name"
        className="field"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <label htmlFor="forgejo-repo" className="block text-sm font-medium">Forgejo repository</label>
      <input
        id="forgejo-repo"
        className="field"
        placeholder="owner/name"
        aria-describedby="forgejo-repo-help"
        value={forgejoRepo}
        onChange={(e) => setForgejoRepo(e.target.value)}
        required
      />
      <p id="forgejo-repo-help" className="text-sm text-muted">
        Enter the owner and name of an existing repository.
        {forgejoUrl && <> <a href={forgejoUrl} className="text-accent underline underline-offset-4">Find it in Forgejo</a>.</>}
      </p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="button"
      >
        {loading ? "Creating..." : "Create project"}
      </button>
    </form>
  );
}
