# Push Notifications — what to do if they break again

Fixed on 2026-05-16. This is the playbook so you can repeat or recover.

## How it works

Web push (PWA / browser) flow:
1. Browser subscribes via `pushManager.subscribe({ applicationServerKey })`
2. Browser saves a row in `push_subscriptions` (user_id, endpoint, p256dh, auth)
3. Server (the `send-push` edge function) reads that row and uses `web-push` to send a payload
4. Apple/Google receives it, fans out to the device, OS shows the notification

The signing identity for that whole flow is a **VAPID keypair** — one public key on the client, one private key on the server. They MUST match.

## The classic failure mode

Symptom: `webSubsCount: 7` in debug, but `webSent: 0` and all errors say:
```
web.push.apple.com → 400: Received unexpected response code
```

Cause: **VAPID public/private keys don't match**. Apple validates the signature on the push and rejects the whole batch. Common causes:
- New deploy with a fresh public key but old private key on server (or vice versa)
- Placeholder `VAPID_SUBJECT` like `mailto:team@example.com` (Apple rejects example.com)
- Someone rotated keys on one side but not the other

## How we fixed it

### 1. Roll a fresh VAPID keypair

```bash
npx web-push generate-vapid-keys
```

Save the public and private keys somewhere.

### 2. Put both keys on the server

You need a Supabase personal access token: https://supabase.com/dashboard/account/tokens

```bash
SUPABASE_ACCESS_TOKEN=sbp_XXXXXX npx supabase secrets set \
  VAPID_PUBLIC_KEY=BB... \
  VAPID_PRIVATE_KEY=CP... \
  VAPID_SUBJECT=mailto:youremail@gmail.com \
  --project-ref wqxjmykphkacbjfxmvzd
```

⚠️ `VAPID_SUBJECT` must be a real email or HTTPS URL. NEVER use example.com — Apple silently rejects.

### 3. Put the public key on the client

Hardcoded in:
- `project-tracker/src/hooks/usePushNotifications.js` (~line 73 and ~line 137)
- `project-tracker/src/helper/helperPush.js` (EN Helper, see EN_HELPER.md)
- `src/hooks/usePushNotifications.js` (mirror)

The constant name is `VAPID_PUBLIC_KEY` / `vapidPublicKey`. It's hardcoded (not from an env var) so the GitHub Actions `VITE_VAPID_PUBLIC_KEY` secret can't override and drift.

### 4. Wipe stale subscriptions

All existing rows in `push_subscriptions` are now invalid because they were signed against the OLD public key.

```bash
# Anon key REST DELETE (anon has DELETE perms on this table per RLS)
curl -X DELETE "https://wqxjmykphkacbjfxmvzd.supabase.co/rest/v1/push_subscriptions?user_id=neq.00000000-0000-0000-0000-000000000000" \
  -H "apikey: ANON_KEY" -H "Authorization: Bearer ANON_KEY"
```

Or just delete via Supabase dashboard → Table Editor → push_subscriptions → select all → delete.

### 5. Auto-migration (already in code)

`usePushNotifications.js` has logic that on every load:
- Reads the existing SW subscription's `applicationServerKey`
- Compares it base64url-encoded to the current `VAPID_PUBLIC_KEY` constant
- If they differ: unsubscribes, deletes the stale DB row, re-subscribes with the new key

So once steps 1-4 are done and you push, every device just needs to open the PWA once and they self-heal. No user action needed beyond opening the app.

## How to verify it's working

### Quick probe from terminal

```bash
URL="https://wqxjmykphkacbjfxmvzd.supabase.co"
KEY="ANON_KEY_HERE"

# Hit send-push for any user with a subscription
curl -sS -X POST "$URL/functions/v1/send-push" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"record":{"user_id":"YOUR_UUID","title":"test","body":"test","force":true}}'
```

Look at the `debug` object in the response:
- `webSubsCount: N` — function found N rows ✓
- `webSent: N` — N pushes succeeded ✓
- `webErrors: [...]` — if non-empty, every entry shows host + status + message

### On a phone

1. Open PWA from home screen (must be installed via Add to Home Screen, NOT a Safari bookmark)
2. Calendar page → tap 🔔 Test Notification
3. Lock the phone immediately
4. Watch lock screen

## Who actually receives notifications

- **Web push works** on iOS only when the site is installed via Add to Home Screen (iOS 16.4+). Safari bookmarks never get push.
- **In-app bell** works for everyone with a row in `profiles` regardless.
- **Native iOS push** (TestFlight app) requires the Xcode Push Notifications capability — not done yet. See `IOS_APP_SETUP.md`.

## Files involved

| File | Role |
|------|------|
| `project-tracker/src/hooks/usePushNotifications.js` | Client subscribe + auto-migrate logic |
| `project-tracker/src/components/CalendarView.jsx` | Test Notification button (~line 656) |
| `project-tracker/public/sw.js` | Service worker — receives push events and calls `showNotification` |
| `project-tracker/supabase/functions/send-push/index.ts` | Edge function — fans subscription → web-push library → Apple/Google |
| `project-tracker/supabase/functions/process-scheduled/index.ts` | Runs on cron, drains `scheduled_notifications` (calendar reminders) |
| `project-tracker/public/helper/sw.js`, `src/helper/helperPush.js` | EN Helper's own worker and subscription (`push_subscriptions.app = 'helper'`), notebook reminders only |
| `project-tracker/supabase/functions/notebook-voice/index.ts` | Sends EN Helper's end-of-meeting reminders (see EN_HELPER.md) |

## Tables involved

| Table | Role |
|-------|------|
| `push_subscriptions` | Web push endpoints (one per browser/device) |
| `apns_tokens` | Native iOS APNs tokens (currently only `DEBUG` placeholder rows) |
| `notifications` | In-app bell records |
| `scheduled_notifications` | Calendar reminders queued for future delivery |
| `profiles.notification_prefs` | Per-user enabled/calendar/chat opt-in flags |

## Supabase env secrets that matter

| Secret | Purpose |
|--------|---------|
| `VAPID_PUBLIC_KEY` | Must match the constant in `usePushNotifications.js` |
| `VAPID_PRIVATE_KEY` | Used by `send-push` to sign |
| `VAPID_SUBJECT` | MUST be a real email/URL — not example.com |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-managed; lets edge functions read all DB rows |
| `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_AUTH_KEY` | Native iOS only — leave unset if you're not on TestFlight yet |
