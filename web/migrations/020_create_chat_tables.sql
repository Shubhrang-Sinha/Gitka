CREATE TABLE chat_channels (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE chat_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (
    char_length(trim(content)) BETWEEN 1 AND 2000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_channel_created_idx
  ON chat_messages (channel_id, created_at, id);

-- Create a default general channel for every existing project.
INSERT INTO chat_channels (project_id, name)
SELECT id, 'general'
FROM projects
ON CONFLICT (project_id, name) DO NOTHING;
