// scripts/balance/piloting.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pilotFor, PILOTING_HOOKS, PILOTING_BIASES } from "./piloting.mjs";
import { runDuel } from "./duel-sim.mjs";
import { makeRig } from "../../shared/game-state.js";

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

const LOCK = { chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
  weaponA: "Missile Barrage", upgradeA: "fire-control-lock", distance: 20, arc: "side" };

test("fire-control-lock hook makes A1 lock before firing", () => {
  const seen = [];
  runDuel({ ...LOCK, seed: 5, intensity: "ceiling",
    onCommand: (name, attrs) => { if (name === "A1") seen.push(attrs.action); } });
  assert.ok(seen.includes("lock"), "fire-control-lock must pilot the lock action at ceiling");
  assert.ok(seen.includes("fire"), "fire-control-lock should still let Fire consume the paint");
});

// Emplacement is a MELEE weapon upgrade (Bulwark Shield prototype). duel-sim's
// public axes only reach A1's LONG-RANGE weapon upgrade or its equipment module
// (runDuel has no `meleeUpgradeA` parameter, and duel-sim.mjs is out of scope to
// extend for this task) — so this is a direct hook-level check against a real
// rig (built with the actual makeRig, not a hand-rolled shape) instead of a
// full runDuel + onCommand round trip.
function makeEmplaceRig(overrides = {}) {
  const rig = makeRig(1, "A1", "medium", "a", { longRange: "Autocannon", melee: "Bulwark Shield" });
  rig.weaponUpgrades.melee = "emplacement";
  return Object.assign(rig, overrides);
}
const EMPLACE_ENEMY = { name: "B1", id: 2 };

test("emplacement hook makes A1 emplace when legal", () => {
  const rig = makeEmplaceRig();
  const room = { game: { turn: { actionsUsed: 0, actionsMax: 3 }, round: 1 } };
  const cmd = pilotFor("emplacement", "ceiling")(room, rig, EMPLACE_ENEMY, { distance: 2, arc: "side" });
  assert.equal(cmd?.attrs?.action, "emplace", "emplacement must pilot the emplace action at ceiling when legal");
});

test("emplacement hook falls through once already emplaced", () => {
  const rig = makeEmplaceRig({ emplaced: true });
  const room = { game: { turn: { actionsUsed: 0, actionsMax: 2 }, round: 1 } };
  const cmd = pilotFor("emplacement", "ceiling")(room, rig, EMPLACE_ENEMY, { distance: 2, arc: "side" });
  assert.equal(cmd, null, "already emplaced — hook should fall through to greedySafe's Fire");
});

test("emplacement hook (conservative) declines to root when it would forfeit this activation's shot", () => {
  const rig = makeEmplaceRig();
  const room = { game: { turn: { actionsUsed: 2, actionsMax: 3 }, round: 1 } }; // 1 action left
  const conservative = pilotFor("emplacement", "conservative")(room, rig, EMPLACE_ENEMY, { distance: 2, arc: "side" });
  const ceiling = pilotFor("emplacement", "ceiling")(room, rig, EMPLACE_ENEMY, { distance: 2, arc: "side" });
  assert.equal(conservative, null, "conservative shouldn't spend the last action rooting instead of firing");
  assert.equal(ceiling?.attrs?.action, "emplace", "ceiling roots regardless of the leftover budget");
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
