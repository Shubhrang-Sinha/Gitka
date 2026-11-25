"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreatePullForm({ projectId, branches, defaultBranch }: { projectId: string; branches: string[]; defaultBranch: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState(branches.find((branch) => branch !== defaultBranch) ?? "");
  const [base, setBase] = useState(defaultBranch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/pulls`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, head, base }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create pull request.");
      router.push(`/projects/${projectId}/pulls/${data.number}`);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create pull request."); }
    finally { setBusy(false); }
  }
  return <details className="rounded-xl border border-line bg-panel p-4">
    <summary className="min-h-9 cursor-pointer font-semibold">New pull request</summary>
    {branches.length < 2 ? <p className="text-sm text-muted">Push another branch to create a pull request.</p> :
      <form onSubmit={submit} className="space-y-3">
        {branches.length >= 100 && <p className="text-sm text-muted">Showing the first 100 branches.</p>}
        <label className="block text-sm font-medium" htmlFor="pull-title">Title</label>
        <input id="pull-title" className="field" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} required />
        <label className="block text-sm font-medium" htmlFor="pull-head">From branch</label>
        <select id="pull-head" className="field" value={head} onChange={(event) => setHead(event.target.value)} required><option value="">Select a branch</option>{branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select>
        <label className="block text-sm font-medium" htmlFor="pull-base">Into branch</label>
        <select id="pull-base" className="field" value={base} onChange={(event) => setBase(event.target.value)} required><option value="">Select a branch</option>{branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select>
        <label className="block text-sm font-medium" htmlFor="pull-body">Description <span className="text-muted">(optional)</span></label>
        <textarea id="pull-body" className="field" value={body} onChange={(event) => setBody(event.target.value)} maxLength={20000} rows={4} />
        {head === base && <p className="text-sm text-danger">Choose two different branches.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="button button-primary" disabled={busy || head === base}>{busy ? "Creating…" : "Create pull request"}</button>
      </form>}
  </details>;
}
