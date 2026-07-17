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

const EQCELL = { chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
  weaponA: "Autocannon", upgradeA: "depleted-core",
  equipmentA: "ablative-plating", equipmentUpgradeA: "reinforced-plating",
  distance: 12, arc: "side" };

test("runDuel stamps an equipment module + tier onto A1 and runs", () => {
  const r = runDuel({ ...EQCELL, seed: 2, intensity: "conservative" });
  assert.ok(r.rounds > 1, "equipment cell should play out multiple rounds");
});

test("a null equipment upgrade id throws (field-is-the-floor trap)", () => {
  assert.throws(
    () => runDuel({ ...EQCELL, equipmentUpgradeA: null, seed: 2 }),
    /equipmentUpgradeA/,
  );
});

const OVERDRIVE = { chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
  weaponA: "Autocannon", upgradeA: "depleted-core",
  equipmentA: "overclock-core", equipmentUpgradeA: "reactor-overdrive",
  distance: 12, arc: "side" };

test("reactor-overdrive hook makes A1 issue the overclock active", () => {
  const seen = [];
  runDuel({ ...OVERDRIVE, seed: 6, intensity: "ceiling",
    onCommand: (name, attrs) => { if (name === "A1") seen.push(attrs.action); } });
  assert.ok(seen.includes("overclock"), "reactor-overdrive must pilot the overclock active at ceiling");
});

test("conservative fires a subset of ceiling for every hook", () => {
  // Probe each hook against a spread of synthetic states. A conservative YES with
  // a ceiling NO is a contradiction — the hook is misdocumented. We assert the
  // IMPLICATION (conservative => ceiling), never a magnitude.
  //
  // The room is deliberately turn-less: hooks that need a live turn to judge
  // legality (per the contract) must DECLINE (return null) rather than throw, so
  // this probe is a smoke-level guard for those — it fully exercises pure-state
  // hooks (e.g. enfilade) and vacuously holds for legality-gated ones. The real
  // per-hook duel tests prove those actually fire.
  const room = { game: { turn: null, round: 1 } };
  const enemy = { name: "E1", id: 2 };
  const geo = { intensity: "x", distance: 12, arc: "side" };
  const states = [
    { name: "A1", id: 1, weightClass: "medium", engine: { heat: 0 },
      equipState: {}, reactorOverdriveActive: false, weapons: { longRange: "Sniper Cannon" } },
    { name: "A1", id: 1, weightClass: "medium", engine: { heat: 99 },
      equipState: {}, reactorOverdriveActive: false, weapons: { longRange: "Sniper Cannon" } },
  ];
  for (const [id, h] of Object.entries(PILOTING_HOOKS)) {
    for (const rig of states) {
      const c = h.conservative(room, rig, enemy, geo);
      const k = h.ceiling(room, rig, enemy, geo);
      if (c) assert.ok(k, `${id}: conservative fired but ceiling did not`);
    }
  }
});
