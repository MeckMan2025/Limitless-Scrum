-- ============================================================
--  ETS — two things to run in the Supabase SQL editor.
--  Dashboard -> SQL Editor -> paste -> Run.
-- ============================================================


-- ── 1. Put everyone's sign-in email on their profile ─────────
-- Without this there is no way to look up which address someone
-- signs in with, which is what made the recent login problem so
-- hard to chase. auth.users isn't readable from the app, and
-- approved_emails is consumed as people sign up, so the address
-- has to be copied onto profiles and kept in sync.
--
-- This is the existing profile_email.sql, unchanged. Run that
-- file, or just run this line to confirm whether it already ran:
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name = 'email';
--
-- No rows back = it has not run yet. Then run profile_email.sql.


-- ── 2. Point old attendance rows at people's current names ───
-- Five people renamed themselves after attendance had already
-- been taken. Attendance rows are keyed by name, so each of them
-- shows up twice on the older meetings: once under the old name
-- carrying their real status, and once as a blank "no record"
-- row under the new one.
--
-- CHECK THESE FIVE PAIRS BEFORE RUNNING. Each was matched by
-- looking for a current profile whose name starts with the old
-- one, so they are a guess, not a fact:

--   Anant    -> Anant Bhugra      (1 row)
--   Kundan   -> Kundan Pothala    (2 rows)
--   Lily     -> Lily Lang         (2 rows)
--   Saiesha  -> Saiesha Pradhan   (1 row)
--   Yukti    -> Yukti Deshpande   (2 rows)

-- Preview first — this changes nothing:
SELECT username, count(*) AS rows_affected
FROM attendance_records
WHERE username IN ('Anant', 'Kundan', 'Lily', 'Saiesha', 'Yukti')
GROUP BY username
ORDER BY username;

-- Then the rename itself:
UPDATE attendance_records SET username = 'Anant Bhugra'    WHERE username = 'Anant';
UPDATE attendance_records SET username = 'Kundan Pothala'  WHERE username = 'Kundan';
UPDATE attendance_records SET username = 'Lily Lang'       WHERE username = 'Lily';
UPDATE attendance_records SET username = 'Saiesha Pradhan' WHERE username = 'Saiesha';
UPDATE attendance_records SET username = 'Yukti Deshpande' WHERE username = 'Yukti';

-- Confirm nothing is left behind — this should return no rows:
SELECT DISTINCT r.username
FROM attendance_records r
LEFT JOIN profiles p ON p.display_name = r.username
WHERE p.id IS NULL;
