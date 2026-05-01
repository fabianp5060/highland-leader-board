#!/usr/bin/env node
// Minimal self-check for parser.js — no test runner required.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { parseEventPage, topEight } from "../src/parser.js";
import { pointsForPlace } from "../src/events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const md = await readFile(resolve(__dirname, "fixtures/thunder-invite-f-hj.md"), "utf8");

const all = parseEventPage(md, { teamId: "13877", teamName: "Highland" });
console.log("All Highland entries:", all);
assert.equal(all.length, 3, "should find 3 Highland entries (places 1, 21, 27)");
assert.equal(all[0].athlete, "Janie Brower");
assert.equal(all[0].place, 1);
assert.equal(all[0].mark, "5-02.00");

const top = topEight(all);
assert.equal(top.length, 1, "only Janie Brower is in the top 8");
assert.equal(top[0].place, 1);

assert.equal(pointsForPlace(1), 10);
assert.equal(pointsForPlace(8), 1);
assert.equal(pointsForPlace(9), 0);
assert.equal(pointsForPlace(0), 0);

// --- Relay parsing: pulled from a real per-event Firecrawl response. ---
const relayMd = await readFile(resolve(__dirname, "fixtures/true-grit-m-4x100m.md"), "utf8");
const relayEntries = parseEventPage(relayMd, { teamId: "13877", teamName: "Highland" });
const highlandRelays = relayEntries.filter((e) => e.kind === "relay");
assert.equal(highlandRelays.length, 1, "Highland fielded one relay (Highland - A) at this meet");

const relayA = highlandRelays[0];
assert.equal(relayA.place, 1);
assert.equal(relayA.athlete, "Highland - A", "preserves the relay-letter designator");
assert.equal(relayA.mark, "41.91a", "extracts plain-text time when no /result/ link");
assert.equal(relayA.athletes?.length, 4, "captures all four legs");
assert.deepEqual(
  relayA.athletes.map((a) => a.athleteId),
  ["22045629", "23594346", "24508475", "24508470"],
);
assert.equal(relayA.athletes[0].name, "Brody Heussner");
assert.equal(relayA.athletes[3].name, "Maxwell Max Menden");

// Each leg of a 1st-place relay gets the full 10-point credit.
const credits = topEight(relayEntries)
  .filter((e) => e.kind === "relay")
  .flatMap((e) => (e.athletes ?? []).map(() => pointsForPlace(e.place)));
assert.equal(credits.reduce((s, x) => s + x, 0), 40, "4 legs × 10 pts = 40 credited");

console.log("✓ parse.test.js passed");
