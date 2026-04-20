// Parses Firecrawl markdown for an athletic.net event results page and extracts
// Highland's placements. Each results row has a shape like:
//
//   1
//   [JB](https://www.athletic.net/profile/JanieBrower)[Janie Brower](https://www.athletic.net/athlete/24508436/track-and-field)
//   [![](...)](https://www.athletic.net/team/13877/track-and-field-outdoor)
//   [Highland](https://www.athletic.net/team/13877/track-and-field-outdoor)
//   [5-02.00](https://www.athletic.net/result/5OidjNocLc4wKlNtl)
//   1.57m
//   Yr: JR
//
// For relays the athlete link is absent — the row is anchored by the team name instead.

const ATHLETE_LINK = /\[([^\]]+)\]\((?:https?:\/\/www\.athletic\.net)?\/athlete\/(\d+)\/track-and-field\)/g;
const TEAM_LINK = /\[([^\]]+)\]\((?:https?:\/\/www\.athletic\.net)?\/team\/(\d+)\/track-and-field[^)]*\)/g;
const RESULT_LINK = /\[([^\]\n]+)\]\((?:https?:\/\/www\.athletic\.net)?\/result\/[^)]+\)/;
// A place prefix is a bare integer (1-999) on its own line, optionally preceded by `##### Finals` headers.
const PLACE_BEFORE = /(?:^|\n)\s*(\d{1,3})\s*(?:\n|$)/g;

function lastPlaceBefore(markdown, index) {
  let match;
  let last = null;
  PLACE_BEFORE.lastIndex = 0;
  while ((match = PLACE_BEFORE.exec(markdown)) !== null) {
    if (match.index >= index) break;
    last = Number(match[1]);
  }
  return last;
}

function firstTeamAfter(markdown, index) {
  TEAM_LINK.lastIndex = index;
  const m = TEAM_LINK.exec(markdown);
  if (!m) return null;
  return { name: m[1].trim(), teamId: m[2], end: m.index + m[0].length };
}

function firstResultAfter(markdown, index) {
  const slice = markdown.slice(index, index + 2000);
  const m = slice.match(RESULT_LINK);
  if (!m) return null;
  return m[1].trim();
}

// Markdown-table row format used on /results/all pages:
//   | 1. | SR | [Janie Brower](/athlete/NNN/track-and-field) |  | [5-02.00](/result/...) | [Highland](/team/13877/...) |  |
// Also matches relay rows where the athlete cell is a team name instead of a person:
//   | 1. |  | [Highland](/team/13877/...) |  | [48.45](/result/...) | [Highland](/team/13877/...) |  |
const TABLE_ROW = /\|\s*(\d+)\.\s*\|([^\n]+?)\|/g;

function parseTableRowMatches(markdown, { teamId, teamName }) {
  const out = [];
  let m;
  TABLE_ROW.lastIndex = 0;
  while ((m = TABLE_ROW.exec(markdown)) !== null) {
    const place = Number(m[1]);
    // Pull the full row (ends at the next newline) so we can capture all its cell links.
    const rowStart = m.index;
    const nl = markdown.indexOf("\n", rowStart);
    const row = markdown.slice(rowStart, nl === -1 ? markdown.length : nl);
    // Team link tells us whether this row belongs to our target team.
    const teamRe = /\[([^\]]+)\]\((?:https?:\/\/www\.athletic\.net)?\/team\/(\d+)\/track-and-field[^)]*\)/g;
    let team = null;
    let t;
    while ((t = teamRe.exec(row)) !== null) team = { name: t[1].trim(), teamId: t[2] }; // last team cell wins
    if (!team) continue;
    if (team.teamId !== String(teamId) && team.name.toLowerCase() !== teamName.toLowerCase()) continue;
    const athleteRe = /\[([^\]]+)\]\((?:https?:\/\/www\.athletic\.net)?\/athlete\/(\d+)\/track-and-field\)/;
    const markRe = /\[([^\]\n]+)\]\((?:https?:\/\/www\.athletic\.net)?\/result\/[^)]+\)/;
    const aMatch = row.match(athleteRe);
    const mMatch = row.match(markRe);
    if (aMatch) {
      out.push({
        place,
        athlete: aMatch[1].trim(),
        athleteId: aMatch[2],
        team: team.name,
        teamId: team.teamId,
        mark: mMatch ? mMatch[1].trim() : "",
        kind: "individual",
      });
    } else {
      // Relay: athlete cell holds the team name link; there is no athlete link.
      out.push({
        place,
        athlete: `${team.name} Relay`,
        athleteId: null,
        team: team.name,
        teamId: team.teamId,
        mark: mMatch ? mMatch[1].trim() : "",
        kind: "relay",
      });
    }
  }
  return out;
}

