# Trace

Live scores and stats for the NBA, NFL, NCAA football, NCAA men's and women's basketball, and the WNBA, built as a web app that installs to an iPhone home screen.

<img src="public/icon-192.png" alt="Trace app icon" width="96">

## Features

- **Live scoreboard** for each league, refreshed every 10 seconds while games are in progress. Filter by live, upcoming or final, search by team, and jump to any date from a calendar.
- **Period-by-period scoring** for both teams (quarters, halves for men's college basketball, and overtime), with a combined row that adds the two teams together and shows the over/under line when one is posted.
- **Half totals** for each team and combined.
- **Player box scores**, with personal fouls highlighted and coloured as a player approaches the limit.
- **Season stats** for any player: tap a name to compare their current game with their season averages (basketball) or season totals and per-game figures (football). Works before the game starts, from the roster.
- **Rosters** for both teams, split into active and inactive with the reason (injury designation, did not play, practice squad).
- **In-game injuries** with the quarter and clock. This is exact for the NFL, where the play-by-play names the injured player. For basketball it is approximate, based on when an injury update is posted during the game.
- **Team stat comparison** and recent or scoring plays.

## Tech

- [React](https://react.dev) and TypeScript, bundled with [Vite](https://vite.dev)
- No backend and no database: the app runs entirely in the browser
- Hosted as static files on [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/)
- A strict Content Security Policy and other security headers are generated at build time (see `vite.config.ts`)

## Running it

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server on this computer |
| `npm run build` | Type-check and build the production files into `dist` |
| `npm run phone` | Build, then serve to other devices on the same Wi-Fi (plain HTTP, so trusted networks only) |
| `npm run deploy` | Build and publish to Cloudflare (needs `npx wrangler login` first) |

To publish your own copy, change `name` in `wrangler.jsonc`, then run `npm run deploy`.

## Installing on an iPhone

Open the deployed site in Safari, tap Share, then **Add to Home Screen**. It opens full-screen with its own icon.

## Project layout

```
src/
  api.ts            Fetches the score feed and normalizes it for the UI
  leagues.ts        League list: feed paths, period counts, foul limits
  usePolling.ts     Fetch-on-an-interval hook
  App.tsx           Scoreboard, league tabs, date and filters
  components/       Game page, line score, half totals, player sheet, rosters, welcome screen
scripts/
  make-icons.mjs    Generates the app icons
```

## Data source

Scores and stats come from ESPN's public web endpoints. These are unofficial and undocumented: they can change or stop working without notice, and they are not licensed for commercial use. This project is for personal use and is not affiliated with or endorsed by ESPN or any league or team. Team names and logos belong to their respective owners and are loaded from ESPN at runtime, not stored in this repository.
