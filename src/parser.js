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
// For relays the leading athlete link is absent — the row is anchored by the team
// name (often suffixed with the relay letter, e.g. "Highland - A") and the four
// participating athletes are listed below the time.

const ATHLETE_LINK = /\[([^\]]+)\]\((?:https?:\/\/www\.athletic\.net)?\/athlete\/(\d+)\/track-and-field\)/g;
const TEAM_LINK = /\[([^\]]+)\]\((?:https?:\/\/www\.athletic\.net)?\/team\/(\d+)\/track-and-field[^)]*\)/g;
const RESULT_LINK = /\[([^\]\n]+)\]\((?:https?:\/\/www\.athletic\.net)?\/result\/[^)]+\)/;
// A place prefix is a bare integer (1-999) on its own line, optionally preceded by `##### Finals` headers.
const PLACE_BEFORE = /(?:^|\n)\s*(\d{1,3})\s*(?:\n|$)/g;

function lastPlaceBefore(markdown, index) {
  const m = lastPlaceMarkBefore(markdown, index);
  return m ? m.place : null;
}

function lastPlaceMarkBefore(markdown, index) {
  const re = new RegExp(PLACE_BEFORE.source, "g");
  let match;
  let last = null;
  while ((match = re.exec(markdown)) !== null) {
    if (match.index >= index) break;
    last = { place: Number(match[1]), index: match.index };
  }
  return last;
}

function nextPlaceMarkerAfter(markdown, fromIdx) {
  const re = new RegExp(PLACE_BEFORE.source, "g");
  re.lastIndex = fromIdx;
  const m = re.exec(markdown);
  return m ? m.index : markdown.length;
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

// On per-event relay pages athletic.net renders the time as plain text (no
// `[42.50](/result/...)` link) — pick the first line that's neither a markdown
// link nor an image, and isn't a literal DQ/DNF marker.
function firstPlainMarkInRange(markdown, fromIdx, toIdx) {
  const slice = markdown.slice(fromIdx, toIdx);
  for (const raw of slice.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("[") || line.startsWith("!") || line.startsWith("#")) continue;
    if (line.startsWith("\\-")) continue; // escaped "--" placeholder for DQ rows
    return line;
  }
  return "";
}

// Pull athlete profile links from a slice of markdown, capped at `limit` (relays are 4-leg).
function findAthletesInRange(markdown, startIdx, endIdx, limit = 4) {
  if (endIdx <= startIdx) return [];
  const slice = markdown.slice(startIdx, endIdx);
  const re = new RegExp(ATHLETE_LINK.source, "g");
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(slice)) !== null) {
    const athleteId = m[2];
    if (seen.has(athleteId)) continue;
    seen.add(athleteId);
    out.push({ name: m[1].trim(), athleteId });
    if (out.length >= limit) break;
  }
  return out;
}

// Markdown-table row format used on /results/all pages:
//   | 1. | SR | [Janie Brower](/athlete/NNN/track-and-field) |  | [5-02.00](/result/...) | [Highland](/team/13877/...) |  |
// Also matches relay rows where the athlete cell is a team name (often with a relay letter):
//   | 1. |  | [Highland - A](/team/13877/...) |  | [48.45](/result/...) | [Highland](/team/13877/...) |  |
const TABLE_ROW = /\|\s*(\d+)\.\s*\|([^\n]+?)\|/g;

function nextTableRowOrSectionAfter(markdown, fromIdx) {
  const re = /\n\s*\|\s*\d+\.\s*\||\n#{2,}/g;
  re.lastIndex = fromIdx;
  const m = re.exec(markdown);
  return m ? m.index : markdown.length;
}

