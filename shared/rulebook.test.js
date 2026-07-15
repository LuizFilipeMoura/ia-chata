import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
