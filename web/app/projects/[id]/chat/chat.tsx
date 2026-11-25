"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = { id: string; body: string; created_at: string; display_name: string };
type ActiveLoad = { controller: AbortController; promise: Promise<boolean> };

const POLL_INTERVAL = 5000;
const LOAD_TIMEOUT = 10000;

export default function Chat({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [body, setBody] = useState("");
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const activeLoad = useRef<ActiveLoad | null>(null);
  const lastMessage = useRef<Message | null | undefined>(undefined);
  const history = useRef<HTMLDivElement | null>(null);
  const followLatest = useRef(true);
  const url = `/api/projects/${projectId}/messages`;

  const load = useCallback((): Promise<boolean> => {
    if (activeLoad.current) return activeLoad.current.promise;

    const controller = new AbortController();
    const timeout = AbortSignal.timeout(LOAD_TIMEOUT);
    const promise = (async () => {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, timeout]),
        });
        if (!response.ok) throw new Error();
        const { messages: next } = (await response.json()) as { messages: Message[] };
        if (controller.signal.aborted) return false;

        const latest = next.at(-1) ?? null;
        const previous = lastMessage.current;
        if (previous !== undefined && latest && latest.id !== previous?.id) {
          const previousIndex = previous ? next.findIndex(({ id }) => id === previous.id) : -1;
          const added = next.length - previousIndex - 1;
          setAnnouncement(added === 1
            ? `New message from ${latest.display_name}: ${latest.body.slice(0, 160)}`
            : `${added} new messages. Latest from ${latest.display_name}.`);
        }
        lastMessage.current = latest;
        setMessages(next);
        setLoadError("");
        return true;
      } catch {
        if (!controller.signal.aborted) setLoadError("Could not load messages. Chat will retry automatically.");
        return false;
      } finally {
        if (activeLoad.current?.controller === controller) activeLoad.current = null;
      }
    })();

    activeLoad.current = { controller, promise };
    return promise;
  }, [url]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = POLL_INTERVAL;

    async function poll() {
      const loaded = await load();
      delay = loaded ? POLL_INTERVAL : Math.min(delay * 2, 30000);
      if (!stopped) timer = setTimeout(poll, delay);
    }

    timer = setTimeout(poll, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
      activeLoad.current?.controller.abort();
      activeLoad.current = null;
    };
  }, [load]);

  useEffect(() => {
    const region = history.current;
    if (region && followLatest.current) region.scrollTop = region.scrollHeight;
  }, [messages]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (sending || !body.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setSendError(data?.error || "Could not send message.");
        return;
      }
      setBody("");
      followLatest.current = true;
      await activeLoad.current?.promise;
      await load();
    } catch {
      setSendError("Could not send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div
        ref={history}
        role="region"
        aria-label="Chat history"
        tabIndex={0}
        onScroll={(event) => {
          const region = event.currentTarget;
          followLatest.current = region.scrollHeight - region.scrollTop - region.clientHeight < 48;
        }}
        className="max-h-[min(52dvh,32rem)] min-h-32 space-y-4 overflow-y-auto overscroll-contain p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:p-6"
      >
        {!messages && !loadError && <p role="status" className="text-sm text-muted">Loading messages…</p>}
        {messages?.length === 0 && <p className="text-sm text-muted">No messages yet. Start the conversation below.</p>}
        {!!messages?.length && (
          <ol className="space-y-4">
            {messages.map((message) => (
              <li key={message.id}>
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm font-semibold wrap-anywhere">
                  {message.display_name}
                  <time dateTime={message.created_at} className="font-normal text-muted">
                    {new Date(message.created_at).toLocaleString()}
                  </time>
                </p>
                <p className="mt-1 whitespace-pre-wrap wrap-anywhere">{message.body}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="sr-only" role="status">{announcement}</p>
      <form onSubmit={send} className="space-y-2 border-t border-line p-4 sm:p-6">
        {loadError && <p role="alert" className="text-sm text-danger">{loadError}</p>}
        <label htmlFor="message" className="block text-sm font-semibold">Message</label>
        <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
          <textarea id="message" value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} required readOnly={sending} rows={2} className="field min-w-0" />
          <button disabled={sending || !body.trim()} className="button button-primary shrink-0">{sending ? "Sending…" : "Send"}</button>
        </div>
        {sendError && <p role="alert" className="text-sm text-danger">{sendError}</p>}
      </form>
    </div>
  );
}
