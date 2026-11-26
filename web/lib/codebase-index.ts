import { embedMany } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { pool } from "./db";
import { forgejoFetch, forgejoFetchAs } from "./forgejo";

const MAX_FILES = 200;
const MAX_FILE_BYTES = 32_000;
const MAX_TREE_PAGES = 10;
const MAX_CHUNK_CHARS = 2400;
const MAX_CHUNK_LINES = 50;
const MAX_CHUNKS = 800;

const TEXT_FILE = /\.(?:[cm]?[jt]sx?|py|rb|rs|go|java|kt|cs|[ch]|cpp|hpp|swift|php|vue|svelte|html|css|scss|sql|md|mdx|txt|json|ya?ml|toml|sh|bash|ps1|exs?|liquid|tf)$/i;
const SPECIAL_FILE = /^(?:README|CHANGELOG|Makefile|Dockerfile)(?:\.[\w-]+)?$/i;
const OMIT_PATH = /(?:^|\/)(?:\.[^/]+|vendor|node_modules|dist|build|coverage|secrets?|credentials)(?:\/|$)|(?:^|\/)(?:package-lock\.json|[^/]+\.lock|[^/]+\.min\.[^/]+|(?:secrets?|credentials)(?:[._-][^/]+))(?:$)/i;
const GIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

type GitFile = { path: string; sha: string; mode: string; type: string; size: number };
type Snapshot = {
  commit_sha: string;
  branch: string;
  file_count: number;
  indexed_at: Date;
  embedding_model: string | null;
  limited: boolean;
};
type Chunk = { path: string; start_line: number; end_line: number; content: string };

export class IndexError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function getIndex(projectId: string) {
  const result = await pool.query<Snapshot>("SELECT * FROM codebase_indexes WHERE project_id = $1", [projectId]);
  return result.rows[0] ?? null;
}

function chunkFile(path: string, source: string): Chunk[] {
  const lines = source.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();
  const chunks: Chunk[] = [];
  for (let start = 0; start < lines.length;) {
    let end = start;
    let length = 0;
    while (end < lines.length && end - start < MAX_CHUNK_LINES) {
      const lineLength = lines[end].length + 1;
      if (end > start && length + lineLength > MAX_CHUNK_CHARS) break;
      length += lineLength;
      end++;
    }
    const content = lines.slice(start, end).join("\n").slice(0, MAX_CHUNK_CHARS);
    if (content.trim()) chunks.push({ path, start_line: start + 1, end_line: end, content });
    start = end;
  }
  return chunks;
}

// A conservative first filter, not a replacement for secret scanning or access policies.
export function containsKnownSecret(source: string) {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-or-v1-|ghp_|github_pat_|sk_live_)[A-Za-z0-9_-]{12,}|\b(?:password|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"'\n]{12,}["']/i.test(source);
}

export function codebaseEmbeddingModel() {
  return process.env.QA_EMBEDDING_MODEL?.trim() || null;
}

export function vectorLiteral(values: number[]) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding provider returned an invalid vector");
  }
  return JSON.stringify(values);
}

async function discoverFiles(repoPath: string, commit: string, signal: AbortSignal, userId?: string) {
  const files: GitFile[] = [];
  let limited = false;
  for (let page = 1; page <= MAX_TREE_PAGES; page++) {
    const path = `${repoPath}/git/trees/${commit}?recursive=true&page=${page}&per_page=1000`;
    const tree = userId ? await forgejoFetchAs<{ tree: GitFile[]; truncated: boolean }>(userId, path, signal) : await forgejoFetch<{ tree: GitFile[]; truncated: boolean }>(path, signal);
    for (const entry of tree.tree) {
      if (entry.type !== "blob" || !/^100(?:644|755)$/.test(entry.mode) || !GIT_SHA.test(entry.sha)) continue;
      if (OMIT_PATH.test(entry.path) || !(TEXT_FILE.test(entry.path) || SPECIAL_FILE.test(entry.path.split("/").at(-1) ?? ""))) continue;
      if (entry.size > MAX_FILE_BYTES || files.length >= MAX_FILES) {
        limited = true;
        continue;
      }
      files.push(entry);
    }
    if (!tree.truncated) break;
    if (page === MAX_TREE_PAGES) limited = true;
  }
  return { files, limited };
}

async function readFile(repoPath: string, file: GitFile, signal: AbortSignal, userId?: string) {
  const path = `${repoPath}/git/blobs/${file.sha}`;
  const blob = userId ? await forgejoFetchAs<{ content: string; encoding: string; size: number }>(userId, path, signal) : await forgejoFetch<{ content: string; encoding: string; size: number }>(path, signal);
  if (blob.encoding !== "base64" || blob.size > MAX_FILE_BYTES) return [];
  const bytes = Buffer.from(blob.content, "base64");
  if (bytes.length > MAX_FILE_BYTES || bytes.includes(0)) return [];
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return [];
  }
  if (containsKnownSecret(source)) return [];
  return chunkFile(file.path, source);
}

