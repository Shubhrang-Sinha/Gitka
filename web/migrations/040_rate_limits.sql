CREATE TABLE rate_limits (
  scope TEXT NOT NULL,
  subject TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, subject)
);

CREATE INDEX rate_limits_expires_at_idx ON rate_limits (expires_at);