function parseTableRowMatches(markdown, { teamId, teamName }) {
  const out = [];
  let m;
  TABLE_ROW.lastIndex = 0;
  while ((m = TABLE_ROW.exec(markdown)) !== null) {
    const place = Number(m[1]);
    // Pull the full row (ends at the next newline) so we can capture all its cell links.
    const rowStart = m.index;
    const nl = markdown.indexOf("\n", rowStart);
    const rowEnd = nl === -1 ? markdown.length : nl;
    const row = markdown.slice(rowStart, rowEnd);
    const teamRe = new RegExp(TEAM_LINK.source, "g");
    const teamLinks = [];
    let t;
    while ((t = teamRe.exec(row)) !== null) teamLinks.push({ name: t[1].trim(), teamId: t[2] });
    if (!teamLinks.length) continue;
    // The canonical team cell is the last team link in the row; the first team link
    // may be the relay-designator cell ("Highland - A") used in lieu of an athlete.
    const team = teamLinks[teamLinks.length - 1];
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
      // Relay row: prefer the first team link's text as the relay name (carries the
      // " - A" / " - B" designator); fall back to the canonical team name.
      const relayName = teamLinks.length > 1 && teamLinks[0].name !== team.name
        ? teamLinks[0].name
        : team.name;
      // Athletes for the relay leg may sit in cells past the row end (continuation
      // line) or just below — scan up to the next table row / next section header.
      const athleteWindowEnd = nextTableRowOrSectionAfter(markdown, rowEnd);
      const athletes = findAthletesInRange(markdown, rowStart, athleteWindowEnd);
      out.push({
        place,
        athlete: relayName,
        athleteId: null,
        team: team.name,
        teamId: team.teamId,
        mark: mMatch ? mMatch[1].trim() : "",
        kind: "relay",
        athletes,
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
  // For each placement athletic.net renders a relay row as:
  //   {place} \n [Team - A](/team/...) \n [team-logo](...) \n [Team](/team/...) \n [time](...) \n leg1...leg4
  // The first team-name link after the place marker (e.g. "Highland - A") anchors the
  // relay; the canonical "Highland" cell that follows must not also emit a row.
  TEAM_LINK.lastIndex = 0;
  while ((m = TEAM_LINK.exec(markdown)) !== null) {
    const team = { name: m[1].trim(), teamId: m[2], end: m.index + m[0].length };
    const isTarget = team.teamId === String(teamId) || team.name.toLowerCase() === teamName.toLowerCase();
    if (!isTarget) continue;
    const placeMark = lastPlaceMarkBefore(markdown, m.index);
    if (!placeMark) continue;
    // Slice from the place marker up to this team link — what's "in front of" the team
    // designator on this row. If there's an athlete link there, this is an individual
    // result the athlete-anchored loop already emitted. If there's another Highland team
    // link there, this is the canonical team cell of an already-emitted relay anchor.
    const between = markdown.slice(placeMark.index, m.index);
    const athleteRe = new RegExp(ATHLETE_LINK.source, "g");
    if (athleteRe.test(between)) continue;
    const earlierTeamRe = new RegExp(TEAM_LINK.source, "g");
    let earlier;
    let earlierTargetTeam = false;
    while ((earlier = earlierTeamRe.exec(between)) !== null) {
      if (earlier[2] === String(teamId) || earlier[1].trim().toLowerCase().startsWith(teamName.toLowerCase())) {
        earlierTargetTeam = true;
        break;
      }
    }
    if (earlierTargetTeam) continue;
    // Relay athletes are rendered after the time, before the next place marker.
    const windowEnd = nextPlaceMarkerAfter(markdown, team.end);
    // Per-event relay pages put the time as plain text (no /result/ link); the
    // legacy /results/all format wraps it as `[42.50](/result/...)`. Try both.
    const mark = firstResultAfter(markdown, team.end) ?? firstPlainMarkInRange(markdown, team.end, windowEnd);
    const athletes = findAthletesInRange(markdown, team.end, windowEnd);
    // No mark and no athletes means we're looking at random page chrome, not a
    // real placement — skip rather than emit a phantom relay row.
    if (!mark && athletes.length === 0) continue;
    entries.push({
      place: placeMark.place,
      athlete: team.name,
      athleteId: null,
      team: team.name,
      teamId: team.teamId,
      mark: mark ?? "",
      kind: "relay",
      athletes,
    });
  }

  return dedupe(entries);
}

function dedupe(entries) {
  const seen = new Map();
  const out = [];
  for (const e of entries) {
    const k = `${e.kind}:${e.athleteId ?? e.athlete}:${e.place}:${e.mark}`;
    const prev = seen.get(k);
    // Prefer the entry that has athletes populated (relay backfill case).
    if (prev) {
      if ((e.athletes?.length ?? 0) > (prev.athletes?.length ?? 0)) {
        out[prev.idx] = e;
        seen.set(k, { idx: prev.idx, entry: e });
      }
      continue;
    }
    seen.set(k, { idx: out.length, entry: e });
    out.push(e);
  }
  return out;
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
