import { test } from "node:test";
import assert from "node:assert/strict";
import { availableActions, actionBudget, rigModifiers, phaseSummary, outcomeText } from "./battle-view.js";
import { makeRig, makeUnit } from "./game-state.js";

function rig(over = {}) {
  return {
    id: 1, name: "Vela", weightClass: "light", owner: "a",
    hull: { sp: 6, max: 6 }, arms: { sp: 5, max: 5 }, legs: { sp: 5, max: 5 },
    engine: { sp: 4, max: 4, heat: 0 },
    weapons: { longRange: "Autocannon", melee: "Sword" },
    loaded: { longRange: true, melee: true },
    activated: false, skipNextActivation: false, noCool: false,
    speedHalvedNextRound: false, immobilised: false, weaponsDestroyed: [], preparation: null,
    ...over,
  };
}

test("availableActions lists actions and marks the ones the budget allows", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const acts = availableActions(rig(), turn);
  const move = acts.find((a) => a.key === "move");
  assert.equal(move.heat, 1);
  assert.equal(move.enabled, true);
  assert.equal(acts.find((a) => a.key === "shutdown").enabled, true);
  // Shutdown is available at any point in the activation now (cooling scales
  // with how many slots were already spent).
  const mid = availableActions(rig(), { activeRigId: 1, actionsUsed: 2, actionsMax: 5 });
  assert.equal(mid.find((a) => a.key === "shutdown").enabled, true);
  assert.ok(!acts.some((a) => a.key === "ram"), "ram removed from the console");
});

test("availableActions disables everything at the budget cap", () => {
  const capped = availableActions(rig(), { activeRigId: 1, actionsUsed: 5, actionsMax: 5 });
  assert.equal(capped.find((a) => a.key === "move").enabled, false);
  assert.equal(capped.find((a) => a.key === "reload").enabled, false);
});

test("reload is disabled until a ranged weapon has actually been fired", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const loaded = availableActions(rig(), turn).find((a) => a.key === "reload");
  assert.equal(loaded.enabled, false); // nothing to reload yet
  const spent = availableActions(rig({ loaded: { longRange: false, melee: true } }), turn)
    .find((a) => a.key === "reload");
  assert.equal(spent.enabled, true);   // fired — reload now makes sense
});

test("a spent ranged weapon disables Fire/Aimed until it is reloaded", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const ready = availableActions(rig(), turn).find((a) => a.key === "fire");
  assert.equal(ready.cost, 1);
  assert.equal(ready.enabled, true);
  const spent = availableActions(rig({ loaded: { longRange: false, melee: true } }), turn)
    .find((a) => a.key === "fire");
  assert.equal(spent.cost, 1);           // no more 2-slot rushed shot
  assert.equal(spent.enabled, false);    // must reload first
  assert.match(spent.note, /reload/i);
});

test("Fire/Aimed shows 2 heat once a ranged shot has already been fired this activation", () => {
  const first = availableActions(rig(), { activeRigId: 1, actionsUsed: 1, actionsMax: 5, longRangeShots: 0 })
    .find((a) => a.key === "fire");
  assert.equal(first.heat, 1);
  const second = availableActions(rig(), { activeRigId: 1, actionsUsed: 2, actionsMax: 5, longRangeShots: 1 })
    .find((a) => a.key === "fire");
  assert.equal(second.heat, 2);          // second shot runs the barrel hot
});

test("actionBudget reports remaining and the Hull-0 reduction", () => {
  assert.deepEqual(actionBudget(rig(), { activeRigId: 1, actionsUsed: 1, actionsMax: 5 }),
    { used: 1, max: 5, left: 4, reduced: false });
  const hurt = actionBudget(rig({ hull: { sp: 0, max: 6 } }), { activeRigId: 1, actionsUsed: 0, actionsMax: 3 });
  assert.equal(hurt.reduced, true);
});

test("rigModifiers surfaces every value-changing effect in play", () => {
  const mods = rigModifiers(rig({
    hull: { sp: 0, max: 6 }, engine: { sp: 0, max: 4, heat: 3 },
    noCool: true, speedHalvedNextRound: true, immobilised: true,
    weaponsDestroyed: ["Sword"], preparation: { type: "brace" },
  }));
  const keys = mods.map((m) => m.key);
  for (const k of ["hull0", "engine0", "nocool", "speed", "immobile", "weapon", "prep"]) {
    assert.ok(keys.includes(k), `missing ${k}`);
  }
});

test("rigModifiers shows a generic chip for a hidden reaction", () => {
  const r = rig({ preparation: { hidden: true } });
  const mod = rigModifiers(r).find((m) => m.key === "prep");
  assert.equal(mod.tag, "Reaction set");
  assert.equal(mod.tone, "prep");
});

test("rigModifiers names a revealed reaction", () => {
  const r = rig({ preparation: { type: "return", source: "answer", faceUp: true } });
  const mod = rigModifiers(r).find((m) => m.key === "prep");
  assert.equal(mod.tag, "Return fire ready");
});

test("phaseSummary describes the phase and turn", () => {
  const game = { phase: "activation", round: 2, turn: { side: "a", activeRigId: null }, answerTokens: { a: 2, b: 0 },
    sides: [{ id: "a", name: "Ana" }, { id: "b", name: "Bo" }], outcome: null };
  const s = phaseSummary(game, [rig()]);
  assert.match(s.label, /Activation/i);
  assert.equal(s.round, 2);
  assert.equal(s.turnName, "Ana");
});

