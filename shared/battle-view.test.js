import { test } from "node:test";
import assert from "node:assert/strict";
import { availableActions, actionBudget, rigModifiers, phaseSummary, outcomeText } from "./battle-view.js";
import { makeRig, makeUnit, rigEffects } from "./game-state.js";
import { GLOSSARY } from "./glossary.js";

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
});

test("a spent ranged weapon keeps Fire live and disables Aimed", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const ready = availableActions(rig(), turn).find((a) => a.key === "fire");
  assert.equal(ready.cost, 1);
  assert.equal(ready.enabled, true);
  const acts = availableActions(rig({ loaded: { longRange: false, melee: true } }), turn);
  const fire = acts.find((a) => a.key === "fire");
  assert.equal(fire.enabled, true);      // opens the reload drawer (melee strike too)
  const aimed = acts.find((a) => a.key === "aimed");
  assert.equal(aimed.enabled, false);    // Aimed is a ranged-only shot
  assert.ok(!acts.some((a) => a.key === "reload")); // reload is a drawer-only path now
  // Even with no melee, Fire stays live so the drawer (and its Reload) is reachable.
  const noMelee = availableActions(
    rig({ weapons: { longRange: "Autocannon", melee: null }, loaded: { longRange: false, melee: true } }),
    turn,
  ).find((a) => a.key === "fire");
  assert.equal(noMelee.enabled, true);
});

test("Fire/Aimed shows 2 heat once a ranged shot has already been fired this activation", () => {
  const first = availableActions(rig(), { activeRigId: 1, actionsUsed: 1, actionsMax: 5, longRangeShots: 0 })
    .find((a) => a.key === "fire");
  assert.equal(first.heat, 1);
  const second = availableActions(rig(), { activeRigId: 1, actionsUsed: 2, actionsMax: 5, longRangeShots: 1 })
    .find((a) => a.key === "fire");
  assert.equal(second.heat, 2);          // second shot runs the barrel hot
});

