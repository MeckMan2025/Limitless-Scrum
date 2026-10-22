-- ETS attendance: stop duplicate sessions, and clean up the ones already there.
-- Run these sections in order in the Supabase SQL editor.
--
-- Background: "Start Today's Session" had no in-flight lock and only checked
-- locally-cached state, so repeat taps each inserted their own session.
-- 2026-09-03 ended up with 13 sessions (12 of them a 6-second burst), each
-- carrying a full set of 36 attendance_records.

-- 1) PREVIEW — which dates have more than one session, and what would be kept.
SELECT session_date,
       count(*) AS sessions,
       min(created_at) AS keeping_this_one
FROM attendance_sessions
GROUP BY session_date
HAVING count(*) > 1
ORDER BY session_date DESC;

-- 2) DELETE the extras, keeping the earliest session for each date.
--    attendance_records has ON DELETE CASCADE, so their records go with them.
--    Re-run section 1 afterwards; it should return no rows.
DELETE FROM attendance_sessions s
WHERE EXISTS (
  SELECT 1 FROM attendance_sessions keep
  WHERE keep.session_date = s.session_date
    AND (keep.created_at, keep.id) < (s.created_at, s.id)
);

-- 3) BACKSTOP — one session per day, enforced by the database.
--    The app already refuses to make a second one; this is what holds when two
--    leads tap at the same moment on different devices. The app treats the
--    resulting 409 as "someone beat me to it" and opens the existing session.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_one_per_day
  ON attendance_sessions (session_date);

-- 4) Drop attendance rows for accounts that are never part of attendance.
DELETE FROM attendance_records
WHERE lower(btrim(username)) IN ('ets', 'everythingthatsscrum')
   OR username LIKE 'Team %';
