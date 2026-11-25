"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CodebaseSource } from "@/lib/codebase-qa";
import { forgejoSourceFromRepoUrl } from "@/lib/forgejo-links";
type Index = { branch: string; commit_sha: string; file_count: number; limited: boolean; embedding_model: string | null };
type Job = { status: "pending" | "running" | "done" | "failed"; error: string | null; updated_at: string; waiting_for_worker: boolean };
type Conversation = { id: string; title: string };
type Message = { id: string; role: "user" | "assistant"; content: string; commit_sha: string | null; sources: CodebaseSource[] };
type State = { index: Index | null; job: Job | null; current: boolean | null; indexError: string | null; conversations: Conversation[]; messages: Message[] };
export default function CodebaseQuestions({ projectId, repoUrl, isOwner, usesAi }: { projectId: string; repoUrl: string | null; isOwner: boolean; usesAi: boolean; initialIndex: Index | null }) {
  const endpoint = `/api/projects/${projectId}/qa`;
  const [state, setState] = useState<State | null>(null);
  const [conversation, setConversation] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (id: string | null, updateMessages = true) => {
    const response = await fetch(`${endpoint}${id ? `?conversation=${id}` : ""}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load the assistant.");
    setState((previous) => ({ ...data, messages: updateMessages ? data.messages : previous?.messages ?? [] }));
  }, [endpoint]);
  useEffect(() => { let cancelled = false; const timer = setTimeout(() => { load(conversation).catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the assistant."); }); }, 0); return () => { cancelled = true; clearTimeout(timer); }; }, [conversation, load]);
  useEffect(() => { if (state?.job?.status !== "pending" && state?.job?.status !== "running") return; const timer = setInterval(() => { load(conversation, false).catch(() => {}); }, 4000); return () => clearInterval(timer); }, [state?.job?.status, conversation, load]);
  async function refreshIndex() { setError(""); try { const response = await fetch(`${endpoint}/index`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not refresh the index."); await load(conversation, false); } catch (e) { setError(e instanceof Error ? e.message : "Could not refresh the index."); } }
  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, conversationId: conversation }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not get an answer."); setQuestion(""); if (conversation !== data.conversationId) setConversation(data.conversationId); else await load(data.conversationId); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not get an answer."); } finally { setBusy(false); }
  }
  async function removeConversation() { if (!conversation) return; setError(""); try { const response = await fetch(`${endpoint}?conversation=${conversation}`, { method: "DELETE" }); if (!response.ok) throw new Error("Could not delete the conversation."); setConversation(null); await load(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not delete the conversation."); } }
  const index = state?.index;
  return <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
    <aside aria-label="Conversations" className="min-w-0 space-y-3"><button type="button" className="button w-full" disabled={busy} onClick={() => setConversation(null)}>New conversation</button><ul className="space-y-1">{state?.conversations.map((item) => <li key={item.id}><button type="button" disabled={busy} onClick={() => setConversation(item.id)} aria-current={conversation === item.id ? "page" : undefined} className={`w-full rounded-md px-3 py-2 text-left text-sm break-words hover:bg-panel ${conversation === item.id ? "bg-panel font-semibold text-accent" : "text-muted"}`}>{item.title}</button></li>)}</ul></aside>
    <div className="min-w-0 space-y-5"><section aria-label="Repository index" className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-4 text-sm"><div aria-live="polite">
      {index ? <p><strong>{index.branch}</strong> at <code>{index.commit_sha.slice(0, 12)}</code> · {index.file_count} files indexed{state?.current === false ? " · older snapshot" : ""}</p> : <p>No repository snapshot available yet.</p>}
      {index?.limited && <p className="mt-1 text-muted">The index is incomplete because repository limits were reached.</p>}
      {index && !index.embedding_model && <p className="mt-1 text-muted">Keyword search only; semantic search is not configured.</p>}
      {(state?.job?.status === "pending" || state?.job?.status === "running") && <p className="mt-1 text-muted">{state.job.waiting_for_worker ? "Index job is waiting for a worker. Check that the Q&A worker is running." : "Preparing repository index in the background…"}</p>}
      {state?.job?.status === "failed" && state.current === false && <p className="mt-1 text-danger">{state.job.error}</p>}{state?.indexError && <p className="mt-1 text-danger">{state.indexError}</p>}
      </div>{isOwner && <button type="button" className="button" onClick={refreshIndex}>Refresh index</button>}</section>
      {conversation && <div className="flex justify-end"><button type="button" onClick={removeConversation} disabled={busy} className="text-sm text-muted underline underline-offset-4 hover:text-danger">Delete conversation</button></div>}
      <section aria-label="Conversation" aria-live="polite" className="space-y-5">{!state?.messages.length && <p className="text-sm text-muted">Ask about the code, or start a conversation. The assistant can inspect the indexed repository and cite its sources.</p>}
        {state?.messages.map((message) => <article key={message.id} className="rounded-xl border border-line bg-panel p-4"><h2 className="mb-2 text-sm font-semibold">{message.role === "user" ? "You" : "Assistant"}</h2><div className="whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed">{message.content}</div>
          {message.sources.length > 0 && <details className="mt-4 border-t border-line pt-3 text-sm"><summary className="cursor-pointer text-accent">Sources · {message.commit_sha?.slice(0, 12)}</summary><ol className="mt-3 space-y-3">{message.sources.map((source, i) => { const href = message.commit_sha && forgejoSourceFromRepoUrl(repoUrl, "commit", message.commit_sha, source.path, source.start_line, source.end_line); return <li key={`${source.path}:${source.start_line}`}><p className="break-all">[{i + 1}] {href ? <a href={href} className="text-accent underline">{source.path}:{source.start_line}–{source.end_line}</a> : <span>{source.path}:{source.start_line}–{source.end_line}</span>}</p><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs text-muted">{source.content}</pre></li>; })}</ol></details>}
        </article>)}{busy && <p role="status" className="text-sm text-muted">The assistant is thinking…</p>}</section>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}<form onSubmit={ask} className="space-y-3"><label htmlFor="codebase-question" className="block font-semibold">Message the assistant</label><textarea id="codebase-question" className="field resize-y" placeholder="Ask about this repository…" value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} maxLength={1000} required /><div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={busy || !question.trim() || !usesAi} className="button button-primary">{busy ? "Thinking…" : "Send message"}</button><p className="text-sm text-muted">{usesAi ? "Messages, retrieved code, and code used for semantic indexing are sent to OpenRouter." : "Configure OpenRouter to enable AI answers."}</p></div></form>
    </div></div>;
}
