import { test } from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY } from "./glossary.js";

const ids = new Set(GLOSSARY.map((e) => e.id));

// Every id a terminal token points at must resolve to an entry.
const REQUIRED = [
  // runtime states
  "immobilised", "pinned", "emplaced", "barrage", "engaged", "burning",
  "no-cooling", "speed-halved", "skip-activation", "momentum", "missiles-locked",
  "action-penalty", "no-prepare", "anchored", "no-actives", "arc-locked",
  "arms-suppressed", "belt-cycling", "cracked", "riveted", "no-repair",
  "reaction-set", "braced", "evasive", "return-fire", "weapon-lost",
  "ranged-unloaded", "painted",
  // status
  "destroyed", "heavy-damage", "damaged", "nominal",
  // non-rig parts
  "tracks", "turret", "mount",
  // modules
  "module-damage", "module-repair", "module-coolant", "module-recon",
];

test("glossary defines every terminal-token id", () => {
  for (const id of REQUIRED) assert.ok(ids.has(id), `missing glossary id: ${id}`);
});

test("glossary ids are unique", () => {
  assert.equal(ids.size, GLOSSARY.length);
});

test("every entry has a non-empty def", () => {
  for (const e of GLOSSARY) assert.ok(e.def && e.def.length > 0, `empty def: ${e.id}`);
});

test("the glossary teaches the wound roll, not the deleted impact table", () => {
  const entry = GLOSSARY.find((g) => g.id === "wound-roll");
  assert.ok(entry, "wound-roll entry must exist");
  assert.match(entry.def, /d10/i);
  assert.ok(!GLOSSARY.some((g) => g.id === "impact-roll"), "impact-roll must be gone");
  // No entry anywhere may still teach the deleted vocabulary.
  for (const g of GLOSSARY) {
    assert.ok(!/impact table|severity tier/i.test(g.def), `stale: ${g.id}`);
  }
});

// Same idiom as the impact-table guard above, for the rule deleted by the
// penetration rework. The scan matters more than the id assert: rules.md still
// has to be stripped of Overmatch, and a doc pass is exactly how deleted
// vocabulary leaks back into a def.
test("the glossary does not teach Overmatch, deleted with the penetration rework", () => {
  assert.ok(!GLOSSARY.some((g) => g.id === "overmatch"), "overmatch entry must be gone");
  for (const g of GLOSSARY) {
    for (const field of [g.term, g.def, ...(g.match || [])]) {
      assert.ok(!/overmatch/i.test(field), `stale Overmatch vocabulary in: ${g.id}`);
    }
  }
});

// Both rails of the wound clamp are player-facing rules, and the entry that used
// to teach the floor half ("Penetration past Toughness + 4 is wasted") was the
// deleted `overmatch` one. Deleting a correction while leaving the claim it
// corrected is a regression, so the floor half lives here now — see rules.js's
// woundTarget, which attributes each rail to its own job.
test("the glossary teaches both rails of the wound roll, not just the ceiling", () => {
  const def = GLOSSARY.find((g) => g.id === "wound-roll").def;
  assert.match(def, /natural 10 always wounds/i);  // ceiling: nothing is immune
  assert.match(def, /natural 1 never/i);           // floor: nothing is automatic
  assert.match(def, /2\+/);                        // floor: where the TN bottoms out
  assert.match(def, /wasted/i);                    // floor: and what that costs

  // The counterpart claim on Penetration must carry the same qualifier. Unqualified,
  // "each point makes wounding 10% likelier" is false exactly where this plan bites:
  // woundTarget(8, 4) and woundTarget(12, 4) are both TN 2, so those 4 points buy 0%.
  assert.match(GLOSSARY.find((g) => g.id === "penetration").def, /bottoms out|wasted/i);
});

// The wound roll reads `6 + T - Penetration`. A player who can't look up Toughness or
// Damage only half-learns the model, so both stats need their own entry.
test("glossary defines the stats the wound roll references", () => {
  const byId = new Map(GLOSSARY.map((e) => [e.id, e]));
  for (const id of ["toughness", "damage"]) {
    assert.ok(byId.get(id), `missing glossary entry: ${id}`);
  }
});

test("glossary defines the three Answer counters", () => {
  const byId = new Map(GLOSSARY.map((e) => [e.id, e]));
  for (const id of ["riposte", "sidestep", "exploit"]) {
    const entry = byId.get(id);
    assert.ok(entry, `missing glossary entry: ${id}`);
    assert.ok(entry.def.length > 0);
  }
});
