import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGreedySafe, KNOWN_BIASES } from "./policy.mjs";
import { createRoom, applyCommand, makeUnit, WEAPONS, HEAT_CAPACITY } from "../../shared/game-state.js";
import { availableActions } from "../../shared/battle-view.js";
import { arcBonus } from "../../shared/combat.js";

const DUEL_DISTANCE = 16;
const DUEL_ARC = "side"; // never "front": see the Raking Fire test below
const greedySafe = makeGreedySafe({ distance: DUEL_DISTANCE, arc: DUEL_ARC });

// A real seeded room at the activation phase with `active` activated.
// 3v3 because the seed verb force-starts only at >=3 rigs per side.
function seatedRoom(active = "A1") {
  const room = createRoom("TEST");
  const rnd = () => 0.5;
  const roster = ["A1", "A2", "A3"].map((n) => ({ name: n, owner: "a", chassis: "medium-lance-mortar" }))
    .concat(["B1", "B2", "B3"].map((n) => ({ name: n, owner: "b", chassis: "medium-lance-mortar" })));
  applyCommand(room, { verb: "seed", attrs: { roster, first: "a" } }, {}, { random: rnd });
  // The second player MUST spend an Answer token before anyone can activate —
  // there is no decline path. Spend it on a bystander so no duellist carries a
  // preparation (Brace is -2 STR on the front arc and would skew everything).
  const pa = room.game.pendingAnswer;
  if (pa) applyCommand(room, { verb: "answer", attrs: { name: "B3", side: pa.side, prep: "brace" } }, { side: pa.side }, { random: rnd });
  applyCommand(room, { verb: "activate", attrs: { name: active } }, { side: "a" }, { random: rnd });
  return room;
}

test("greedySafe fires when heat allows", () => {
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.verb, "action");
  assert.equal(cmd.attrs.action, "fire");
  assert.equal(cmd.attrs.target, "B1");
  assert.equal(cmd.attrs.distance, DUEL_DISTANCE);
});

test("greedySafe shuts down rather than exceed capacity", () => {
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  // Medium capacity is 5. At 5, one more heat is over — so it must vent, not fire.
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass];
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.attrs.action, "shutdown");
});

test("greedySafe prices the second-shot surcharge from availableActions", () => {
  // The file's whole architectural claim: ask the engine what things cost rather
  // than recomputing them. The surcharge is the case that proves it — a second
  // ranged shot costs def.heat + 1 (battle-view.js), which no local recompute of
  // the base cost would see. At cap-1 the base cost still fits and the surcharged
  // one does not, so a policy hardcoding ACTIONS.fire.heat fires when it must vent.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass] - 1; // 4: base 1 fits, surcharged 2 does not
  room.game.turn.longRangeShots = 1;                    // a shot already went downrange
  const tile = availableActions(rig, room.game.turn, room.game.round).find((x) => x.key === "fire");
  assert.equal(tile.heat, 2, "guard: the engine must be charging the surcharge here");
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.attrs.action, "shutdown");
});

test("greedySafe never issues an action availableActions reports disabled", () => {
  // The whole point of reading availableActions is that the engine owns legality.
  // Assert the POSITIVE property the name claims — resolve whatever action came
  // back through availableActions and require that tile to be enabled — rather
  // than merely "not fire", which a null or any wrong action would also satisfy.
  // Written to generalise: it still holds for any action the policy later learns.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  room.game.turn.actionsUsed = room.game.turn.actionsMax;
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.ok(cmd, "expected a command, not null");
  const tile = availableActions(rig, room.game.turn, room.game.round)
    .find((x) => x.key === cmd.attrs.action);
  assert.ok(tile, `policy issued "${cmd.attrs.action}", which has no tile at all`);
  assert.equal(tile.enabled, true, `policy issued disabled action "${cmd.attrs.action}"`);
});

test("greedySafe returns null rather than throwing when there is no turn", () => {
  // game.turn is genuinely null in recovery and initiative (game-state.js:2081,
  // :1448). The contract is "null when this rig cannot usefully act", so a caller
  // that skips the phase check must get null — not a TypeError.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  const enemy = room.rigs.find((r) => r.name === "B1");
  room.game.turn = null;
  assert.equal(greedySafe(room, rig, enemy), null);
});

test("greedySafe returns null when nothing is worth doing", () => {
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  const dead = room.rigs.find((r) => r.name === "B1");
  dead.destroyed = true;
  assert.equal(greedySafe(room, rig, dead), null);
});

