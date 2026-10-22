# Limitless Scrum

A copy of Everything That's Scrum, rebranded and recolored (blue, black, yellow, silver) for an FRC team.

## Run it locally

```bash
npm install      # already done once; safe to repeat
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

## Before a real team uses it

1. **Own database.** `.env` still points at the ETS Supabase project, so anything saved here lands in the ETS database.
   Create a new Supabase project, run `supabase_setup.sql` and the files under `supabase/` against it, then put its URL
   and anon key in `.env` (see `.env.example`).
2. **Team number.** Set `HOME_TEAM_NUMBER` in `src/data/team.js` (currently `0000`). Everything that means "home team" keys off it.
3. **About page.** `src/components/TeamInfoPage.jsx` has `[Your team name]` placeholders, three leader cards and a coach quote to fill in.
   Replace `public/team-hero.jpg`, `public/team-selfie.png` and add photos under `public/leaders/` if you want them.
4. **Logo.** `public/ScrumLogo.png` and `public/ScrumLogo-transparent.png` are the generated infinity-mark logo. Swap freely.
5. **Theme colors.** The palette lives in `tailwind.config.js` under `brand` (`blue`, `yellow`, `silver`, `gold`, `black`).
   Page backgrounds use `from-[#0B0F1A] via-[#101B3A] to-[#0B0F1A]`; the body color is in `src/index.css`.
6. **Audio and misc.** `public/*.mp3` and the changelog (`src/components/ChangelogPopup.jsx`) are still ETS history; delete or rewrite as you like.
