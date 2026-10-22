# iOS Native App Setup — Step-by-Step

This is what you need to do to ship the iOS app and turn on real APNs notifications. Code is already in place; this is the Apple-portal + Xcode + Supabase configuration.

## 1. Apple Developer Portal

Go to https://developer.apple.com/account and do these in order.

### 1a. Register the App ID (one-time)

1. **Identifiers** → **+** (top-left)
2. Pick "App IDs" → Continue
3. Type "App" → Continue
4. Description: `Everything That's Scrum`
5. Bundle ID: **Explicit** → `org.radicalrobotics.scrum` (must match `capacitor.config.json`)
6. Scroll capabilities → check **Push Notifications**
7. Continue → Register

### 1b. Create an APNs Auth Key (one-time, reusable forever)

1. **Keys** → **+**
2. Key Name: `Scrum APNs`
3. Check **Apple Push Notifications service (APNs)**
4. Continue → Register
5. **Download the .p8 file** — this is your only chance, save it safely
6. Note the **Key ID** (10 chars) shown on the page
7. Note your **Team ID** — top-right of the developer portal

You now have three things to keep:
- `.p8` file contents
- Key ID (e.g., `ABC1234DEF`)
- Team ID (e.g., `1A2B3C4D5E`)

## 2. Supabase Function Secrets

In the Supabase dashboard → Edge Functions → **Secrets** tab (sibling of Functions). Add these:

| Name              | Value                                                                 |
|-------------------|-----------------------------------------------------------------------|
| `APNS_KEY_ID`     | Your 10-char Key ID                                                   |
| `APNS_TEAM_ID`    | Your 10-char Team ID                                                  |
| `APNS_AUTH_KEY`   | Paste the **entire contents** of the .p8 file (including BEGIN/END)   |
| `APNS_USE_SANDBOX`| `true` if testing via Xcode debug builds, `false` for TestFlight/App Store |

Then redeploy the `send-push` function so it picks up the new secrets.

## 3. SQL Migration

Run `apns_tokens.sql` (in the project root) once in your Supabase SQL editor.

## 4. Xcode Build & TestFlight

1. On Mac: `cd project-tracker && npm run cap:ios` — this builds the web app, syncs to native, opens Xcode
2. In Xcode:
   - Select project → **Signing & Capabilities** tab
   - Make sure **Team** is set to your Apple Developer account
   - Click **+ Capability** → add **Push Notifications**
   - At the top, change run target to "Any iOS Device" (not simulator)
   - **Product → Archive**
3. When archive finishes:
   - Window → Organizer
   - Select the archive → **Distribute App**
   - Choose **TestFlight & App Store** → Upload
4. After upload finishes (5-15 min for Apple processing):
   - Go to https://appstoreconnect.apple.com → My Apps → Your App → TestFlight
   - Add internal testers (yourself first)
   - Install via the **TestFlight app** on your iPhone

## 5. Verify

1. Open the TestFlight-installed app
2. Sign in
3. iOS prompts for notification permission → tap Allow
4. Check Supabase → table `apns_tokens` — your token should appear
5. From any device (computer is fine), click 🔔 Test Notification on the calendar
6. iPhone gets the push — instant, lock-screen visible, identical to a native app

## Troubleshooting

| Symptom                             | Fix                                                          |
|-------------------------------------|--------------------------------------------------------------|
| No row in `apns_tokens` after launch| Permission denied — Settings → Notifications → Scrum → on    |
| "BadDeviceToken" in function logs   | `APNS_USE_SANDBOX` mismatch (debug build = `true`)           |
| 403 from Apple                      | Wrong Key ID / Team ID, or `.p8` not pasted in full          |
| Works in TestFlight, not Xcode debug| `APNS_USE_SANDBOX=true` for debug, `false` for TestFlight    |
| "Topic disallowed" error            | Bundle ID in app doesn't match the one with Push capability  |

## What's already in the repo

- ✅ `@capacitor/push-notifications` plugin installed
- ✅ `src/hooks/useNativePush.js` — registers + saves token on iOS launch
- ✅ Hook wired into `App.jsx`
- ✅ `apns_tokens.sql` — DB schema
- ✅ `send-push` edge function — sends to both web push AND APNs
