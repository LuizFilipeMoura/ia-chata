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
