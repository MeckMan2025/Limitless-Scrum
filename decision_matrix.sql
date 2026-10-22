-- ============================================================
--  Decision Matrix — run this in Supabase → SQL Editor.
--  Nothing saves without it: the table has never existed, so
--  every save has been failing for everyone, not just one person.
-- ============================================================

-- 1. The table.
CREATE TABLE IF NOT EXISTS design_matrices (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  options jsonb DEFAULT '[]'::jsonb,
  criteria jsonb DEFAULT '[]'::jsonb,
  scores jsonb DEFAULT '{}'::jsonb,     -- also holds the hosted session
  decision jsonb DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE design_matrices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to design_matrices" ON design_matrices;
CREATE POLICY "Allow all access to design_matrices" ON design_matrices
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Live updates, so a host sees ratings land without refreshing.
ALTER PUBLICATION supabase_realtime ADD TABLE design_matrices;

-- 3. Bucket for option photos. There are no buckets at all right now, so
--    adding a picture to an option would fail even once the table exists.
INSERT INTO storage.buckets (id, name, public)
VALUES ('design-matrix-images', 'design-matrix-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read design matrix images" ON storage.objects;
CREATE POLICY "Public read design matrix images" ON storage.objects
  FOR SELECT USING (bucket_id = 'design-matrix-images');

DROP POLICY IF EXISTS "Anyone can upload design matrix images" ON storage.objects;
CREATE POLICY "Anyone can upload design matrix images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'design-matrix-images');

-- 4. Tell PostgREST to pick the new table up straight away.
NOTIFY pgrst, 'reload schema';

-- Check it worked — should return one row:
SELECT table_name FROM information_schema.tables WHERE table_name = 'design_matrices';