test("greedySafe reloads a spent weapon rather than emitting a dead fire", () => {
  // Firing a spent weapon is a silent no-op in the engine (game-state.js: "Firing
  // a spent weapon is a no-op until the player spends a Reload") — yet the Fire
  // tile stays `enabled`, because Fire is what opens the reload drawer. A policy
  // that trusts `enabled` here emits fire forever and the duel never advances.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  rig.loaded.longRange = false;
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.attrs.action, "reload");
});

test("greedySafe vents when a reload roll could break capacity", () => {
  // Reload costs heat kinds a d6 gamble: 1-3 -> +2 heat. Budget the worst case,
  // since that bound is known — unlike weapon-side fireModeHeat.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  rig.loaded.longRange = false;
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass] - 1; // 4: worst-case reload -> 6 > 5
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.attrs.action, "shutdown");
});

test("greedySafe stops deciding once the activation has ended", () => {
  // Shut Down calls endActivation: activeRigId goes null and the engine silently
  // drops every later command for this rig. A policy that keeps returning them
  // spins the driver forever, so the contract is "a command only when it acts".
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  applyCommand(room, { verb: "action", attrs: { name: "A1", action: "shutdown" } }, { side: "a" }, { random: () => 0.5 });
  assert.equal(room.game.turn.activeRigId, null);
  assert.equal(greedySafe(room, rig, room.rigs.find((r) => r.name === "B1")), null);
});

test("greedySafe does not vent while a meltdown charge is banked", () => {
  // battle-view hardcodes the Shut Down tile to enabled, but the engine rejects
  // it outright while Meltdown Protocol holds a charge. Since greedySafe budgets
  // only KNOWN heat it can overshoot capacity and bank one — and then it would
  // re-issue a shutdown the engine refuses, forever, hanging the driver.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass]; // can't fire safely either
  rig.equipState = { ...(rig.equipState || {}), meltdownCharge: 2 };
  assert.equal(greedySafe(room, rig, room.rigs.find((r) => r.name === "B1")), null);
});

test("greedySafe refuses a rig with no weight class instead of guessing medium", () => {
  // The repo pins this: game-state has a test named "toughnessOf — a rig lookup
  // with no weight class throws, it does not fall back". A silent default-to-
  // medium is the same species as the buried structuredClone this file replaces.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  delete rig.weightClass;
  assert.throws(() => greedySafe(room, rig, room.rigs.find((r) => r.name === "B1")), /Heat Capacity/);
});

test("greedySafe passes rather than firing a weapon rolled dead by an Arms hit", () => {
  // An Arms hit at 0 SP rolls a weapon dead; combat.js then refuses the shot as
  // `weapon-destroyed` while the Fire tile stays enabled and performAction's
  // `return !!res` swallows the reason — a doubly invisible no-op that hit live
  // at round 7 of a real duel. weaponsDestroyed holds weapon NAMES, not slots.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  rig.weaponsDestroyed.push(rig.weapons.longRange);
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.notEqual(cmd?.attrs?.action, "fire");
  assert.equal(cmd.attrs.action, "shutdown");
});

test("greedySafe does not reload a weapon it can never fire again", () => {
  // Reload re-arms `loaded` without consulting weaponsDestroyed, so a dead-weapon
  // rig would happily burn d6 heat reloading a gun that can never fire. The
  // destroyed guard must sit above the reload branch.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  rig.weaponsDestroyed.push(rig.weapons.longRange);
  rig.loaded.longRange = false; // dead AND spent
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.notEqual(cmd?.attrs?.action, "reload");
});

test("greedySafe refuses a cold kind rather than half-supporting it", () => {
  // A REAL tank, not a rig-shaped fake: a cold kind's spent flag is loaded.unit,
  // not loaded.longRange, so the reload guard would miss it and emit dead fires.
  // Heat-budgeting is meaningless for a heatless kind; the duel is rigs-only.
  const room = seatedRoom();
  const tank = makeUnit("tank", 99, "Line Tank", "a", { unit: "Autocannon Mount" });
  assert.equal(tank.loaded?.unit, true, "guard: a cold kind's spent flag is loaded.unit");
  assert.equal(tank.loaded?.longRange, undefined, "guard: cold kinds have no longRange slot");
  assert.throws(() => greedySafe(room, tank, room.rigs.find((r) => r.name === "B1")), /Rigs only/);
});

