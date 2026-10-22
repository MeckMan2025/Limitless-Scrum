CREATE TABLE IF NOT EXISTS daily_pulse (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pulse_date date NOT NULL,
  mood text,
  mood_note text DEFAULT '',
  work_focus text,
  frustration text,
  frustration_note text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, pulse_date)
);

ALTER TABLE daily_pulse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_pulse_insert ON daily_pulse;
CREATE POLICY daily_pulse_insert ON daily_pulse FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS daily_pulse_select ON daily_pulse;
CREATE POLICY daily_pulse_select ON daily_pulse FOR SELECT TO authenticated, anon USING (true);

NOTIFY pgrst, 'reload schema';