test("availableActions: sprint chip reflects Servo Actuators and its upgrade", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const servo = availableActions(rig({ equipment: "servo-actuators" }), turn);
  assert.equal(servo.find((a) => a.key === "sprint").heat, 1);
  const reinf = availableActions(rig({ equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" }), turn);
  assert.equal(reinf.find((a) => a.key === "sprint").heat, 1);
  const bare = availableActions(rig(), turn);
  assert.equal(bare.find((a) => a.key === "sprint").heat, 2);
});

test("availableActions: active chip reflects heat-override upgrades", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const rad = availableActions(rig({ equipment: "radiator-array", equipmentUpgrade: "twin-radiators" }), turn);
  assert.equal(rad.find((a) => a.key === "purge").heat, -3);
});

test("drift guard: sprint chip equals rigEffects (which the resolution path uses)", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  for (const over of [{}, { equipment: "servo-actuators" }, { equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" }]) {
    const r = rig(over);
    const chip = availableActions(r, turn).find((a) => a.key === "sprint").heat;
    assert.equal(chip, rigEffects(r).actionHeat.sprint);
  }
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

test("availableActions surfaces Barrage only for a barrage Mortar and disables it while active", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  // A Mortar carrying the barrage upgrade, idle → Barrage offered and enabled.
  const idle = availableActions(rig({
    weapons: { longRange: "Mortar", melee: "Sword" },
    weaponUpgrades: { longRange: "barrage" }, barrageRoundsLeft: 0,
  }), turn).find((a) => a.key === "barrage");
  assert.ok(idle, "expected a Barrage action");
  assert.equal(idle.enabled, true);
  // Already barraging → offered but disabled (the "Barrage N" status tag signals
  // it's running, so neither the Barrage tile nor Fire carries a note).
  const active = availableActions(rig({
    weapons: { longRange: "Mortar", melee: "Sword" },
    weaponUpgrades: { longRange: "barrage" }, barrageRoundsLeft: 2,
  }), turn);
  assert.equal(active.find((a) => a.key === "barrage").enabled, false);
  // A plain Mortar (no barrage upgrade) never sees the action.
  const plain = availableActions(rig({
    weapons: { longRange: "Mortar", melee: "Sword" },
    weaponUpgrades: { longRange: "cluster-shells" },
  }), turn);
  assert.ok(!plain.some((a) => a.key === "barrage"));
});

test("rigModifiers shows a Barrage chip while a barrage is running", () => {
  const mod = rigModifiers(rig({ barrageRoundsLeft: 2 })).find((m) => m.key === "barrage");
  assert.equal(mod.tag, "Barrage 2");
});

test("rigModifiers shows a generic chip for a hidden reaction", () => {
  const r = rig({ preparation: { hidden: true } });
  const mod = rigModifiers(r).find((m) => m.key === "prep");
  assert.equal(mod.tag, "Reaction set");
  assert.equal(mod.tone, "prep");
});

test("rigModifiers shows a Painted chip for a Recon-marked rig", () => {
  const mods = rigModifiers(rig({ painted: { by: "b", painterId: 9 } }));
  const mod = mods.find((m) => m.key === "painted");
  assert.ok(mod, "expected a painted chip");
  assert.equal(mod.tag, "Painted");
  assert.equal(mod.tone, "warn");
  assert.ok(!rigModifiers(rig()).some((m) => m.key === "painted"));
});

test("rigModifiers names a revealed reaction", () => {
  const r = rig({ preparation: { type: "return", source: "answer", faceUp: true } });
  const mod = rigModifiers(r).find((m) => m.key === "prep");
  assert.equal(mod.tag, "Return fire ready");
});

test("rigModifiers names the new Answer counters when revealed", () => {
  const riposte = rig({ preparation: { type: "riposte", faceUp: true } });
  assert.equal(rigModifiers(riposte).find((m) => m.key === "prep").tag, "Riposte ready");
  const sidestep = rig({ preparation: { type: "sidestep", faceUp: true } });
  assert.equal(rigModifiers(sidestep).find((m) => m.key === "prep").tag, "Sidestep ready");
  const exploit = rig({ preparation: { type: "exploit", faceUp: true } });
  assert.equal(rigModifiers(exploit).find((m) => m.key === "prep").tag, "Exploit ready");
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
  assert.ok(!keys.includes("sprint")); // cold kind — no heat to redline
  assert.ok(keys.includes("move"));
  assert.ok(keys.includes("fire"));
});

test("Flat-pick fired: Fire stays live (drawer reload) and reload is not a tile", () => {
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  tank.loaded = { unit: false }; // just fired — a flat-pick clears loaded.unit (combat.js)
  const actions = availableActions(tank, { actionsMax: 2, actionsUsed: 1, longRangeShots: 1 });
  const fire = actions.find((a) => a.key === "fire");
  assert.equal(fire.enabled, true);                  // opens the reload drawer
  assert.equal(actions.find((a) => a.key === "aimed").enabled, false); // spent → ranged-only Aimed shut
  assert.ok(!actions.some((a) => a.key === "reload")); // no standalone reload tile
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

test("Move is hidden when Sprint costs no more than Move (Servo Actuators)", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const servo = availableActions(rig({ equipment: "servo-actuators" }), turn);
  assert.ok(!servo.some((a) => a.key === "move"), "Move dropped for Servo Actuators");
  assert.ok(servo.some((a) => a.key === "sprint"), "Sprint stays");
  const bare = availableActions(rig(), turn);
  assert.ok(bare.some((a) => a.key === "move"), "Move stays without the discount");
});

test("Move stays for cold kinds (no Sprint to dominate it)", () => {
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  const acts = availableActions(tank, { actionsMax: 2, actionsUsed: 0, longRangeShots: 0 });
  assert.ok(acts.some((a) => a.key === "move"), "cold kind keeps Move");
});

test("module actions appear only for units carrying the matching module", () => {
  const turn = { actionsUsed: 0, actionsMax: 3 };
  const welder = { kind: "walker", modules: ["repair", "recon"], loaded: { unit: true }, weapons: { unit: "Sidearm" } };
  const keys = availableActions(welder, turn, 1).map((a) => a.key);
  assert.ok(keys.includes("fieldweld"));
  assert.ok(keys.includes("paint"));
  assert.ok(!keys.includes("vent")); // no coolant module

  const plainTank = { kind: "tank", modules: [], loaded: { unit: true }, weapons: { unit: "Tank Cannon" } };
  const tankKeys = availableActions(plainTank, { actionsUsed: 0, actionsMax: 2 }, 1).map((a) => a.key);
  assert.ok(!tankKeys.includes("fieldweld") && !tankKeys.includes("vent") && !tankKeys.includes("paint"));
});

const GLOSS_IDS = new Set(GLOSSARY.map((e) => e.id));

test("every rigModifiers chip carries a gloss id that resolves", () => {
  // A rig loaded with as many concurrent states as possible.
  const r = rig({
    hull: { sp: 0, max: 6 }, engine: { sp: 0, max: 4, heat: 0 }, legs: { sp: 0, max: 5 },
    immobilised: true, emplaced: true, barrageRoundsLeft: 2, engagedWith: 7,
    burning: 2, noCool: true, speedHalvedNextRound: true, skipNextActivation: true,
    momentum: 1, lockedTarget: 3, actionPenaltyNextActivation: 1, noPrepNextActivation: true,
    noDisengageNextActivation: true, anchoredBy: 4, noActivesNextActivation: true,
    arcLockedNext: true, armsSuppressed: true, autocannonSlowNext: true,
    cracked: { hull: true }, rivetSeized: { arms: true }, noRepair: { legs: true },
    weaponsDestroyed: ["Autocannon"], loaded: { longRange: false },
    painted: { by: "b", painterId: 9 },
  });
  const mods = rigModifiers(r);
  assert.ok(mods.length > 0);
  for (const m of mods) {
    assert.ok(m.gloss, `mod ${m.key} has no gloss`);
    assert.ok(GLOSS_IDS.has(m.gloss), `mod ${m.key} gloss "${m.gloss}" not in glossary`);
  }
});

test("a hidden reaction points at reaction-set; a revealed one names the type", () => {
  const hidden = rigModifiers(rig({ preparation: { hidden: true } })).find((m) => m.key === "prep");
  assert.equal(hidden.gloss, "reaction-set");
  const evasive = rigModifiers(rig({ preparation: { type: "evasive", faceUp: true } })).find((m) => m.key === "prep");
  assert.equal(evasive.gloss, "evasive");
});

test("a revealed riposte/sidestep/exploit chip carries a gloss id that resolves", () => {
  for (const type of ["riposte", "sidestep", "exploit"]) {
    const chip = rigModifiers(rig({ preparation: { type, faceUp: true } })).find((m) => m.key === "prep");
    assert.ok(chip, `no prep chip for ${type}`);
    assert.equal(chip.gloss, type);
    assert.ok(GLOSS_IDS.has(chip.gloss), `${type} gloss "${chip.gloss}" not in glossary`);
  }
});