test("outcomeText names the winner or a draw", () => {
  const sides = [{ id: "a", name: "Ana" }, { id: "b", name: "Bo" }];
  assert.match(outcomeText({ winner: "a", reason: "points" }, sides), /Ana wins/);
  assert.match(outcomeText({ winner: null, reason: "draw" }, sides), /Draw/);
  assert.equal(outcomeText(null, sides), "");
});

test("availableActions appends the Rig's equipment active, gated by budget", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const plain = availableActions(rig(), turn);
  assert.equal(plain.some((a) => a.key === "harden"), false);

  const armored = availableActions(rig({ equipment: "ablative-plating" }), turn);
  const harden = armored.find((a) => a.key === "harden");
  assert.equal(harden.label, "Harden");
  assert.equal(harden.heat, 1);
  assert.equal(harden.enabled, true);

  const capped = availableActions(rig({ equipment: "ablative-plating" }), { activeRigId: 1, actionsUsed: 5, actionsMax: 5 });
  assert.equal(capped.find((a) => a.key === "harden").enabled, false);
});

test("actionBudget.reduced fires from the structural part (regression)", () => {
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  rig.hull.sp = 0;
  const budget = actionBudget(rig, { actionsUsed: 0, actionsMax: 1 });
  assert.equal(budget.reduced, true);
});

test("actionBudget.reduced stays false when the structural part is unhurt", () => {
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  const budget = actionBudget(rig, { actionsUsed: 0, actionsMax: 3 });
  assert.equal(budget.reduced, false);
});

test("rigModifiers labels the structural chip 'Hull 0' for a Rig", () => {
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  rig.hull.sp = 0;
  const mods = rigModifiers(rig);
  assert.ok(mods.find((m) => m.tag.startsWith("Hull 0")));
});

test("rigModifiers labels the power chip 'Engine 0' for a Rig", () => {
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  rig.engine.sp = 0;
  const mods = rigModifiers(rig);
  assert.ok(mods.find((m) => m.tag.startsWith("Engine 0")));
});

test("rigModifiers labels the mobility chip 'Legs 0' for a Rig", () => {
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  rig.legs.sp = 0;
  const mods = rigModifiers(rig);
  assert.ok(mods.find((m) => m.tag.startsWith("Legs 0")));
});

test("Tank action console = 2 actions, no shutdown, no prepare, no equipment", () => {
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  const actions = availableActions(tank, { actionsMax: 2, actionsUsed: 0, longRangeShots: 0 });
  const keys = actions.map((a) => a.key);
  assert.ok(!keys.includes("shutdown"), "no shutdown");
  assert.ok(!keys.includes("prepare"), "no prepare");
  assert.ok(
    !keys.some((k) => ["harden", "purge", "jumpjets", "overclock", "emergencypatch"].includes(k)),
    "no equipment active",
  );
});

test("Walker action console keeps prepare hidden, keeps other actions (regression)", () => {
  const w = makeUnit("walker", 1, "Sentinel", "a", { unit: "Autocannon Mount" });
  const actions = availableActions(w, { actionsMax: 3, actionsUsed: 0, longRangeShots: 0 });
  const keys = actions.map((a) => a.key);
  assert.ok(!keys.includes("prepare"));
  assert.ok(!keys.includes("shutdown"));
  assert.ok(keys.includes("move"));
  assert.ok(keys.includes("fire"));
});

test("Flat-pick fired: 'reload' enabled, 'fire' disabled with correct note", () => {
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  tank.loaded.unit = false; // just fired
  const actions = availableActions(tank, { actionsMax: 2, actionsUsed: 1, longRangeShots: 1 });
  const reload = actions.find((a) => a.key === "reload");
  const fire = actions.find((a) => a.key === "fire");
  assert.equal(reload.enabled, true);
  assert.equal(fire.enabled, false);
  assert.ok(fire.note.includes("Ranged weapon spent"));
});

test("availableActions blocks Move/Sprint and enables Disengage while engaged", () => {
  const rig = makeRig(1, "a1", "light", "a", { lr: "Mini Gun", melee: "Sword" });
  rig.engagedWith = 2;
  const turn = { actionsMax: 3, actionsUsed: 0, longRangeShots: 0 };
  const list = availableActions(rig, turn);
  const by = (k) => list.find((x) => x.key === k);
  assert.equal(by("move").enabled, false);
  assert.equal(by("sprint").enabled, false);
  assert.equal(by("disengage").enabled, true);
});

test("availableActions enables Move and disables Disengage when not engaged", () => {
  const rig = makeRig(1, "a1", "light", "a", { lr: "Mini Gun", melee: "Sword" });
  const turn = { actionsMax: 3, actionsUsed: 0, longRangeShots: 0 };
  const list = availableActions(rig, turn);
  const by = (k) => list.find((x) => x.key === k);
  assert.equal(by("move").enabled, true);
  assert.equal(by("disengage").enabled, false);
});

test("rigModifiers surfaces an Engaged chip", () => {
  const rig = makeRig(1, "a1", "light", "a", { lr: "Mini Gun", melee: "Sword" });
  rig.engagedWith = 2;
  assert.ok(rigModifiers(rig).some((m) => m.key === "engaged"));
});

test("availableActions disables Jump Jets while engaged", () => {
  const rig = makeRig(1, "a1", "light", "a", { lr: "Mini Gun", melee: "Sword" });
  rig.equipment = "servo-actuators";
  rig.engagedWith = 2;
  const turn = { actionsMax: 3, actionsUsed: 0, longRangeShots: 0 };
  const jj = availableActions(rig, turn).find((x) => x.key === "jumpjets");
  assert.ok(jj);
  assert.equal(jj.enabled, false);
});
