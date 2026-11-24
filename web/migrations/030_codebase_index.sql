CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE codebase_indexes (
  project_id BIGINT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  embedding_model TEXT,
  file_count INTEGER NOT NULL CHECK (file_count >= 0),
  limited BOOLEAN NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE codebase_chunks (
  project_id BIGINT NOT NULL REFERENCES codebase_indexes(project_id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL CHECK (end_line >= start_line),
  content TEXT NOT NULL,
  embedding vector,
  search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, path), 'A') ||
    setweight(to_tsvector('english'::regconfig, content), 'B')
  ) STORED,
  PRIMARY KEY (project_id, path, start_line)
);
