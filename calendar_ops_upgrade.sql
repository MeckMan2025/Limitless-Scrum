-- =====================================================================
-- Robotics Operations Calendar — schema upgrade
-- Run once in your Supabase SQL editor. Idempotent (safe to re-run).
-- =====================================================================

-- New columns on calendar_events ---------------------------------------
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS category text DEFAULT 'meeting';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS department text DEFAULT 'team';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS start_time text DEFAULT '';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS end_time text DEFAULT '';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS location text DEFAULT '';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence text DEFAULT 'none';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence_until text DEFAULT '';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS assigned_to text[] DEFAULT '{}';

-- Backfill: map legacy event_type → category for any rows still on defaults.
UPDATE calendar_events
   SET category = CASE
     WHEN event_type = 'meeting'     THEN 'meeting'
     WHEN event_type = 'competition' THEN 'competition'
     ELSE 'meeting'
   END
 WHERE category IS NULL OR category = '';

-- Birthday reactions ---------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_birthday_reactions (
  id          text PRIMARY KEY,
  event_id    text NOT NULL,
  user_id     uuid,
  username    text NOT NULL,
  emoji       text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE calendar_birthday_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to birthday reactions" ON calendar_birthday_reactions;
CREATE POLICY "Allow all access to birthday reactions" ON calendar_birthday_reactions
  FOR ALL USING (true) WITH CHECK (true);

-- Realtime publication (only add if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'calendar_birthday_reactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE calendar_birthday_reactions';
  END IF;
END $$;
