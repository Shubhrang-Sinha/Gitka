import { NextResponse } from "next/server";
import { Client } from "pg";
import { pool } from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";
import { getCodebaseProject } from "@/lib/codebase-access";
import { forgejoFetchAs } from "@/lib/forgejo";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; channelId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return fail("Not logged in", 401);
  }

  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  const { id, channelId } = await params;
  if (!/^\d{1,15}$/.test(id)) {
    return fail("Project not found", 404);
  }
  try {
    const access = await getCodebaseProject(id);
    if (!access.project) return fail("Project not found", 404);
  } catch {
    return fail("Could not verify repository access with Forgejo.", 503);
  }
  if (!/^\d{1,15}$/.test(channelId)) {
    return fail("Channel not found", 404);
  }

  try {
    const membership = await pool.query(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
      [id, user.id]
    );
    if (membership.rows.length === 0) {
      return fail("Project not found", 404);
    }

    const channel = await pool.query(
      "SELECT id FROM chat_channels WHERE id = $1 AND project_id = $2",
      [channelId, id]
    );
    if (channel.rows.length === 0) {
      return fail("Channel not found", 404);
    }
  } catch (error) {
    console.error("Failed to verify channel authorization:", error);
    return fail("Something went wrong", 500);
  }

  if (request.signal.aborted) {
    return new Response(null, { status: 499 });
  }

  const encoder = new TextEncoder();
  const dbClient = new Client({ connectionString: process.env.DATABASE_URL });

  let isCleanedUp = false;
  let isClosed = false;
  let clientEnded = false;
  let pingInterval: NodeJS.Timeout | null = null;
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let pendingEvents: string[] = [];
  let notificationQueue: Promise<void> = Promise.resolve();

  const safeEnqueue = (data: string) => {
    if (isClosed) return;
    if (!controller) {
      pendingEvents.push(data);
      return;
    }
    try {
      controller.enqueue(encoder.encode(data));
    } catch {
      cleanup();
    }
  };

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    isClosed = true;
    pendingEvents = [];

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    request.signal.removeEventListener("abort", onAbort);
    dbClient.removeListener("notification", onNotification);
    dbClient.removeListener("error", onError);

    if (!clientEnded) {
      clientEnded = true;
      dbClient.end().catch((err) => {
        console.error("Error closing dedicated SSE pg client:", err);
      });
    }

    if (controller) {
      try {
        controller.close();
      } catch {
        // Controller might already be closed or errored
      }
    }
  };

  const onAbort = () => {
    cleanup();
  };

  const onError = (err: Error) => {
    console.error("SSE pg client error:", err);
    cleanup();
  };

  const processNotification = async (notification: {
    channel?: string;
    payload?: string;
  }) => {
    if (isClosed) return;

    if (notification.channel !== `chat_channel_${channelId}`) {
      return;
    }
    if (!notification.payload) {
      return;
    }

    let payload: { channelId?: string; messageId?: string };
    try {
      payload = JSON.parse(notification.payload);
    } catch {
      return;
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      String(payload.channelId) !== channelId ||
      typeof payload.messageId !== "string" ||
      !/^\d{1,15}$/.test(payload.messageId)
    ) {
      return;
    }

    try {
      // Long-lived streams must not outlive project or Forgejo access revocation.
      const access = await pool.query<{ forgejo_repo: string }>(
        `SELECT p.forgejo_repo FROM projects p JOIN project_members pm ON pm.project_id = p.id
         JOIN sessions s ON s.user_id = pm.user_id AND s.id = $3 AND s.expires_at > now()
         WHERE p.id = $1 AND pm.user_id = $2 LIMIT 1`, [id, user.id, sessionId],
      );
      if (!access.rows[0]) { cleanup(); return; }
      const repoPath = access.rows[0].forgejo_repo.split("/").map(encodeURIComponent).join("/");
      await forgejoFetchAs(String(user.id), `/repos/${repoPath}`);
      const messageResult = await pool.query(
        `SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at,
                u.display_name
           FROM chat_messages m
           JOIN users u ON u.id = m.user_id
          WHERE m.id = $1 AND m.channel_id = $2`,
        [payload.messageId, channelId]
      );

      const row = messageResult.rows[0];
      if (!row || isClosed) return;

      const eventData = JSON.stringify({
        id: row.id,
        channel_id: row.channel_id,
        user_id: row.user_id,
        content: row.content,
        created_at: row.created_at,
        user: {
          id: row.user_id,
          display_name: row.display_name,
        },
      });

      safeEnqueue(`id: ${row.id}\nevent: message\ndata: ${eventData}\n\n`);
    } catch (err) {
      console.error("Failed to fetch message for SSE notification:", err);
      // Fail closed if access cannot be verified.
      cleanup();
    }
  };

  const onNotification = (notification: {
    channel?: string;
    payload?: string;
  }) => {
    if (isClosed) return;

    // Serialize notification handling to guarantee strictly in-order processing and delivery
    notificationQueue = notificationQueue
      .then(async () => {
        await processNotification(notification);
      })
      .catch((err) => {
        console.error("Error in serialized notification processor:", err);
      });
  };

  // Register listeners immediately before starting connection and LISTEN
  request.signal.addEventListener("abort", onAbort);
  dbClient.on("notification", onNotification);
  dbClient.on("error", onError);

  try {
    await dbClient.connect();
    if (request.signal.aborted) {
      cleanup();
      return new Response(null, { status: 499 });
    }
    await dbClient.query(`LISTEN chat_channel_${channelId}`);
  } catch (error) {
    console.error("Failed to connect or listen for SSE:", error);
    cleanup();
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    return fail("Failed to establish event stream", 500);
  }

  if (request.signal.aborted) {
    cleanup();
    return new Response(null, { status: 499 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      if (isClosed || request.signal.aborted) {
        try {
          c.close();
        } catch {
          // Ignore if already closed
        }
        return;
      }

      controller = c;
      safeEnqueue(": connected\n\n");

      if (!isClosed && !request.signal.aborted) {
        const eventsToFlush = pendingEvents;
        pendingEvents = [];
        for (const event of eventsToFlush) {
          if (isClosed) break;
          try {
            c.enqueue(encoder.encode(event));
          } catch {
            cleanup();
            return;
          }
        }
      }

      pingInterval = setInterval(() => {
        safeEnqueue(": keepalive\n\n");
      }, 15000);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
