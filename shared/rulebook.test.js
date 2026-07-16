import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEIGHT_PEN_MOD } from "./rules.js";
import { WEAPONS, WEAPON_UPGRADES } from "./game-state.js";

// rules.md is a RUNTIME INPUT, not documentation: server/config.js -> server/prompt.js
// bakes it verbatim into the rules bot's system prompt as "the single source of truth",
// and the bot is instructed to refuse rather than guess. Nothing tested it until now,
// and it silently drifted from the engine (the weight ladder taught the pre-halving
// values for months). These tests are the binding.
const RULEBOOK = readFileSync(new URL("../rules.md", import.meta.url), "utf8");

test("rules.md teaches the current stat vocabulary, not the pre-rename one", () => {
  const legacy = [
    [/\bSTR\b/g, "STR -> Penetration"],
    [/\bACC\b/g, "ACC -> Accuracy"],
    // Overmatch (STR past the wound clamp became Damage) was deleted with the
    // Penetration rework, which folded its job into the 3-7 band: a weapon buys
    // depth in its Damage stat, not by overshooting Toughness. rules.md was the
    // LAST surface still teaching it. glossary.test.js guards the glossary the
    // same way; this guards the rulebook, so the deletion is a binding and not
    // merely a state a doc pass can undo.
    [/\bOvermatch\b/g, "Overmatch — deleted with the penetration rework"],
  ];
  const found = [];
  for (const [re, msg] of legacy) {
    const hits = RULEBOOK.match(re);
    if (hits) found.push(`${msg} (${hits.length} occurrences)`);
  }
  assert.deepEqual(found, [], `rules.md still teaches renamed stats:\n  ${found.join("\n  ")}`);
});

test("rules.md's weight ladder matches WEIGHT_PEN_MOD", () => {
  // The engine is the truth; rules.md must quote it. §4 taught the pre-halving
  // ±2/±4 ladder long after rules.js halved it to ±1/±2, and nothing caught it
  // because nothing tested this file.
  //
  // rules.md writes the ladder in two different shapes: §4's full
  // "Light X / Medium Y" and §16's Medium-relative "Light X vs the Medium
  // baseline" — which omits Medium entirely. Matching each class/value pair on its
  // own binds BOTH wordings (and any third one written later), where a
  // whole-ladder regex would silently miss §16 and certify the file as bound while
  // half of it stayed stale.
  //
  // Heavy and Colossal stay in the pattern ON PURPOSE even though they were
  // deleted 2026-07-16: if rules.md ever teaches one again, this must fail rather
  // than not match. That is the whole point — the file spent months teaching a
  // ladder the engine did not have.
  //
  // The minus sign in rules.md is U+2212, not an ASCII hyphen; the class covers both.
  const sign = (n) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);
  const pairs = [...RULEBOOK.matchAll(/\b(Light|Medium|Heavy|Colossal)\s*([+−-]\d)\b/g)];

  // §4 contributes 2 pairs, §16 contributes 1. Fewer means a ladder was reworded
  // out from under this guard — fail loudly rather than vacuously pass.
  assert.ok(
    pairs.length >= 3,
    `expected at least the §4 and §16 weight ladders (3 class/value pairs), found ${pairs.length} — did the wording change?`,
  );
  for (const [text, cls, value] of pairs) {
    const key = cls.toLowerCase();
    assert.ok(
      key in WEIGHT_PEN_MOD,
      `rules.md "${text}" teaches a weight class the engine does not have. `
      + `WEIGHT_PEN_MOD carries ${Object.keys(WEIGHT_PEN_MOD).join("/")}.`,
    );
    const expected = sign(WEIGHT_PEN_MOD[key]);
    assert.equal(value, expected, `rules.md "${text}" disagrees with WEIGHT_PEN_MOD.${key} (${expected})`);
  }
});

// §13's upgrade table names each weapon's Field/Tuned/Prototype upgrades in order;
// the order guard below binds those NAMES to WEAPON_UPGRADES. (The value-diff guards
// that pinned §12's stat numbers and §13's parentheticals to the catalog were
// removed: the user tunes those constantly and they red on every balance pass.)
//
// This parses EVERY table in rules.md, not just §13's, so a weapon's row is found
// by name across the whole file. That is safe only because §17's unit-weapon table
// names its entries differently ("Autocannon Mount", not "Autocannon").
const rulebookRows = (() => {
  const rows = new Map();
  for (const line of RULEBOOK.split(/\r?\n/)) {
    if (!line.startsWith("| ")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    if (!rows.has(cells[0])) rows.set(cells[0], []);
    rows.get(cells[0]).push(cells);
  }
  return rows;
})();
// A weapon names a row in BOTH tables, so classify by shape rather than by key:
// a §12 stat row's second cell is ROF (digits), a §13 upgrade row's is prose.
const upgradeRow = (name) => (rulebookRows.get(name) || []).find((c) => !/^\d+$/.test(c[1]));

test("rules.md §13 names WEAPON_UPGRADES' upgrades in Field/Tuned/Prototype order", () => {
  assert.ok(Object.keys(WEAPON_UPGRADES).length > 0, "WEAPON_UPGRADES is empty — did the shape change?");
  for (const [name, list] of Object.entries(WEAPON_UPGRADES)) {
    const row = upgradeRow(name);
    assert.ok(row, `rules.md §13 has no upgrade row for "${name}"`);
    list.forEach((u, i) => {
      assert.ok(
        (row[i + 1] || "").startsWith(u.name),
        `rules.md §13 "${name}" ${u.nature} cell is "${row[i + 1]}", WEAPON_UPGRADES calls it "${u.name}"`,
      );
    });
  }
});
