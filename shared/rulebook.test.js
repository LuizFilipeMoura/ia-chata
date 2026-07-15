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

// §12's stat tables and §13's upgrade table are hand-copied duplicates of
// WEAPONS / WEAPON_UPGRADES — which makes every cell an unverifiable claim about
// the engine, and they drifted like one: the Penetration rework moved ten weapons
// across four commits and §12 kept teaching the pre-rework numbers the whole time
// (Siege Maul "Penetration 11 / Damage 5" against an engine reading 7/6). The
// weight-ladder guard above could not see it. These tests derive the expected
// cells from the engine so that the copy cannot silently lie about a magnitude.
//
// What they cover, precisely: every §12 stat cell, and in §13 the upgrade NAMES
// plus every parenthetical the engine can derive an effect for (23 of the 66
// cells — 8 numeric, 15 single-perk). §13 cells whose effect is prose-only are
// name-checked but NOT effect-checked — see `upgradeClaims` for why.
//
// NOTE THE CONVENTION: the tables teach BASE stats, not the stats a legal rig
// actually fights with. `normalizeWeaponUpgrade` gives a null-upgrade weapon its
// FIRST (Field) upgrade, so every fielded weapon reads base + Field — a Siege Maul
// fights at Damage 7, not the 6 printed in §12. §12 prints the base and §13 prints
// the Field modifier separately; that is why §12 lists the Rivet Gun at ROF 6 while
// its Field upgrade is "+2 ROF". Do not "fix" §12 to the fielded value.
//
// This parses EVERY table in rules.md, not just §12/§13's, so a weapon's row is
// found by name across the whole file. That is safe only because §17's unit-weapon
// table names its entries differently ("Autocannon Mount", not "Autocannon") — and
// §17 is known-stale, so a collision would bind a §12 test to a wrong number.
// If §17 is ever repaired or renamed, scope this to the §12/§13 headings first.
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
const statRow = (name) => (rulebookRows.get(name) || []).find((c) => /^\d+$/.test(c[1]));
const upgradeRow = (name) => (rulebookRows.get(name) || []).find((c) => !/^\d+$/.test(c[1]));
// rules.md writes U+2212 for minus and quotes inches; the engine stores plain numbers.
const cellNum = (s) => Number(String(s).replace(/−/g, "-").replace(/"/g, ""));

test("rules.md §12's weight-ladder example quotes the Sniper Cannon's real Penetration", () => {
  // A bare stat wearing a sentence. The §12 table guard reads table rows and the
  // weight-ladder guard matches signed values, so NEITHER sees this prose — which
  // is exactly why it sat teaching "Penetration 10" against an engine reading 6
  // for the whole rework. Fixing the instance without binding it just resets the
  // clock, so bind it: to WEAPONS for the base and to WEIGHT_PEN_MOD for the rung.
  const pen = WEAPONS.longRange["Sniper Cannon"].pen;
  const m = RULEBOOK.match(
    /a Sniper Cannon \(Penetration (\d+)\) reads Penetration (\d+) on a Light Rig and (\d+) on a Medium/,
  );
  assert.ok(m, "§12's Sniper Cannon weight-ladder example is missing or reworded — rebind this guard to the new wording");
  assert.equal(Number(m[1]), pen, "§12's example quotes a Sniper Cannon Penetration that WEAPONS does not have");
  assert.equal(Number(m[2]), pen + WEIGHT_PEN_MOD.light, "§12's example miscomputes the Light rung");
  assert.equal(Number(m[3]), pen + WEIGHT_PEN_MOD.medium, "§12's example miscomputes the Medium rung");
});

test("rules.md §12 teaches WEAPONS' base long-range stats", () => {
  assert.ok(Object.keys(WEAPONS.longRange).length > 0, "WEAPONS.longRange is empty — did the shape change?");
  for (const [name, w] of Object.entries(WEAPONS.longRange)) {
    const c = statRow(name);
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
  assert.ok(Object.keys(WEAPONS.melee).length > 0, "WEAPONS.melee is empty — did the shape change?");
  for (const [name, w] of Object.entries(WEAPONS.melee)) {
    const c = statRow(name);
    assert.ok(c, `rules.md §12 has no stat row for "${name}"`);
    for (const [field, value] of Object.entries({ rof: cellNum(c[1]), pen: cellNum(c[2]), dmg: cellNum(c[3]) })) {
      assert.equal(value, w[field], `rules.md §12 "${name}" ${field}=${value}, WEAPONS says ${w[field]}`);
    }
    // §12 prints a bare en-dash for Accuracy 0.
    assert.equal(c[4] === "–" ? 0 : cellNum(c[4]), w.accuracy[0], `rules.md §12 "${name}" Acc`);
    assert.equal(cellNum(c[5]), w.rng[0], `rules.md §12 "${name}" RNG`);
  }
});

// Every claim an upgrade's §13 parenthetical must state, derived from its
// `effect`. Returns [] for an upgrade whose effect the engine stores as a
// behaviour flag rather than a number or a perk (`coldBore: true`,
// `onDamage: "sunder"`, `vsDamaged: { rof: 1 }`, …): there is nothing in the data
// to compare the prose against, so those cells are name-checked only (by the test
// below this one). That exclusion is deliberate and narrow — every cell the
// Penetration rework touched (Depleted Core, Reinforced Head, Haymaker, Fluked
// Head, Honed Talons) is a top-level pen/dmg/perks effect and IS covered.
//
// Returns an ARRAY, not the first match: an upgrade granting both `pen` and `dmg`
// would otherwise be silently half-checked. No such upgrade exists today, so this
// is latent rather than live — but it costs nothing to stay correct if one lands.
const upgradeClaims = (u) => {
  const e = u.effect || {};
  const claims = [];
  if (typeof e.pen === "number") claims.push({ kind: "pen", text: `+${e.pen} Penetration` });
  if (typeof e.dmg === "number") claims.push({ kind: "dmg", text: `+${e.dmg} Damage` });
  if (typeof e.rof === "number") claims.push({ kind: "rof", text: `+${e.rof} ROF` });
  if (typeof e.range === "number") claims.push({ kind: "range", text: `+${e.range}" reach` });
  if (Array.isArray(e.perks) && e.perks.length === 1) claims.push({ kind: "perk", text: e.perks[0] });
  return claims;
};
// The kinds above, each of which must still match real data — see the coverage
// assertion at the end of the test below.
const CLAIM_KINDS = ["pen", "dmg", "rof", "range", "perk"];

test("rules.md §13's parentheticals state WEAPON_UPGRADES' actual effects", () => {
  const seen = new Set();
  for (const [name, list] of Object.entries(WEAPON_UPGRADES)) {
    const row = upgradeRow(name);
    assert.ok(row, `rules.md §13 has no upgrade row for "${name}"`);
    list.forEach((u, i) => {
      const claims = upgradeClaims(u);
      if (claims.length === 0) return; // prose-only effect — see upgradeClaims
      const cell = row[i + 1] || "";
      for (const claim of claims) {
        seen.add(claim.kind);
        assert.ok(
          cell.includes(claim.text),
          `rules.md §13 "${name}" ${u.nature} cell is "${cell}", but WEAPON_UPGRADES' `
          + `${u.name} effect (${JSON.stringify(u.effect)}) means it must state "${claim.text}"`,
        );
      }
    });
  }
  // Coverage is asserted per KIND, not as a total count, and that shape is chosen
  // against two failures this guard has already had:
  //
  //   - `assert.equal(checked, <count derived with the same predicate>)` is a
  //     TAUTOLOGY — same multiset, same pure predicate, equal by construction. It
  //     cannot fail, so it licenses nothing.
  //   - a total floor is too coarse to catch what it claims to. Only 2 upgrades
  //     carry `effect.pen`, so renaming that key in the engine drops coverage
  //     23 -> 21 and a floor of 20 stays green while Penetration goes unchecked
  //     entirely. (Verified: it does.)
  //
  // Per-kind is the honest unit: if any branch of `upgradeClaims` stops matching
  // real data, its kind vanishes and this fires. Adding an upgrade never fires it.
  // Removing one fires only if it was the LAST of its kind — today `range` has a
  // single source (Lance's Couched Reach), so retiring that upgrade would trip
  // this. That is the correct signal rather than churn: the branch is then dead
  // and should be dropped from CLAIM_KINDS, not worked around.
  //
  // What it CANNOT do is notice the assertion above being deleted; `seen` would
  // still fill. No test guards its own assertions. That is what review is for.
  assert.deepEqual(
    CLAIM_KINDS.filter((k) => !seen.has(k)), [],
    "a claim kind matched no upgrade — `upgradeClaims` has drifted from WEAPON_UPGRADES' effect shape, "
    + "so those cells are silently unchecked",
  );
});

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
