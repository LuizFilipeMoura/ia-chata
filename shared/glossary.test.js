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

test("glossary defines the three Answer counters", () => {
  const byId = new Map(GLOSSARY.map((e) => [e.id, e]));
  for (const id of ["riposte", "sidestep", "exploit"]) {
    const entry = byId.get(id);
    assert.ok(entry, `missing glossary entry: ${id}`);
    assert.ok(entry.def.length > 0);
  }
});
