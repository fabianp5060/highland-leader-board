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

console.log("✓ parse.test.js passed");
