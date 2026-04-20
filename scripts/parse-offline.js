#!/usr/bin/env node
// Parse a saved /results/all markdown file (from a Firecrawl MCP response) into a
// single meet's entry in data/results.json. Useful for pre-populating data without
// a Firecrawl API key.
// Usage: node scripts/parse-offline.js <saved.json> <meetId> "<Meet Name>" <YYYY-MM-DD>
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EVENTS, pointsForPlace } from "../src/events.js";
import { parseMeetPage, topEight } from "../src/parser.js";
import { kindFor } from "../src/meet-kinds.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_FILE = resolve(ROOT, "results.json");

const EVENT_TYPE = new Map(EVENTS.map((e) => [e.code, e.type]));
const EVENT_LABEL = new Map(EVENTS.map((e) => [e.code, e.label]));

const [, , savedPath, meetId, meetName, meetDate] = process.argv;
if (!savedPath || !meetId || !meetName) {
  console.error("usage: node scripts/parse-offline.js <saved.json> <meetId> <name> [date]");
  process.exit(1);
}

const raw = await readFile(savedPath, "utf8");
const md = JSON.parse(raw).markdown;
const TEAM_ID = process.env.TEAM_ID || "13877";
const TEAM_NAME = process.env.TEAM_NAME || "Highland";

const entries = topEight(parseMeetPage(md, { teamId: TEAM_ID, teamName: TEAM_NAME }));
const results = entries.map((p) => ({
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

const data = existsSync(DATA_FILE)
  ? JSON.parse(await readFile(DATA_FILE, "utf8"))
  : { team: { id: TEAM_ID, name: TEAM_NAME }, season: process.env.SEASON || "2026", meets: [] };

data.meets = (data.meets || []).filter((m) => m.meetId !== meetId);
data.meets.push({ meetId, name: meetName, date: meetDate || null, kind: kindFor(meetId), results });
data.meets.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
data.updatedAt = new Date().toISOString();

await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
console.log(`Wrote ${results.length} top-8 results for ${meetName} (${meetId}).`);
