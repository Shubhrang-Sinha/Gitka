CREATE INDEX pr_reviews_project_latest_idx ON pr_reviews(project_id, created_at DESC, id DESC);
