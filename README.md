# Limitless Scrum

A copy of Everything That's Scrum, rebranded and recolored (blue, black, yellow, silver) for an FRC team.

## Where it runs

On the PV Robotics server, with sign-in, and with every account and computer seeing the same boards, calendar and
settings as they change.

Live: **https://9082.firstpvrobotics.com/scrum/** (preview: https://dev-9082.firstpvrobotics.com/scrum/, mentor
password). It runs beside team 9082's website, from that team's repository, which builds this one at a tag; how to
release a new version is in [server/README.md](server/README.md).

The server builds `Dockerfile` (`compose.yaml` and `robotics.yml` here would run it as a team of its own); `server/` is
the app's own back end, which
stands in for the Supabase project the app was written against. Accounts, the first invitation, and running it on
your own computer are in [server/README.md](server/README.md). The old GitHub Pages address now forwards to live.

## Run it locally

```bash
npm install
npm run build && npm run server   # http://127.0.0.1:8080/scrum/ (needs PostgreSQL, see server/README.md)
npm run demo                      # no sign-in, an empty pretend database: for looking around
```

## Before a real team uses it

1. **First account.** Invite the first lead from the server's shell (server/README.md); they invite everyone else.
2. **Team number.** Set `HOME_TEAM_NUMBER` in `src/data/team.js` (currently `0000`). Everything that means "home team" keys off it.
3. **About page.** `src/components/TeamInfoPage.jsx` has `[Your team name]` placeholders, three leader cards and a coach quote to fill in.
   Replace `public/team-hero.jpg`, `public/team-selfie.png` and add photos under `public/leaders/` if you want them.
4. **Logo.** `public/ScrumLogo.png` and `public/ScrumLogo-transparent.png` are the generated infinity-mark logo. Swap freely.
5. **Theme colors.** The palette lives in `tailwind.config.js` under `brand` (`blue`, `yellow`, `silver`, `gold`, `black`).
   Page backgrounds use `from-[#0B0F1A] via-[#101B3A] to-[#0B0F1A]`; the body color is in `src/index.css`.
6. **Audio and misc.** `public/*.mp3` and the changelog (`src/components/ChangelogPopup.jsx`) are still ETS history; delete or rewrite as you like.
