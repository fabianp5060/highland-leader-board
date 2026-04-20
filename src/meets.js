import { scrapeMarkdown, scrapeWithLinks } from "./firecrawl.js";

// Match any meet URL (e.g. /TrackAndField/meet/621738 or .../meet/621738/results).
const MEET_URL_RE = /\/TrackAndField\/meet\/(\d+)(?:\/|$|\?|#|"|\))/g;

// Meet title + date live in the meet's top page markdown. Title is the first
// markdown h2 (`## Meet Name`), date sits on its own line shortly after.
const TITLE_RE = /^##\s+(.+?)\s*$/m;
const DATE_RE = /\b([A-Z][a-z]{2,8}\s+\d{1,2},\s+20\d{2})\b/;

export async function discoverMeetIds(url, { apiKey } = {}) {
  // Use the `links` format — markdown with onlyMainContent=true drops most hrefs,
  // while the links array consistently contains every calendar entry's URL.
  const { markdown, links } = await scrapeWithLinks(url, { apiKey, waitFor: 5000 });
  const ids = new Set();
  const add = (s) => {
    MEET_URL_RE.lastIndex = 0;
    let m;
    while ((m = MEET_URL_RE.exec(s)) !== null) ids.add(m[1]);
  };
  for (const href of links) add(href);
  add(markdown);
  return Array.from(ids);
}

export async function fetchMeetMeta(meetId, { apiKey }) {
  const url = `https://www.athletic.net/TrackAndField/meet/${meetId}`;
  const md = await scrapeMarkdown(url, { apiKey, waitFor: 3000 });
  const title = md.match(TITLE_RE)?.[1]?.trim() ?? `Meet ${meetId}`;
  const dateStr = md.match(DATE_RE)?.[1];
  let isoDate = null;
  if (dateStr) {
    const d = new Date(dateStr + " UTC");
    if (!isNaN(d.getTime())) isoDate = d.toISOString().slice(0, 10);
  }
  return { meetId, name: title, date: isoDate };
}
