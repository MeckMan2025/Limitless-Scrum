-- APNs device tokens for native iOS push notifications.
-- Run once in Supabase SQL editor. Idempotent.

CREATE TABLE IF NOT EXISTS apns_tokens (
  id          text PRIMARY KEY,
  user_id     uuid NOT NULL,
  token       text NOT NULL,
  bundle_id   text DEFAULT 'org.radicalrobotics.scrum',
  device_info text DEFAULT '',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS apns_tokens_user_token_uniq
  ON apns_tokens (user_id, token);

ALTER TABLE apns_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to apns_tokens" ON apns_tokens;
CREATE POLICY "Allow all access to apns_tokens" ON apns_tokens
  FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'apns_tokens'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE apns_tokens';
  END IF;
END $$;