export function parseEventPage(markdown, { teamId, teamName }) {
  // If the markdown has the /results/all table format, prefer that — it's unambiguous.
  const tableHits = parseTableRowMatches(markdown, { teamId, teamName });
  if (tableHits.length) return dedupe(tableHits);

  const entries = [];
  // --- Individual events: anchored on each athlete link ---
  ATHLETE_LINK.lastIndex = 0;
  let m;
  while ((m = ATHLETE_LINK.exec(markdown)) !== null) {
    const athleteName = m[1].trim();
    const athleteId = m[2];
    const athleteEnd = m.index + m[0].length;
    const team = firstTeamAfter(markdown, athleteEnd);
    if (!team) continue;
    // Athletic.net renders the team logo link *and* the team name link back-to-back;
    // the first team link after the athlete is the one attached to this result.
    const isTarget = team.teamId === String(teamId) || team.name.toLowerCase() === teamName.toLowerCase();
    if (!isTarget) continue;
    const place = lastPlaceBefore(markdown, m.index);
    if (place == null) continue;
    const mark = firstResultAfter(markdown, team.end);
    entries.push({
      place,
      athlete: athleteName,
      athleteId,
      team: team.name,
      teamId: team.teamId,
      mark: mark ?? "",
      kind: "individual",
    });
  }

  // --- Relay events: anchored on team name where the *athlete* link is missing. ---
  // Heuristic: a team link immediately followed by a result link, with no athlete link
  // between the previous place marker and this team link.
  TEAM_LINK.lastIndex = 0;
  while ((m = TEAM_LINK.exec(markdown)) !== null) {
    const team = { name: m[1].trim(), teamId: m[2], end: m.index + m[0].length };
    const isTarget = team.teamId === String(teamId) || team.name.toLowerCase() === teamName.toLowerCase();
    if (!isTarget) continue;
    // Skip if already captured as an individual entry (i.e. an athlete link exists in the preceding 300 chars).
    const prefix = markdown.slice(Math.max(0, m.index - 400), m.index);
    ATHLETE_LINK.lastIndex = 0;
    if (ATHLETE_LINK.test(prefix)) continue;
    const place = lastPlaceBefore(markdown, m.index);
    if (place == null) continue;
    const mark = firstResultAfter(markdown, team.end);
    if (!mark) continue;
    entries.push({
      place,
      athlete: `${team.name} Relay`,
      athleteId: null,
      team: team.name,
      teamId: team.teamId,
      mark,
      kind: "relay",
    });
  }

  return dedupe(entries);
}

function dedupe(entries) {
  const seen = new Set();
  return entries.filter((e) => {
    const k = `${e.kind}:${e.athleteId ?? e.athlete}:${e.place}:${e.mark}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function topEight(entries) {
  return entries.filter((e) => e.place >= 1 && e.place <= 8);
}

// Matches the section header for a single event inside a /results/all page, e.g.
// `#### [100 Meters](https://.../results/m/1/100m) Varsity - Finals`
const EVENT_HEADER = /####\s*\[([^\]]+)\]\((?:https?:\/\/www\.athletic\.net)?\/TrackAndField\/meet\/(\d+)\/results\/([mf])\/(\d+)\/([a-z0-9]+)\)[^\n]*/g;

export function parseMeetPage(markdown, { teamId, teamName }) {
  const sections = [];
  const headers = [];
  let m;
  EVENT_HEADER.lastIndex = 0;
  while ((m = EVENT_HEADER.exec(markdown)) !== null) {
    headers.push({
      index: m.index,
      label: m[1].trim(),
      meetId: m[2],
      gender: m[3] === "m" ? "men" : "women",
      division: Number(m[4]),
      code: m[5],
    });
  }
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const end = headers[i + 1]?.index ?? markdown.length;
    const chunk = markdown.slice(h.index, end);
    const entries = parseEventPage(chunk, { teamId, teamName });
    for (const e of entries) sections.push({ ...h, ...e });
  }
  return sections;
}
