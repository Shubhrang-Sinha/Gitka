CREATE TABLE pr_reviews (
  id             SERIAL PRIMARY KEY,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pr_number      INTEGER NOT NULL,
  head_sha       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'done', 'failed')),
  summary        TEXT,
  error          TEXT,
  model          TEXT,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, pr_number, head_sha)
);

CREATE TABLE review_comments (
  id         SERIAL PRIMARY KEY,
  review_id  INTEGER NOT NULL REFERENCES pr_reviews(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  line       INTEGER NOT NULL,
  severity   TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  body       TEXT NOT NULL,
  posted     BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX review_comments_review_id_idx ON review_comments (review_id);