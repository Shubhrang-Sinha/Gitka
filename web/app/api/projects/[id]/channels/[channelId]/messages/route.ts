import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

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

  const { id, channelId } = await params;
  if (!/^\d{1,15}$/.test(id)) {
    return fail("Project not found", 404);
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

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    let limit = 50;
    if (limitParam !== null) {
      if (!/^\d+$/.test(limitParam)) {
        return fail("Limit must be an integer between 1 and 100", 400);
      }
      const parsed = parseInt(limitParam, 10);
      if (parsed < 1 || parsed > 100) {
        return fail("Limit must be an integer between 1 and 100", 400);
      }
      limit = parsed;
    }

    let beforeCreatedAt: string | null = null;
    let beforeId: string | null = null;

    const cursorParam = url.searchParams.get("cursor");
    const beforeCreatedAtParam = url.searchParams.get("before_created_at");
    const beforeIdParam = url.searchParams.get("before_id");

    if (cursorParam !== null) {
      try {
        const decoded = JSON.parse(
          Buffer.from(cursorParam, "base64url").toString("utf8")
        );
        if (
          typeof decoded !== "object" ||
          decoded === null ||
          Array.isArray(decoded)
        ) {
          return fail("Invalid pagination cursor structure", 400);
        }
        if (
          typeof decoded.created_at !== "string" ||
          isNaN(Date.parse(decoded.created_at))
        ) {
          return fail("Invalid pagination cursor timestamp", 400);
        }
        if (
          (typeof decoded.id !== "string" && typeof decoded.id !== "number") ||
          !/^\d{1,15}$/.test(String(decoded.id))
        ) {
          return fail("Invalid pagination cursor ID", 400);
        }
        beforeCreatedAt = decoded.created_at;
        beforeId = String(decoded.id);
      } catch {
        return fail("Invalid pagination cursor encoding", 400);
      }
    } else if (beforeCreatedAtParam !== null || beforeIdParam !== null) {
      if (beforeCreatedAtParam === null || beforeIdParam === null) {
        return fail(
          "Both before_created_at and before_id must be provided together",
          400
        );
      }
      if (isNaN(Date.parse(beforeCreatedAtParam))) {
        return fail("Invalid before_created_at timestamp", 400);
      }
      if (!/^\d{1,15}$/.test(beforeIdParam)) {
        return fail("Invalid before_id", 400);
      }
      beforeCreatedAt = beforeCreatedAtParam;
      beforeId = beforeIdParam;
    }

    let result;
    if (beforeCreatedAt && beforeId) {
      result = await pool.query(
        `SELECT * FROM (
           SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at,
                  u.display_name
             FROM chat_messages m
             JOIN users u ON u.id = m.user_id
            WHERE m.channel_id = $1
              AND (m.created_at, m.id) < ($3::timestamptz, $4::bigint)
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT $2
         ) sub
         ORDER BY sub.created_at ASC, sub.id ASC`,
        [channelId, limit, beforeCreatedAt, beforeId]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM (
           SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at,
                  u.display_name
             FROM chat_messages m
             JOIN users u ON u.id = m.user_id
            WHERE m.channel_id = $1
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT $2
         ) sub
         ORDER BY sub.created_at ASC, sub.id ASC`,
        [channelId, limit]
      );
    }

    const messages = result.rows.map((row) => ({
      id: row.id,
      channel_id: row.channel_id,
      user_id: row.user_id,
      content: row.content,
      created_at: row.created_at,
      user: {
        id: row.user_id,
        display_name: row.display_name,
      },
    }));

    let nextCursor: string | null = null;
    if (messages.length === limit && messages.length > 0) {
      const oldestMessage = messages[0];
      nextCursor = Buffer.from(
        JSON.stringify({
          created_at: oldestMessage.created_at,
          id: oldestMessage.id,
        })
      ).toString("base64url");
    }

    return NextResponse.json({
      ok: true,
      messages,
      next_cursor: nextCursor,
    });
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return fail("Something went wrong", 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; channelId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return fail("Not logged in", 401);
  }

  const { id, channelId } = await params;
  if (!/^\d{1,15}$/.test(id)) {
    return fail("Project not found", 404);
  }
  if (!/^\d{1,15}$/.test(channelId)) {
    return fail("Channel not found", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Request body must be valid JSON", 400);
  }

  const { content } = (body ?? {}) as Record<string, unknown>;
  if (typeof content !== "string") {
    return fail("content is required", 400);
  }

  const trimmed = content.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) {
    return fail("Message content must be 1 to 2000 characters", 400);
  }

  const client = await pool.connect();
  try {
    const membership = await client.query(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
      [id, user.id]
    );
    if (membership.rows.length === 0) {
      return fail("Project not found", 404);
    }

    const channel = await client.query(
      "SELECT id FROM chat_channels WHERE id = $1 AND project_id = $2",
      [channelId, id]
    );
    if (channel.rows.length === 0) {
      return fail("Channel not found", 404);
    }

    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO chat_messages (channel_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, channel_id, user_id, content, created_at`,
      [channelId, user.id, trimmed]
    );
    const newMessage = inserted.rows[0];

    // Minimal NOTIFY payload: channel ID and message ID only, within same transaction
    const notifyPayload = JSON.stringify({
      channelId: String(channelId),
      messageId: String(newMessage.id),
    });
    await client.query("SELECT pg_notify($1, $2)", [
      `chat_channel_${channelId}`,
      notifyPayload,
    ]);

    await client.query("COMMIT");

    return NextResponse.json(
      {
        ok: true,
        message: {
          id: newMessage.id,
          channel_id: newMessage.channel_id,
          user_id: newMessage.user_id,
          content: newMessage.content,
          created_at: newMessage.created_at,
          user: {
            id: user.id,
            display_name: user.display_name,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Failed to send message:", error);
    return fail("Something went wrong", 500);
  } finally {
    client.release();
  }
}
