import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEIGHT_PEN_MOD } from "./rules.js";

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
