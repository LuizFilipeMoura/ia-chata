import { test } from "node:test";
import assert from "node:assert/strict";
import { availableActions, actionBudget, rigModifiers, phaseSummary, outcomeText } from "./battle-view.js";

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
  const mid = availableActions(rig(), { activeRigId: 1, actionsUsed: 2, actionsMax: 5 });
  assert.equal(mid.find((a) => a.key === "shutdown").enabled, false);
});

test("availableActions disables everything at the budget cap", () => {
  const capped = availableActions(rig(), { activeRigId: 1, actionsUsed: 5, actionsMax: 5 });
  assert.equal(capped.find((a) => a.key === "move").enabled, false);
  assert.equal(capped.find((a) => a.key === "reload").enabled, false);
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
  for (const k of ["hull0", "engine0", "nocool", "speed", "immobile", "weapon", "braced"]) {
    assert.ok(keys.includes(k), `missing ${k}`);
  }
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
