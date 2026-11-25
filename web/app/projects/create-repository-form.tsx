"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateRepositoryForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/repositories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, private: isPrivate }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create repository.");
      router.push(`/projects/${data.projectId}`);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create repository."); }
    finally { setBusy(false); }
  }

  return <details className="border-t border-line pt-5">
    <summary className="min-h-11 cursor-pointer font-semibold">Create a repository</summary>
    <form onSubmit={submit} className="space-y-3 pb-5">
      <p className="text-sm text-muted">Create a repository in your connected account and open it in Gitka.</p>
      <label htmlFor="new-repository-name" className="block text-sm font-medium">Repository name</label>
      <input id="new-repository-name" className="field" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
      <label htmlFor="new-repository-description" className="block text-sm font-medium">Description <span className="text-muted">(optional)</span></label>
      <input id="new-repository-description" className="field" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={255} />
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={isPrivate} onChange={(event) => setPrivate(event.target.checked)} /> Private repository</label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="button button-primary">{busy ? "Creating…" : "Create repository"}</button>
    </form>
  </details>;
}
