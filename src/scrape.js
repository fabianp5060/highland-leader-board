#!/usr/bin/env node
// Scrapes Highland HS track & field results from athletic.net into data/results.json.
// Usage:
//   FIRECRAWL_API_KEY=fc-... node src/scrape.js
//   node src/scrape.js --meet 621738          # scrape a single meet
//   node src/scrape.js --refresh-meets-only   # only redo meet metadata
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

import { EVENTS, pointsForPlace } from "./events.js";
import { parseMeetPage, topEight } from "./parser.js";
import { scrapeMarkdown } from "./firecrawl.js";
import { discoverMeetIds, fetchMeetMeta } from "./meets.js";
import { kindFor } from "./meet-kinds.js";

const EVENT_TYPE = new Map(EVENTS.map((e) => [e.code, e.type]));
const EVENT_LABEL = new Map(EVENTS.map((e) => [e.code, e.label]));

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_FILE = resolve(ROOT, "results.json");

const TEAM_ID = process.env.TEAM_ID || "13877";
const TEAM_NAME = process.env.TEAM_NAME || "Highland";
const SEASON = process.env.SEASON || "2026";
const TEAM_PAGE = `https://www.athletic.net/team/${TEAM_ID}/track-and-field-outdoor/${SEASON}`;

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") ? true : (process.argv[++i] ?? true));
}

async function loadExisting() {
  if (!existsSync(DATA_FILE)) return { team: { id: TEAM_ID, name: TEAM_NAME }, season: SEASON, meets: [] };
  return JSON.parse(await readFile(DATA_FILE, "utf8"));
}

async function saveData(data) {
  data.updatedAt = new Date().toISOString();
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

async function scrapeMeet(meetId, apiKey) {
  // One call per meet — /results/all includes every event section on a single page.
  const url = `https://www.athletic.net/TrackAndField/meet/${meetId}/results/all`;
  const md = await scrapeMarkdown(url, { apiKey, waitFor: 3500 });
  const placings = topEight(parseMeetPage(md, { teamId: TEAM_ID, teamName: TEAM_NAME }));
  return placings.map((p) => ({
    event: EVENT_LABEL.get(p.code) ?? p.label,
    eventCode: p.code,
    gender: p.gender,
    eventType: EVENT_TYPE.get(p.code) ?? "track",
    place: p.place,
    athlete: p.athlete,
    athleteId: p.athleteId,
    mark: p.mark,
    points: pointsForPlace(p.place),
    url: `https://www.athletic.net/TrackAndField/meet/${p.meetId}/results/${p.gender === "men" ? "m" : "f"}/${p.division}/${p.code}`,
  }));
}

async function main() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error("Missing FIRECRAWL_API_KEY — copy .env.example to .env and add your key.");
    process.exit(1);
  }

  const data = await loadExisting();
  data.team = { id: TEAM_ID, name: TEAM_NAME };
  data.season = SEASON;

  let meetIds;
  if (args.get("meet")) {
    meetIds = [String(args.get("meet"))];
  } else {
    console.log(`Discovering meets on ${TEAM_PAGE} …`);
    meetIds = await discoverMeetIds(TEAM_PAGE, { apiKey });
    console.log(`Found ${meetIds.length} meet IDs.`);
  }

  const existingById = new Map((data.meets ?? []).map((m) => [m.meetId, m]));

  for (const meetId of meetIds) {
    console.log(`\n== Meet ${meetId} ==`);
    const prev = existingById.get(meetId);
    let meta;
    try {
      meta = await fetchMeetMeta(meetId, { apiKey });
    } catch (err) {
      console.warn(`  meta failed: ${err.message}`);
      meta = prev ?? { meetId, name: `Meet ${meetId}`, date: null };
    }
    console.log(`  ${meta.name} (${meta.date ?? "date unknown"})`);

    const kind = kindFor(meetId);
    console.log(`  kind: ${kind}`);

    // Skip future meets (no results yet).
    if (meta.date && new Date(meta.date) > new Date()) {
      console.log("  future meet — skipping results scrape");
      existingById.set(meetId, { ...(prev ?? {}), ...meta, kind, results: prev?.results ?? [] });
      continue;
    }

    const results = args.get("refresh-meets-only") && prev ? prev.results : await scrapeMeet(meetId, apiKey);
    existingById.set(meetId, { ...meta, kind, results });
    data.meets = Array.from(existingById.values());
    await saveData(data);
  }

  data.meets = Array.from(existingById.values()).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  await saveData(data);
  console.log(`\nSaved ${data.meets.length} meets to ${DATA_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
