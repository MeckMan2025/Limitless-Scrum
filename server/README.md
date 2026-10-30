# The Limitless Scrum server

The app was written against Supabase. On the robotics server it runs against
this instead: one Node process that serves the built app and answers the same
calls supabase-js makes, keeping everything in the team's PostgreSQL database.
Every account on every computer sees the same boards, calendar and settings,
and changes appear on the other computers as they are made.

| Path (under `/scrum`) | What | File |
|---|---|---|
| `/` | The app (`dist/`), and `/helper/` for EN Helper | `index.js` |
| `/healthz` | 200 when the database answers | `index.js` |
| `/api/auth/v1` | Sign-in, sign-up, password change | `auth.js` |
| `/api/rest/v1` | The app's tables (PostgREST's query language) | `rest.js` |
| `/api/realtime/v1/websocket` | Live updates and who is online | `realtime.js` |
| `/api/storage/v1` | Uploaded photos, receipts, recordings | `storage.js` |
| `/api/functions/v1` | Account tools for leads (create, reset, delete) | `functions.js` |

Every app table is stored in one PostgreSQL table, `rows` (one line per row,
the row as JSON), queried with the same code the browser database used
(`src/lib/restQuery.js`). Accounts are in `auth_users`; passwords are scrypt
hashes. The key that signs sign-in tokens is made on first start and kept in
`server_meta`.

## Accounts

Sign-up is by invitation, as before: a lead adds an address in User
Management, and that person picks **Create your account** on the sign-in
screen. A lead can also create an account outright, with a temporary password
the person must change.

No email leaves the robotics server, so **Forgot password** cannot send a
link. A lead resets the password in User Management instead.

The very first account has to be invited from the robotics server's shell,
since nobody can sign in yet:

    sudo robotics-team docker 9082 exec live-scrum-1 node server/cli.js approve someone@example.org Co-Founder
    sudo robotics-team docker 9082 exec live-scrum-1 node server/cli.js reset someone@example.org   # temporary password
    sudo robotics-team docker 9082 exec live-scrum-1 node server/cli.js list

Use `dev-scrum-1` for the preview, which has its own database and accounts.

## Releasing a new version

On the robotics server this app runs as part of team 9082's repository,
[team-website-9082](https://github.com/Pleasant-Valley-Robotics/team-website-9082),
whose `compose.yaml` builds it from this repository at a tag. To release:

1. Push to `main` here, then tag it: `git tag v1.0.1 && git push origin v1.0.1`.
2. In team-website-9082, a pull request changing `#v1.0.0` to `#v1.0.1` in
   `compose.yaml`. Merging it updates the preview
   (https://dev-9082.firstpvrobotics.com/scrum/, mentor password).
3. A new release tag there (`v3.2.1`, ...) puts it live at
   https://9082.firstpvrobotics.com/scrum/.

## Running it on a computer

It needs PostgreSQL. With a database to point it at:

    npm run build
    PGHOST=127.0.0.1 PGUSER=me PGDATABASE=scrum npm run server   # http://127.0.0.1:8080/scrum/

`npm run dev` (Vite on :5173/scrum/) passes `/scrum/api` through to that server too.

## Not carried over

Push notifications, scheduled reminders and the notebook voice helper needed
outside services (web push keys, an AI API). Their features are off by
default; their functions answer without doing anything.
