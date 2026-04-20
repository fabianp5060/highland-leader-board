# Highland Leader Board

Static site that shows Highland HS's 2026 outdoor track & field season: every top-8 placement at every meet, plus a running season leaderboard scored **10-8-6-5-4-3-2-1**.

Data comes from [athletic.net](https://athletic.net) via a small Node scraper. The site itself is plain HTML/CSS/JS — no build step — and is hosted on GitHub Pages directly from the repo root.

## How to update the leaderboard

```bash
cp .env.example .env            # add your FIRECRAWL_API_KEY
npm install
npm run scrape                  # refreshes results.json in the repo root
git add results.json && git commit -m "update results $(date +%F)" && git push
```

That's it — Pages re-serves the updated `results.json`, the viewer picks it up on next load.

### Iterate on a single meet

```bash
node src/scrape.js --meet 621738
```

### Preview locally

```bash
npm run preview                 # http://localhost:5173
```

(A local server is only needed because `fetch("./results.json")` is blocked on `file://` — opening `index.html` directly won't work in most browsers.)

## GitHub Pages setup

1. Push this repo to GitHub.
2. Repo → **Settings → Pages**: Source = **Deploy from a branch**, Branch = `main`, Folder = `/ (root)`.
3. Site lives at `https://<user>.github.io/highland-leader-board/`.

Nothing else is required — the static files (`index.html`, `app.js`, `styles.css`, `results.json`) sit at the repo root, same layout as [nightmare-at-the-nest](https://github.com/fabianp5060/nightmare-at-the-nest).

## How the scrape works

1. **Discover meets** — scrape `team/13877/track-and-field-outdoor/2026`, pull every `/TrackAndField/meet/NNNNN` ID from the links array (see [src/meets.js](src/meets.js)).
2. **Scrape each meet** — one Firecrawl call per meet to `.../results/all`, which contains every event section on one page (see [src/scrape.js](src/scrape.js)).
3. **Parse** — split each page by `#### [Event](.../m|f/1/code)` headers; extract Highland rows (team ID `13877`); handle both the vertical layout and the markdown-table layout (see [src/parser.js](src/parser.js)).
4. **Score** — places 1–8 earn `10, 8, 6, 5, 4, 3, 2, 1` points (see [src/events.js](src/events.js)).
5. **Write** — the whole season lands in `results.json` at the repo root, which the viewer reads on load.

## Project layout

```
highland-leader-board/
├── index.html              # viewer
├── app.js
├── styles.css
├── results.json            # generated — commit after each scrape
├── src/
│   ├── scrape.js           # orchestrator
│   ├── firecrawl.js        # /v1/scrape wrapper
│   ├── events.js           # event table + points
│   ├── parser.js           # markdown → placement rows
│   └── meets.js            # discover meet IDs from the team calendar
├── scripts/
│   └── parse-offline.js    # parse a saved Firecrawl JSON response (no API key)
└── test/
    └── parse.test.js       # `npm test`
```

## Scoring

```
place:  1   2   3   4   5   6   7   8
points: 10  8   6   5   4   3   2   1
```

Places 9+ aren't tracked and don't appear in the leaderboard.

## Re-targeting another team

`TEAM_ID`, `TEAM_NAME`, and `SEASON` in `.env` are the only knobs — point them at any athletic.net program to reuse the scraper.