test("makeGreedySafe demands a distance rather than defaulting to one", () => {
  // An unexplained default would quietly become the answer for every swept cell.
  assert.throws(() => makeGreedySafe({ arc: DUEL_ARC }), /distance/);
  assert.throws(() => makeGreedySafe(), /distance/);
  assert.throws(() => makeGreedySafe({}), /distance/);
  assert.throws(() => makeGreedySafe({ distance: NaN, arc: DUEL_ARC }), /distance/);
  assert.throws(() => makeGreedySafe({ distance: Infinity, arc: DUEL_ARC }), /distance/);
  assert.throws(() => makeGreedySafe({ distance: "16", arc: DUEL_ARC }), /distance/);
});

test("makeGreedySafe demands a legal arc rather than defaulting to one", () => {
  assert.throws(() => makeGreedySafe({ distance: DUEL_DISTANCE }), /arc/);
  assert.throws(() => makeGreedySafe({ distance: DUEL_DISTANCE, arc: null }), /arc/);
  assert.throws(() => makeGreedySafe({ distance: DUEL_DISTANCE, arc: "sideways" }), /arc/);
  assert.throws(() => makeGreedySafe({ distance: DUEL_DISTANCE, arc: "Side" }), /arc/);
  // All three engine arcs are legal — "front" included. The parameter exists so
  // the caller CHOOSES it, not so the harness forbids it.
  for (const arc of ["front", "side", "rear"]) {
    assert.ok(makeGreedySafe({ distance: DUEL_DISTANCE, arc }), `${arc} must be constructible`);
  }
});

test("the fire command carries the declared arc verbatim", () => {
  // The policy is the only thing that names the arc, so if it hardcoded one the
  // whole duel would silently run at that arc regardless of what was configured.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  const enemy = room.rigs.find((r) => r.name === "B1");
  for (const arc of ["front", "side", "rear"]) {
    const cmd = makeGreedySafe({ distance: DUEL_DISTANCE, arc })(room, rig, enemy);
    assert.equal(cmd.attrs.arc, arc);
  }
});

test("Raking Fire on the front arc is a structural zero — why arc is not optional", () => {
  // This is the reason the parameter is required rather than defaulted to a
  // safe-looking "front". arcBonus returns null — not 0, not a failed roll — for
  // Raking Fire on the front arc, so a front-on duel measures Mini Gun and Double
  // MG dealing nothing for all 10 rounds. F7: "all 504 zero-damage cells in the
  // sweep are Raking Fire's front arc". The sweep hides it by pooling arcs; a
  // single-arc duel cannot. Pinned against the real profiles, not a fake perk.
  const mini = WEAPONS.longRange["Mini Gun"];
  const dmg = WEAPONS.longRange["Double MG"];
  assert.deepEqual(mini.perks, ["Raking Fire"], "guard: Mini Gun still carries the perk");
  assert.deepEqual(dmg.perks, ["Raking Fire"], "guard: Double MG still carries the perk");
  assert.equal(arcBonus(mini, "front"), null, "front is a hard zero, not a bonus of 0");
  assert.equal(arcBonus(mini, "side"), 3);
  assert.equal(arcBonus(dmg, "front"), null);
  // A non-Raking weapon has no such cliff — which is exactly why the zero is easy
  // to miss when arcs are pooled.
  assert.equal(arcBonus(WEAPONS.longRange["Mortar"], "front"), 0);
});

test("KNOWN_BIASES is exported for the report to print verbatim", () => {
  // The report prints these rather than re-typing them: two copies of a caveat
  // are two caveats that disagree by the third edit.
  assert.equal(typeof KNOWN_BIASES, "string");
  assert.match(KNOWN_BIASES, /KNOWINGLY/);
  assert.match(KNOWN_BIASES, /not a like-for-like baseline/i);
  // The caveat a report reader most needs: greedySafe makes no choices, so
  // decision-dependent upgrades read 0.00 for want of a decider, not for want of
  // worth. Shipping that column unexplained would recreate the very misreading
  // this harness was built to end.
  assert.match(KNOWN_BIASES, /UNMEASURED, not worthless/);
  assert.match(KNOWN_BIASES, /control rig's loadout is a constant/);
});

test("driving greedySafe reaches a second volley", () => {
  // The harness exists because the old sweep never reached a 3rd volley. A policy
  // that stalls on volley one would reproduce exactly that blindness, so assert
  // the loop actually advances against the real command path.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  const enemy = room.rigs.find((r) => r.name === "B1");
  const rnd = () => 0.5;
  for (let i = 0; i < 6; i++) {
    const cmd = greedySafe(room, rig, enemy);
    if (!cmd) break;
    applyCommand(room, cmd, { side: "a" }, { random: rnd });
  }
  assert.ok(room.game.turn.longRangeShots >= 2, `expected >=2 volleys, got ${room.game.turn.longRangeShots}`);
});
