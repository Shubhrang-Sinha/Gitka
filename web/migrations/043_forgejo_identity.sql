-- Forgejo identities are linked only after the OAuth callback proves account control.
CREATE TABLE forgejo_identities (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  forgejo_user_id BIGINT NOT NULL UNIQUE,
  forgejo_username TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE forgejo_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_verifier_ciphertext TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX forgejo_oauth_states_expires_idx ON forgejo_oauth_states(expires_at);
