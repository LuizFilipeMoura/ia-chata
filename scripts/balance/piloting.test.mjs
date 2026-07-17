// scripts/balance/piloting.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pilotFor, PILOTING_HOOKS, PILOTING_BIASES } from "./piloting.mjs";
import { runDuel } from "./duel-sim.mjs";

test("pilotFor returns a no-op hook for an unregistered upgrade", () => {
  const hook = pilotFor("no-such-upgrade");
  assert.equal(typeof hook, "function");
  assert.equal(hook({}, {}, {}, { intensity: "ceiling" }), null);
});

test("every registered hook exposes both intensities as functions", () => {
  for (const [id, h] of Object.entries(PILOTING_HOOKS)) {
    assert.equal(typeof h.ceiling, "function", `${id}.ceiling`);
    assert.equal(typeof h.conservative, "function", `${id}.conservative`);
  }
});

test("PILOTING_BIASES documents exactly the registered hooks", () => {
  for (const id of Object.keys(PILOTING_HOOKS)) {
    assert.ok(PILOTING_BIASES.includes(id), `PILOTING_BIASES missing a line for ${id}`);
  }
});

const WCELL = { chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
  weaponA: "Autocannon", upgradeA: "depleted-core", distance: 12, arc: "side" };

test("runDuel accepts an intensity and stays deterministic per (seed, intensity)", () => {
  assert.deepEqual(
    runDuel({ ...WCELL, seed: 7, intensity: "ceiling" }),
    runDuel({ ...WCELL, seed: 7, intensity: "ceiling" }),
  );
});

test("a passive upgrade is unaffected by intensity (no hook = no drift)", () => {
  // depleted-core is a passive tier with no hook, so both intensities must
  // produce the identical duel. Calibration guard: the hook layer changes ONLY
  // piloted upgrades.
  assert.deepEqual(
    runDuel({ ...WCELL, seed: 11, intensity: "conservative" }),
    runDuel({ ...WCELL, seed: 11, intensity: "ceiling" }),
  );
});

test("runDuel reports the actions A1 issued via onCommand", () => {
  const seen = [];
  runDuel({ ...WCELL, seed: 3, intensity: "ceiling",
    onCommand: (rigName, attrs) => { if (rigName === "A1") seen.push(attrs.action); } });
  assert.ok(seen.includes("fire"), "A1 should fire at least once");
});

const SNIPER = { chassisA: "medium-sniper-chainsaw", chassisB: "medium-lance-mortar",
  weaponA: "Sniper Cannon", upgradeA: "enfilade", distance: 20, arc: "side" };

test("enfilade hook makes A1 take Aimed shots (was a structural 0.00)", () => {
  const seen = [];
  runDuel({ ...SNIPER, seed: 4, intensity: "ceiling",
    onCommand: (name, attrs) => { if (name === "A1") seen.push(attrs.action); } });
  assert.ok(seen.includes("aimed"), "enfilade must pilot Aimed shots at ceiling");
});
