-- Puts each member's sign-in email on their profile, so it can show on the
-- profile page. auth.users isn't readable from the client, and approved_emails
-- is consumed as people sign up, so the address has to be copied onto profiles.
--
-- Note: "Allow all on profiles" makes this readable by anyone holding the anon
-- key, which ships in the public JS bundle. That's the accepted trade-off here.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text DEFAULT '';

-- Backfill everyone who already has an account.
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND COALESCE(p.email, '') IS DISTINCT FROM u.email;

-- Keep it current when an address changes, or when the auth user is created
-- after the profile row. SECURITY DEFINER so the trigger can write to profiles
-- whoever caused the change.
CREATE OR REPLACE FUNCTION sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_email_trigger ON auth.users;
CREATE TRIGGER sync_profile_email_trigger
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION sync_profile_email();

-- The other order: a profile row created after its auth user fetches its own
-- address. Nothing here creates profiles from auth.users, so without this a new
-- member's profile would land with an empty email and stay that way.
CREATE OR REPLACE FUNCTION fill_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.email, '') = '' THEN
    SELECT u.email INTO NEW.email FROM auth.users u WHERE u.id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_profile_email_trigger ON profiles;
CREATE TRIGGER fill_profile_email_trigger
BEFORE INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION fill_profile_email();

NOTIFY pgrst, 'reload schema';
