-- Move the pre-merge Gitka project chat out of the channel migration's way.
-- The two schemas can be distinguished by the project_id column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = to_regclass('chat_messages')
      AND attname = 'project_id' AND NOT attisdropped
  ) THEN
    ALTER TABLE chat_messages RENAME TO project_chat_messages;
    ALTER TABLE project_chat_messages RENAME CONSTRAINT chat_messages_pkey TO project_chat_messages_pkey;
    ALTER SEQUENCE chat_messages_id_seq RENAME TO project_chat_messages_id_seq;
    ALTER INDEX chat_messages_project_id_id_idx RENAME TO project_chat_messages_project_id_id_idx;
  END IF;
END
$$;
