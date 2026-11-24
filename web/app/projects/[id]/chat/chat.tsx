"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = { id: string; body: string; created_at: string; display_name: string };

export default function Chat({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [body, setBody] = useState("");
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const activeLoad = useRef<AbortController | null>(null);
  const url = `/api/projects/${projectId}/messages`;
  const load = useCallback(async () => {
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (controller.signal.aborted) return;
      setMessages(data.messages);
      setLoadError("");
    } catch {
      if (!controller.signal.aborted) setLoadError("Could not load messages.");
    }
  }, [url]);
  useEffect(() => {
    const initial = setTimeout(load, 0);
    const timer = setInterval(load, 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      activeLoad.current?.abort();
    };
  }, [load]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setSendError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        const data = await response.json();
        setSendError(data.error || "Could not send message.");
        return;
      }
      setBody("");
      await load();
    } catch {
      setSendError("Could not send message.");
    } finally {
      setSending(false);
    }
  }
  return <div className="space-y-4">
    <div className="space-y-3 rounded border border-gray-400 p-4" aria-live="polite">
      {!messages && !loadError && <p>Loading messages…</p>}
      {messages?.length === 0 && <p>No messages yet.</p>}
      {messages?.map((message) => <div key={message.id}>
        <p className="text-sm font-semibold">{message.display_name} <time dateTime={message.created_at} className="font-normal text-gray-500">{new Date(message.created_at).toLocaleString()}</time></p>
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>)}
    </div>
    {loadError && <p role="alert" className="text-red-500">{loadError}</p>}
    {sendError && <p role="alert" className="text-red-500">{sendError}</p>}
    <form onSubmit={send} className="space-y-2">
      <label htmlFor="message" className="block">Message</label>
      <textarea id="message" value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} required disabled={sending} className="w-full rounded border border-gray-400 p-2" />
      <button disabled={sending || !body.trim()} className="rounded border border-gray-400 px-3 py-1 disabled:opacity-50">Send</button>
    </form>
  </div>;
}
