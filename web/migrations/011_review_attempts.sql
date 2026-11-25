ALTER TABLE pr_reviews
  ADD COLUMN attempt_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN publish_started_at TIMESTAMPTZ;