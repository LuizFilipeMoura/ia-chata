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

// §12's stat tables and §13's upgrade table are hand-copied duplicates of
// WEAPONS / WEAPON_UPGRADES — which makes every cell an unverifiable claim about
// the engine, and they drifted like one: the Penetration rework moved ten weapons
// across four commits and §12 kept teaching the pre-rework numbers the whole time
// (Siege Maul "Penetration 11 / Damage 5" against an engine reading 7/6). The
// weight-ladder guard above could not see it. These tests derive the expected
// cells from the engine so that the copy cannot silently lie about a magnitude.
//
// What they cover, precisely: every §12 stat cell, and in §13 the upgrade NAMES
// plus every parenthetical the engine can derive a magnitude for. §13 cells whose
// effect is prose-only are named-checked but NOT magnitude-checked — see
// `upgradeClaim` for the explicit list and why.
//
// NOTE THE CONVENTION: the tables teach BASE stats, not the stats a legal rig
// actually fights with. `normalizeWeaponUpgrade` gives a null-upgrade weapon its
// FIRST (Field) upgrade, so every fielded weapon reads base + Field — a Siege Maul
// fights at Damage 7, not the 6 printed in §12. §12 prints the base and §13 prints
// the Field modifier separately; that is why §12 lists the Rivet Gun at ROF 6 while
// its Field upgrade is "+2 ROF". Do not "fix" §12 to the fielded value.
const rulebookRows = () => {
  const rows = new Map();
  for (const line of RULEBOOK.split(/\r?\n/)) {
    if (!line.startsWith("| ")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    if (!rows.has(cells[0])) rows.set(cells[0], []);
    rows.get(cells[0]).push(cells);
  }
  return rows;
};
// A weapon names a row in BOTH tables, so classify by shape rather than by key:
// a §12 stat row's second cell is ROF (digits), a §13 upgrade row's is prose.
const statRow = (rows, name) => (rows.get(name) || []).find((c) => /^\d+$/.test(c[1]));
const upgradeRow = (rows, name) => (rows.get(name) || []).find((c) => !/^\d+$/.test(c[1]));
// rules.md writes U+2212 for minus and quotes inches; the engine stores plain numbers.
const cellNum = (s) => Number(String(s).replace(/−/g, "-").replace(/"/g, ""));

test("rules.md §12 teaches WEAPONS' base long-range stats", () => {
  const rows = rulebookRows();
  assert.ok(Object.keys(WEAPONS.longRange).length > 0, "WEAPONS.longRange is empty — did the shape change?");
  for (const [name, w] of Object.entries(WEAPONS.longRange)) {
    const c = statRow(rows, name);
    assert.ok(c, `rules.md §12 has no stat row for "${name}"`);
    const got = {
      rof: cellNum(c[1]), pen: cellNum(c[2]), dmg: cellNum(c[3]),
      sweet: cellNum(c[4]), peak: cellNum(c[5]), dropoff: Math.abs(cellNum(c[6])),
    };
    for (const [field, value] of Object.entries(got)) {
      assert.equal(value, w[field], `rules.md §12 "${name}" ${field}=${value}, WEAPONS says ${w[field]}`);
    }
    const [lo, hi] = c[7].replace(/"/g, "").split(/[–-]/).map(Number);
    assert.equal(lo, w.minRange, `rules.md §12 "${name}" min range`);
    assert.equal(hi, w.maxRange, `rules.md §12 "${name}" max range`);
  }
});

test("rules.md §12 teaches WEAPONS' base melee stats", () => {
  const rows = rulebookRows();
  assert.ok(Object.keys(WEAPONS.melee).length > 0, "WEAPONS.melee is empty — did the shape change?");
  for (const [name, w] of Object.entries(WEAPONS.melee)) {
    const c = statRow(rows, name);
    assert.ok(c, `rules.md §12 has no stat row for "${name}"`);
    for (const [field, value] of Object.entries({ rof: cellNum(c[1]), pen: cellNum(c[2]), dmg: cellNum(c[3]) })) {
      assert.equal(value, w[field], `rules.md §12 "${name}" ${field}=${value}, WEAPONS says ${w[field]}`);
    }
    // §12 prints a bare en-dash for Accuracy 0.
    assert.equal(c[4] === "–" ? 0 : cellNum(c[4]), w.accuracy[0], `rules.md §12 "${name}" Acc`);
    assert.equal(cellNum(c[5]), w.rng[0], `rules.md §12 "${name}" RNG`);
  }
});

// The magnitude an upgrade's §13 parenthetical must state, derived from its
// `effect`. Returns null for an upgrade whose effect the engine stores as a
// behaviour flag rather than a number or a perk (`coldBore: true`,
// `onDamage: "sunder"`, `vsDamaged: { rof: 1 }`, …): there is no magnitude in the
// data to compare the prose against, so those cells are name-checked only. That
// exclusion is deliberate and narrow — every cell this rework touched
// (Depleted Core, Reinforced Head, Haymaker, Fluked Head, Honed Talons) is a
// top-level pen/dmg/perks effect and IS covered. `derivableUpgradeCells` below
// pins the count so this cannot quietly decay back into a names-only check.
const upgradeClaim = (u) => {
  const e = u.effect || {};
  if (typeof e.pen === "number") return `+${e.pen} Penetration`;
  if (typeof e.dmg === "number") return `+${e.dmg} Damage`;
  if (typeof e.rof === "number") return `+${e.rof} ROF`;
  if (typeof e.range === "number") return `+${e.range}" reach`;
  if (Array.isArray(e.perks) && e.perks.length === 1) return e.perks[0];
  return null;
};
// Recomputed from the engine, not hardcoded: 8 numeric + 14 single-perk effects.
const derivableUpgradeCells = Object.values(WEAPON_UPGRADES)
  .flat()
  .filter((u) => upgradeClaim(u) !== null).length;

test("rules.md §13's parentheticals state WEAPON_UPGRADES' actual magnitudes", () => {
  const rows = rulebookRows();
  let checked = 0;
  for (const [name, list] of Object.entries(WEAPON_UPGRADES)) {
    const row = upgradeRow(rows, name);
    assert.ok(row, `rules.md §13 has no upgrade row for "${name}"`);
    list.forEach((u, i) => {
      const claim = upgradeClaim(u);
      if (claim === null) return; // prose-only effect — see upgradeClaim
      const cell = row[i + 1] || "";
      checked++;
      assert.ok(
        cell.includes(claim),
        `rules.md §13 "${name}" ${u.nature} cell is "${cell}", but WEAPON_UPGRADES' `
        + `${u.name} effect (${JSON.stringify(u.effect)}) means it must state "${claim}"`,
      );
    });
  }
  // The bug this guard exists to catch is a wrong NUMBER in a cell whose name is
  // right ("Depleted Core (+2 Penetration)" — the literal pre-rework value). If a
  // refactor ever drops these assertions, fail loudly rather than pass vacuously.
  assert.equal(
    checked, derivableUpgradeCells,
    `expected ${derivableUpgradeCells} magnitude-bearing §13 cells, checked ${checked}`,
  );
  assert.ok(checked >= 20, `only ${checked} §13 cells carry a derivable magnitude — has the effect shape changed?`);
});

test("rules.md §13 names WEAPON_UPGRADES' upgrades in Field/Tuned/Prototype order", () => {
  const rows = rulebookRows();
  assert.ok(Object.keys(WEAPON_UPGRADES).length > 0, "WEAPON_UPGRADES is empty — did the shape change?");
  for (const [name, list] of Object.entries(WEAPON_UPGRADES)) {
    const row = upgradeRow(rows, name);
    assert.ok(row, `rules.md §13 has no upgrade row for "${name}"`);
    list.forEach((u, i) => {
      assert.ok(
        (row[i + 1] || "").startsWith(u.name),
        `rules.md §13 "${name}" ${u.nature} cell is "${row[i + 1]}", WEAPON_UPGRADES calls it "${u.name}"`,
      );
    });
  }
});