export async function resolveRepositoryHead(repository: string, signal = AbortSignal.timeout(8000), userId?: string) {
  const repoPath = `/repos/${repository.split("/").map(encodeURIComponent).join("/")}`;
  const repo = userId ? await forgejoFetchAs<{ default_branch: string; empty: boolean }>(userId, repoPath, signal) : await forgejoFetch<{ default_branch: string; empty: boolean }>(repoPath, signal);
  if (repo.empty) throw new IndexError("Create a commit on the default branch before indexing.", 422);
  const commitsPath = `${repoPath}/commits?sha=${encodeURIComponent(repo.default_branch)}&limit=1&stat=false&verification=false&files=false`;
  const commits = userId ? await forgejoFetchAs<{ sha: string }[]>(userId, commitsPath, signal) : await forgejoFetch<{ sha: string }[]>(commitsPath, signal);
  const commit = commits[0]?.sha;
  if (!commit || !GIT_SHA.test(commit)) throw new IndexError("Could not resolve the default branch commit.", 422);
  return { branch: repo.default_branch, commit };
}

export async function indexCodebase(projectId: string, repository: string, userId?: string, job?: { id: string; token: string }) {
  const repoPath = `/repos/${repository.split("/").map(encodeURIComponent).join("/")}`;
  const signal = AbortSignal.timeout(60_000);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 826452901)) AS acquired", [projectId],
    );
    if (!lock.rows[0].acquired) throw new IndexError("An index refresh is already running. Try again shortly.", 409);
    const { branch, commit } = await resolveRepositoryHead(repository, signal, userId);

    const model = codebaseEmbeddingModel();
    const key = process.env.OPENROUTER_API_KEY;
    if (model && !key) throw new IndexError("Set OPENROUTER_API_KEY to use the configured embedding model.", 503);
    const existing = await client.query<Snapshot>("SELECT * FROM codebase_indexes WHERE project_id = $1", [projectId]);
    const previous = existing.rows[0];
    if (previous?.commit_sha === commit && previous.branch === branch && previous.embedding_model === model) {
      if (job) {
        const owned = await client.query("UPDATE qa_index_jobs SET status = 'done', lease_until = NULL, updated_at = now() WHERE id = $1 AND lease_token = $2 AND status = 'running' RETURNING id", [job.id, job.token]);
        if (!owned.rowCount) throw new IndexError("Index job was cancelled or replaced.", 409);
      }
      await client.query("COMMIT");
      return previous;
    }

    const { files, limited } = await discoverFiles(repoPath, commit, signal, userId);
    const chunks: Chunk[] = [];
    let bounded = limited;
    for (let offset = 0; offset < files.length; offset += 8) {
      if (job) {
        const owned = await client.query("SELECT 1 FROM qa_index_jobs WHERE id = $1 AND lease_token = $2 AND status = 'running'", [job.id, job.token]);
        if (!owned.rowCount) throw new IndexError("Index job was cancelled or replaced.", 409);
      }
      const batch = await Promise.all(files.slice(offset, offset + 8).map((file) => readFile(repoPath, file, signal, userId)));
      chunks.push(...batch.flat());
      if (chunks.length > MAX_CHUNKS || (chunks.length === MAX_CHUNKS && offset + 8 < files.length)) {
        chunks.length = MAX_CHUNKS;
        bounded = true;
        break;
      }
    }

    const fileCount = new Set(chunks.map((chunk) => chunk.path)).size;
    if (job) {
      const owned = await client.query("SELECT 1 FROM qa_index_jobs WHERE id = $1 AND lease_token = $2 AND status = 'running'", [job.id, job.token]);
      if (!owned.rowCount) throw new IndexError("Index job was cancelled or replaced.", 409);
    }
    const embeddings = model && chunks.length
      ? (await embedMany({
        model: createOpenRouter({ apiKey: key }).embedding(model),
        values: chunks.map(({ path, content }) => `${path}\n${content}`),
        maxParallelCalls: 3,
        maxRetries: 1,
        abortSignal: signal,
      })).embeddings
      : null;
    if (embeddings && embeddings.length !== chunks.length) throw new Error("Embedding provider returned an incomplete batch");

    if (job) {
      const owned = await client.query("SELECT 1 FROM qa_index_jobs WHERE id = $1 AND lease_token = $2 AND status = 'running' FOR UPDATE", [job.id, job.token]);
      if (!owned.rowCount) throw new IndexError("Index job was cancelled or replaced.", 409);
    }
    await client.query("DELETE FROM codebase_indexes WHERE project_id = $1", [projectId]);
    const snapshot = await client.query<Snapshot>(
      `INSERT INTO codebase_indexes (project_id, commit_sha, branch, embedding_model, file_count, limited)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [projectId, commit, branch, model, fileCount, bounded],
    );
    await client.query(
      `INSERT INTO codebase_chunks (project_id, path, start_line, end_line, content, embedding)
       SELECT $1, path, start_line, end_line, content, embedding::vector
         FROM jsonb_to_recordset($2::jsonb)
               AS chunk(path text, start_line integer, end_line integer, content text, embedding text)`,
      [projectId, JSON.stringify(chunks.map((chunk, i) => ({
        ...chunk, embedding: embeddings ? vectorLiteral(embeddings[i]) : null,
      })))],
    );
    if (job) await client.query("UPDATE qa_index_jobs SET status = 'done', lease_until = NULL, updated_at = now() WHERE id = $1 AND lease_token = $2", [job.id, job.token]);
    await client.query("COMMIT");
    return snapshot.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
