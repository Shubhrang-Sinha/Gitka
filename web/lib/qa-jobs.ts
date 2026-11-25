import { pool } from "./db";
import { codebaseEmbeddingModel, getIndex, indexCodebase, resolveRepositoryHead } from "./codebase-index";

export async function getJob(projectId: string) {
  const { rows } = await pool.query(
    `SELECT status, requested_commit, embedding_model, error, updated_at, (status = 'pending' AND updated_at < now() - interval '1 minute') AS waiting_for_worker FROM qa_index_jobs WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, [projectId],
  );
  return rows[0] ?? null;
}

export async function ensureIndexJob(projectId: string, repo: string, userId: string, retry = false) {
  const { commit } = await resolveRepositoryHead(repo, undefined, userId);
  const model = codebaseEmbeddingModel();
  const index = await getIndex(projectId);
  if (index?.commit_sha === commit && index.embedding_model === model) return { index, job: await getJob(projectId), current: true };
  const last = await getJob(projectId);
  if (!retry && last?.status === "failed" && last.requested_commit === commit && last.embedding_model === model) return { index, job: last, current: false };
  await pool.query(
    `INSERT INTO qa_index_jobs (project_id, requested_commit, embedding_model)
     VALUES ($1, $2, $3) ON CONFLICT (project_id) WHERE status IN ('pending', 'running') DO NOTHING`,
    [projectId, commit, model],
  );
  return { index, job: await getJob(projectId), current: false };
}

export async function runNextIndexJob() {
  const result = await pool.query<{ id: string; project_id: string; forgejo_repo: string; lease_token: string; owner_id: string | null }>(
    `WITH candidate AS (
       SELECT id FROM qa_index_jobs WHERE status = 'pending' OR (status = 'running' AND lease_until < now())
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
     ), claimed AS (
       UPDATE qa_index_jobs j SET status = 'running', attempts = attempts + 1, lease_token = gen_random_uuid(),
         lease_until = now() + interval '3 minutes', updated_at = now(), error = NULL
       FROM candidate c WHERE j.id = c.id RETURNING j.*
     ) SELECT claimed.id, claimed.project_id, claimed.lease_token, p.forgejo_repo,
       (SELECT pm.user_id FROM project_members pm JOIN forgejo_identities fi ON fi.user_id = pm.user_id
         WHERE pm.project_id = p.id AND pm.role = 'owner' ORDER BY pm.user_id LIMIT 1) AS owner_id
       FROM claimed JOIN projects p ON p.id = claimed.project_id`,
  );
  const job = result.rows[0];
  if (!job) return false;
  try {
    if (!job.owner_id) throw new Error("No linked project owner is available to index this repository");
    await indexCodebase(job.project_id, job.forgejo_repo, job.owner_id);
    await pool.query(`UPDATE qa_index_jobs SET status = 'done', lease_until = NULL, updated_at = now() WHERE id = $1 AND lease_token = $2`, [job.id, job.lease_token]);
  } catch (error) {
    console.error("Index job failed", error instanceof Error ? error.name : "Unknown error");
    await pool.query(`UPDATE qa_index_jobs SET status = 'failed', lease_until = NULL, error = $3, updated_at = now() WHERE id = $1 AND lease_token = $2`, [job.id, job.lease_token, "Indexing failed. Check the worker configuration and retry."]);
  }
  return true;
}
