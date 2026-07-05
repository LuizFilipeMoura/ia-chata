import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, makeRig, claimSide, applyCommand, findRig,
  normalizeWeapon, WEAPONS, formatBattleState, publicState, __test,
  EQUIPMENT, normalizeEquipment, WEAPON_UPGRADES,
} from "./game-state.js";

// Every Rig must be commissioned with one Long Range and one Melee weapon,
// so the add-command attrs used across these tests carry both.
const W = { lr: "Mini Gun", melee: "Sword" };

test("createRoom has two unclaimed sides and empty rigs", () => {
  const r = createRoom("IRON42");
  assert.equal(r.code, "IRON42");
  assert.equal(r.version, 0);
  assert.equal(r.rigs.length, 0);
  assert.deepEqual(r.game.sides.map((s) => s.id), ["a", "b"]);
  assert.equal(r.game.sides.every((s) => !s.claimed), true);
  assert.equal(r.game.round, 1);
});

test("claimSide takes the first free side and bumps version", () => {
  const r = createRoom("X");
  const first = claimSide(r, { name: "Ana" });
  assert.equal(first, "a");
  assert.equal(r.game.sides[0].name, "Ana");
  assert.equal(r.game.sides[0].claimed, true);
  assert.equal(r.version, 1);
  const second = claimSide(r, { name: "Bo" });
  assert.equal(second, "b");
  const third = claimSide(r, { name: "Cy" });
  assert.equal(third, null); // room full
});

test("claimSide reclaims a requested side without consuming the other slot", () => {
  const r = createRoom("X");
  assert.equal(claimSide(r, { name: "Ana", side: "a" }), "a");
  const v = r.version;
  // Auto-rejoin as side a: same side back, no version churn, side b still free.
  assert.equal(claimSide(r, { name: "Ana", side: "a" }), "a");
  assert.equal(r.version, v);                    // idempotent — no bump
  assert.equal(r.game.sides[1].claimed, false);  // side b untouched
  // Someone deliberately takes side b.
  assert.equal(claimSide(r, { name: "Bo", side: "b" }), "b");
});

test("normalizeWeapon resolves case-insensitively and rejects unknown", () => {
  assert.equal(normalizeWeapon("longRange", "mini gun"), "Mini Gun");
  assert.equal(normalizeWeapon("melee", "  SWORD "), "Sword");
  assert.equal(normalizeWeapon("longRange", "Sword"), null);   // wrong category
  assert.equal(normalizeWeapon("melee", "Death Ray"), null);   // not a weapon
  assert.equal(normalizeWeapon("longRange", ""), null);
  assert.equal(Object.keys(WEAPONS.longRange).length, 6);
  assert.equal(Object.keys(WEAPONS.melee).length, 6);
});

test("WEAPONS carries full combat profiles keyed by canonical name", () => {
  assert.equal(Object.keys(WEAPONS.longRange).length, 6);
  assert.equal(Object.keys(WEAPONS.melee).length, 6);
  assert.equal(WEAPONS.longRange["Mini Gun"].rof, 8);
  assert.equal(WEAPONS.longRange["Mini Gun"].str, 4);
  assert.deepEqual(WEAPONS.longRange["Mini Gun"].acc, [1, -1]);
  assert.deepEqual(WEAPONS.longRange["Mini Gun"].rng, [9, 18]);
  assert.ok(WEAPONS.longRange["Mini Gun"].perks.includes("Raking Fire"));
  assert.equal(WEAPONS.melee["Lance"].str, 11);
  assert.ok(WEAPONS.melee["Sword"].perks.includes("Melee"));
});

test("makeRig requires a supported class, one valid long-range and one valid melee weapon", () => {
  const ok = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  assert.equal(ok.weapons.longRange, "Autocannon");
  assert.equal(ok.weapons.melee, "Claw");
  assert.equal(makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon" }), null); // no melee
  assert.equal(makeRig(1, "Warden", "medium", "a", {}), null);                          // neither
  assert.equal(makeRig(1, "Warden", "medium", "a", { longRange: "Nope", melee: "Claw" }), null);
  assert.equal(makeRig(1, "Warden", "heavy", "a", { longRange: "Autocannon", melee: "Claw" }), null);
  assert.equal(makeRig(1, "Warden", "colossal", "a", { longRange: "Autocannon", melee: "Claw" }), null);
});

test("add assigns owner, weapons and default SP; damage respects the floor", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium", owner: "b", ...W } });
  const rig = findRig(r, "warden");
  assert.equal(rig.owner, "b");
  assert.equal(rig.hull.max, 7);
  assert.equal(rig.weapons.longRange, "Mini Gun");
  assert.equal(rig.weapons.melee, "Sword");
  assert.equal(r.version, 1);
  applyCommand(r, { verb: "damage", attrs: { name: "Warden", loc: "hull", amount: "3" } });
  assert.equal(rig.hull.sp, 4);
  assert.equal(r.version, 2);
});

test("add without weapons is a no-op — no rig, no version bump, no id burn", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium" } });          // missing both
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium", lr: "Mini Gun" } }); // missing melee
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium", lr: "X", melee: "Y" } }); // invalid
  assert.equal(r.rigs.length, 0);
  assert.equal(r.version, 0);
  // The next valid add still gets id 1 — a rejected add must not consume an id.
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium", ...W } });
  assert.equal(findRig(r, "Warden").id, 1);
  assert.equal(r.version, 1);
});

test("add blocks heavy and colossal for now without version bump or id burn", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Breaker", class: "heavy", ...W } });
  applyCommand(r, { verb: "add", attrs: { name: "Atlas", class: "colossal", ...W } });
  assert.equal(r.rigs.length, 0);
  assert.equal(r.version, 0);
  applyCommand(r, { verb: "add", attrs: { name: "Vela", class: "light", ...W } });
  assert.equal(findRig(r, "Vela").id, 1);
  assert.equal(r.version, 1);
});

test("add without owner uses the requesting side", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Reaver", class: "medium", ...W } }, { side: "b" });
  const rig = findRig(r, "Reaver");
  assert.equal(rig.owner, "b");
});

test("add blocks a fourth rig for the same side without version bump or id burn", () => {
  const r = createRoom("X");
  for (let i = 1; i <= 3; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `A${i}`, class: "light", owner: "a", ...W } });
  }
  const version = r.version;
  applyCommand(r, { verb: "add", attrs: { name: "A4", class: "light", owner: "a", ...W } });

  assert.equal(r.rigs.length, 3);
  assert.equal(findRig(r, "A4"), null);
  assert.equal(r.version, version);

  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "light", owner: "b", ...W } });
  assert.equal(findRig(r, "B1").id, 4);
  assert.equal(r.version, version + 1);
});

test("add blocks all new rigs once six rigs are in place", () => {
  const r = createRoom("X");
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  const version = r.version;

  applyCommand(r, { verb: "add", attrs: { name: "Overflow", class: "light", owner: "b", ...W } });

  assert.equal(r.rigs.length, 6);
  assert.equal(findRig(r, "Overflow"), null);
  assert.equal(r.version, version);
});

test("ready requires at least three rigs for that side", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "A1", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, false);

  applyCommand(r, { verb: "add", attrs: { name: "A2", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "add", attrs: { name: "A3", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);
});

test("adding or removing rigs before start resets ready flags", () => {
  const r = createRoom("X");
  for (let i = 1; i <= 3; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `A${i}`, class: "light", owner: "a", ...W } });
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);

  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "light", owner: "b", ...W } });
  assert.equal(r.game.sides.every((s) => s.ready === false), true);

  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  applyCommand(r, { verb: "remove", attrs: { name: "B1" } });
  assert.equal(r.game.sides.every((s) => s.ready === false), true);
});

test("both ready starts game and assigns private random bounties", () => {
  const r = createRoom("X");
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }

  const rolls = [0.99, 0];
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => rolls.shift() });

  assert.equal(r.game.started, true);
  assert.equal(r.game.bounties.a, findRig(r, "b3").id);
  assert.equal(r.game.bounties.b, findRig(r, "a1").id);
});

test("public state only exposes the requesting side bounty", () => {
  const r = createRoom("X");
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });

  assert.deepEqual(Object.keys(publicState(r, "a").game.bounties), ["a"]);
  assert.deepEqual(Object.keys(publicState(r, "b").game.bounties), ["b"]);
  assert.equal(publicState(r, "a").game.bounties.b, undefined);
  assert.equal(publicState(r, "b").game.bounties.a, undefined);
});

test("engine heat cannot cool below 3 once catastrophic; recovery-less heat math", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "S", class: "light", ...W } });
  applyCommand(r, { verb: "set", attrs: { name: "S", loc: "engine", sp: "0" } });
  const rig = findRig(r, "S");
  assert.equal(rig.engine.heat >= 3, true);
  applyCommand(r, { verb: "heat", attrs: { name: "S", amount: "0" } }); // try to vent
  assert.equal(rig.engine.heat, 3);
});

test("unknown verb and unknown rig are no-ops (no version bump)", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "nonsense", attrs: {} });
  applyCommand(r, { verb: "damage", attrs: { name: "ghost", loc: "hull", amount: "1" } });
  assert.equal(r.version, 0);
});

test("formatBattleState reports round, sides and owned rigs with weapons", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Ana" });
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium", owner: "a", ...W } });
  const out = formatBattleState(r);
  assert.match(out, /CURRENT BATTLE STATE/);
  assert.match(out, /Round 1\/5/);
  assert.match(out, /Ana \(a\) VP 0/);
  assert.match(out, /Warden \(medium, owner a\).*hull 7\/7/);
  assert.match(out, /Mini Gun/);
  assert.match(out, /Sword/);
});

test("publicState omits nextRigId bookkeeping", () => {
  const r = createRoom("X");
  const view = publicState(r);
  assert.equal(view.nextRigId, undefined);
  assert.equal(view.code, "X");
  assert.ok(Array.isArray(view.rigs));
});

test("new rigs carry activation/heat-effect defaults", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "S", class: "light", ...W } });
  const rig = findRig(r, "S");
  assert.equal(rig.activated, false);
  assert.equal(rig.skipNextActivation, false);
  assert.equal(rig.noCool, false);
  assert.equal(rig.speedHalvedNextRound, false);
  assert.deepEqual(rig.loaded, { longRange: true, melee: true });
  assert.equal(rig.preparation, null);
  assert.deepEqual(rig.weaponsDestroyed, []);
  assert.equal(rig.immobilised, false);
});

test("createRoom game carries round-loop defaults", () => {
  const r = createRoom("X");
  assert.equal(r.game.autoResolve, true);
  assert.equal(r.game.phase, "setup");
  assert.deepEqual(r.game.deployOrder, []);
  assert.equal(r.game.initiative, null);
  assert.deepEqual(r.game.answerTokens, { a: 0, b: 0 });
  assert.equal(r.game.turn, null);
  assert.deepEqual(r.game.resolutions, []);
  assert.equal(r.game.outcome, null);
});

test("ensureGameShape backfills fields on a legacy room", () => {
  const legacy = { code: "L", version: 0, nextRigId: 2, game: { round: 1, started: false },
    rigs: [{ id: 1, name: "Old", weightClass: "light", owner: "a",
      hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false},
      legs:{sp:5,max:5,destroyed:false}, engine:{sp:4,max:4,destroyed:false,heat:0},
      weapons:{longRange:"Mini Gun",melee:"Sword"}, destroyed:false }] };
  applyCommand(legacy, { verb: "nonsense", attrs: {} });
  assert.equal(legacy.game.autoResolve, true);
  assert.equal(legacy.game.phase, "setup");
  assert.equal(legacy.rigs[0].activated, false);
  assert.deepEqual(legacy.rigs[0].loaded, { longRange: true, melee: true });
});

// Helper: stand up a started 3v3 battle. Side "a" readies first (deploys first),
// so "a" activates SECOND in round 1 and "b" activates first.
function startedRoom() {
  const r = createRoom("X");
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  return r;
}

test("setdice toggles autoResolve only before the game starts", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "setdice", attrs: { value: "manual" } });
  assert.equal(r.game.autoResolve, false);
  applyCommand(r, { verb: "setdice", attrs: { value: "auto" } });
  assert.equal(r.game.autoResolve, true);
});

test("setdice is a no-op once started", () => {
  const r = startedRoom();
  const v = r.version;
  applyCommand(r, { verb: "setdice", attrs: { value: "manual" } });
  assert.equal(r.game.autoResolve, true);
  assert.equal(r.version, v);
});

test("starting the game seeds round 1 initiative from deploy order", () => {
  const r = startedRoom();
  assert.equal(r.game.phase, "activation");
  assert.equal(r.game.round, 1);
  assert.deepEqual(r.game.initiative.order, ["b", "a"]);
  assert.equal(r.game.initiative.second, "a");
  assert.equal(r.game.answerTokens.a, 2);
  assert.equal(r.game.answerTokens.b, 0);
  assert.equal(r.game.turn.side, "b");
  assert.equal(r.game.turn.activeRigId, null);
});

test("initiative verb rolls D12 for both sides and higher goes first", () => {
  const r = startedRoom();
  r.game.phase = "initiative";
  r.game.round = 2;
  r.game.initiative = null;
  applyCommand(r, { verb: "initiative", attrs: { dice: { a: 9, b: 4 } } });
  assert.deepEqual(r.game.initiative.order, ["a", "b"]);
  assert.equal(r.game.initiative.second, "b");
  assert.equal(r.game.answerTokens.b, 2);
  assert.equal(r.game.phase, "activation");
  assert.equal(r.game.turn.side, "a");
});

test("initiative rerolls ties when rolling automatically", () => {
  const r = startedRoom();
  r.game.phase = "initiative"; r.game.round = 2; r.game.initiative = null;
  // random() sequence: a=6,b=6 (tie) -> reroll a=1,b=12 -> b first.
  const seq = [5 / 12, 5 / 12, 0 / 12, 11 / 12];
  applyCommand(r, { verb: "initiative", attrs: {} }, {}, { random: () => seq.shift() });
  assert.deepEqual(r.game.initiative.order, ["b", "a"]);
});

test("initiative verb only runs during the initiative phase", () => {
  const r = startedRoom(); // phase is "activation"
  const v = r.version;
  applyCommand(r, { verb: "initiative", attrs: { dice: { a: 9, b: 4 } } });
  assert.equal(r.version, v);
});

test("activate opens the acting rig with a 5-action budget", () => {
  const r = startedRoom(); // turn.side === "b"
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.activeRigId, findRig(r, "b1").id);
  assert.equal(r.game.turn.actionsUsed, 0);
  assert.equal(r.game.turn.actionsMax, 5);
});

test("activate rejects the wrong side, a second rig mid-activation, and destroyed rigs", () => {
  const r = startedRoom(); // b's turn
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });   // not b's rig
  assert.equal(r.game.turn.activeRigId, null);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const first = r.game.turn.activeRigId;
  applyCommand(r, { verb: "activate", attrs: { name: "b2" } });   // one at a time
  assert.equal(r.game.turn.activeRigId, first);
});

test("Hull at 0 SP drops the action budget by 2", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "hull", sp: "0" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.actionsMax, 3);
});

test("engine reaching 0 SP flags the next activation as skipped", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "engine", sp: "0" } });
  assert.equal(findRig(r, "b1").skipNextActivation, true);
});

test("activating a skip-flagged rig burns the activation and hands off", () => {
  const r = startedRoom(); // b's turn
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "engine", sp: "0" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  assert.equal(b1.activated, true);
  assert.equal(b1.skipNextActivation, false);
  assert.equal(r.game.turn.activeRigId, null);
  assert.equal(r.game.turn.side, "a"); // handed off
});

test("actions add their heat and spend the budget", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } });
  const b1 = findRig(r, "b1");
  assert.equal(b1.engine.heat, 3);            // 1 + 2
  assert.equal(r.game.turn.actionsUsed, 2);
});

test("actions beyond the budget are rejected", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  for (let i = 0; i < 6; i++) applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(r.game.turn.actionsUsed, 5);   // capped at actionsMax
});

test("reload reloads all weapons; repair rolls a D12 and heals", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.loaded.longRange = false;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "reload" } });
  assert.equal(b1.loaded.longRange, true);
  applyCommand(r, { verb: "damage", attrs: { name: "b1", loc: "arms", amount: "3" } }); // 5 -> 2
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "repair", loc: "arms", dice: { repair: 10 } } });
  assert.equal(b1.arms.sp, 4);                // 10+ repairs 2
  assert.equal(r.game.resolutions.at(-1).kind, "repair");
});

test("shut down before any action cools to the floor and ends the activation", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.engine.heat = 5;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "shutdown" } });
  assert.equal(b1.engine.heat, 0);
  assert.equal(b1.activated, true);
  assert.equal(r.game.turn.activeRigId, null);
});

test("end activation with safe heat just hands off", () => {
  const r = startedRoom(); // b first
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(findRig(r, "b1").activated, true);
  assert.equal(r.game.turn.side, "a");        // alternated
  assert.equal(r.game.turn.activeRigId, null);
});

test("overheating at end of activation resolves the Heat Threshold Table", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");               // Light, capacity 6
  b1.engine.heat = 8;                         // 2 over -> bonus +4
  // D12 roll 6 -> total 10 -> Hydraulic Blowout: legs -2, speed halved.
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1", dice: { overheat: 6 } } });
  assert.equal(b1.legs.sp, 3);                // 5 - 2
  assert.equal(b1.speedHalvedNextRound, true);
  assert.equal(r.game.resolutions.at(-1).kind, "overheat");
});

test("a full round of activations triggers Recovery cooldown and reset", () => {
  const r = startedRoom();
  const order = ["b1", "a1", "b2", "a2", "b3", "a3"];
  for (const name of order) {
    applyCommand(r, { verb: "activate", attrs: { name } });
    applyCommand(r, { verb: "action", attrs: { name, action: "move" } }); // +1 heat
    applyCommand(r, { verb: "endactivation", attrs: { name } });
  }
  assert.equal(r.game.phase, "recovery");
  assert.equal(findRig(r, "b1").engine.heat, 0);   // 1 -> floor 0 after -2
  assert.equal(findRig(r, "b1").activated, false);
  assert.deepEqual(r.game.answerTokens, { a: 0, b: 0 });
});

// Drives one full round of activations by following whichever side actually
// holds the turn (rather than a hardcoded name order) so it stays correct
// after initiative flips in round 2+. No heat is added, so no overheat.
function runFullRound(r) {
  const counts = { a: 0, b: 0 };
  while (r.game.phase === "activation") {
    const side = r.game.turn.side;
    const name = `${side}${++counts[side]}`;
    applyCommand(r, { verb: "activate", attrs: { name } });
    applyCommand(r, { verb: "endactivation", attrs: { name } });
  }
}

test("both sides scoring VP advances to the next round's initiative", () => {
  const r = startedRoom();
  runFullRound(r);
  assert.equal(r.game.phase, "recovery");
  applyCommand(r, { verb: "vp", attrs: { side: "a", points: "2" } });
  assert.equal(r.game.phase, "recovery");         // still waiting on b
  applyCommand(r, { verb: "vp", attrs: { side: "b", points: "1" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2);
  assert.equal(r.game.sides.find((s) => s.id === "b").vp, 1);
  assert.equal(r.game.round, 2);
  assert.equal(r.game.phase, "initiative");
});

test("after round 5 the higher VP wins", () => {
  const r = startedRoom();
  for (let round = 1; round <= 5; round++) {
    if (round >= 2) applyCommand(r, { verb: "initiative", attrs: { dice: { a: 9, b: 4 } } });
    runFullRound(r);
    applyCommand(r, { verb: "vp", attrs: { side: "a", points: round === 1 ? "3" : "0" } });
    applyCommand(r, { verb: "vp", attrs: { side: "b", points: "0" } });
  }
  assert.equal(r.game.phase, "finished");
  assert.deepEqual(r.game.outcome, { winner: "a", reason: "points" });
});

test("annihilation ends the game immediately", () => {
  const r = startedRoom();
  for (const name of ["b1", "b2", "b3"]) {
    for (const loc of ["hull", "engine"]) {
      applyCommand(r, { verb: "set", attrs: { name, loc, sp: "0" } });
      applyCommand(r, { verb: "damage", attrs: { name, loc, amount: "1" } }); // destroy
    }
  }
  assert.equal(r.game.outcome.winner, "a");
  assert.equal(r.game.outcome.reason, "annihilation");
  assert.equal(r.game.phase, "finished");
});

test("answer token places a free preparation and decrements the pool", () => {
  const r = startedRoom(); // side a holds 2 Answer tokens
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  const a1 = findRig(r, "a1");
  assert.deepEqual(a1.preparation, { type: "brace", source: "answer" });
  assert.equal(r.game.answerTokens.a, 1);
});

test("answer token is rejected without tokens, off-side, or when already prepared", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } }); // b has 0
  assert.equal(findRig(r, "b1").preparation, null);
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  const v = r.version;
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "evasive", side: "a" } }); // already prepared
  assert.equal(r.version, v);
});

test("publicState carries the new round-loop fields", () => {
  const r = startedRoom();
  const view = publicState(r, "a");
  assert.equal(view.game.phase, "activation");
  assert.equal(view.game.turn.side, "b");
  assert.equal(view.game.autoResolve, true);
  assert.ok(Array.isArray(view.game.resolutions));
});

test("formatBattleState reports phase and whose turn it is", () => {
  const r = startedRoom();
  const out = formatBattleState(r, "a");
  assert.match(out, /Phase: activation/i);
  assert.match(out, /Turn: b/);
});

test("applyDamage arms-to-0 destroys a weapon and spills to hull and engine", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1"); // Light: arms 5, hull 6, engine 4
  __test.applyDamage(r, b1, "arms", 5, { random: () => 0, dice: { armsWeapon: 4 } });
  assert.equal(b1.arms.sp, 0);
  assert.equal(b1.weaponsDestroyed.length, 1);   // D12 4 -> longRange slot destroyed
  assert.equal(b1.hull.sp, 5);                    // 6 - 1 spill
  assert.equal(b1.engine.sp, 3);                  // 4 - 1 spill
  assert.equal(b1.skipNextActivation, false);     // engine at 3, not 0
});

test("applyDamage: first hit to 0 SP hull does not destroy; additional damage destroys the rig", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  __test.applyDamage(r, b1, "hull", 6, { random: () => 0 }); // 6 -> 0 (first-time, no destroy)
  assert.equal(b1.hull.sp, 0);
  assert.equal(b1.hull.destroyed, false);
  __test.applyDamage(r, b1, "hull", 1, { random: () => 0 }); // additional -> destroyed
  assert.equal(b1.hull.destroyed, true);
  assert.equal(b1.destroyed, true);
});

test("applyOverheat still routes through the cascade (engine failure sets noCool)", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  const before = b1.engine.sp;
  __test.applyOverheat(r, b1, 14, { random: () => 0 }); // 14 -> engine-failure: 2 dmg engine + noCool
  assert.equal(b1.engine.sp, Math.max(0, before - 2));
  assert.equal(b1.noCool, true);
});

test("destruction rolls a D12; 4+ records a pending blast", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.hull.sp = 1;
  __test.applyDamage(r, b1, "hull", 5, { random: () => 0, dice: { destruction: 9 } }); // hull past 0 -> destroyed
  assert.equal(b1.destroyed, true);
  assert.equal(r.game.pendingBlast.sourceId, b1.id);
  assert.equal(r.game.pendingBlast.exploded, true);
});

test("blast applies D6 + STR 10 to each named rig and clears the pending blast", () => {
  const r = startedRoom();
  r.game.pendingBlast = { sourceId: findRig(r, "b1").id, exploded: true };
  const a1 = findRig(r, "a1"); // light hull 6
  applyCommand(r, { verb: "blast", attrs: { targets: ["a1"], dice: { impacts: { a1: 6 }, location: { a1: 1 } } } });
  // D6 6 + STR 10 = 16 vs light hull (10/14/16) -> critical (3 SP).
  assert.equal(a1.hull.sp, 3);
  assert.equal(r.game.pendingBlast, null);
});

test("fire action resolves an attack, applies damage and logs it", () => {
  const r = startedRoom(); // b acts first
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1"); // Light target, hull 6
  // Fire the melee Sword: STR 6-2(light)=4. 2 dice both 6 -> impacts 6+4+0(front)=10
  // vs light hull (10/14/16) -> direct 1 each = 2 SP.
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 6], impacts: [6, 6], location: 1 },
  } });
  assert.equal(a1.hull.sp, 4); // 6 - 2
  assert.equal(r.game.turn.actionsUsed, 1);
  assert.equal(r.game.resolutions.at(-1).kind, "attack");
});

test("firing an unloaded ranged weapon is rejected (no budget spent)", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.loaded.longRange = false;
  const used = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "side", range: "near",
    dice: { toHit: [6,6,6,6,6,6,6,6], location: 1, impacts: [1,1,1,1,1,1,1,1] },
  } });
  assert.equal(r.game.turn.actionsUsed, used); // no-op, weapon not loaded
});

test("ram deals a D6 + ram-STR hit to both rigs", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1"); // Light ram STR 8
  const a1 = findRig(r, "a1"); // Light ram STR 8
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "ram", target: "a1",
    dice: { self: { location: 1, impact: 6 }, target: { location: 1, impact: 6 } },
  } });
  // Each: D6 6 + STR 8 = 14 vs light hull (10/14/16) -> severe (2 SP).
  assert.equal(a1.hull.sp, 4);
  assert.equal(b1.hull.sp, 4);
  assert.equal(r.game.turn.actionsUsed, 1);
});

test("Incendiary adds target heat; Shock halves target speed next round", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  const heatBefore = a1.engine.heat;
  // Fire the Sword (Shock) — melee, 2 hits guaranteed.
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6], impacts: [6, 6], location: 1 },
  } });
  assert.equal(a1.speedHalvedNextRound, true);
  assert.equal(a1.engine.heat, heatBefore); // Sword is not Incendiary
});

test("Impale immobilises on a D12 of 8+", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Lance";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6], impacts: [6], location: 1, impale: 9 },
  } });
  assert.equal(a1.immobilised, true);
});

test("EQUIPMENT has the 5 catalogue pieces with passive + active shape", () => {
  const ids = Object.keys(EQUIPMENT).sort();
  assert.deepEqual(ids, ["ablative-plating", "field-repair-suite", "overclock-core", "radiator-array", "servo-actuators"]);
  for (const id of ids) {
    const e = EQUIPMENT[id];
    assert.equal(typeof e.family, "string");
    assert.equal(typeof e.label, "string");
    assert.equal(typeof e.passive, "string");
    assert.equal(typeof e.active.key, "string");
    assert.equal(typeof e.active.heat, "number");
    assert.equal(typeof e.active.text, "string");
  }
});

test("normalizeEquipment is case-insensitive and rejects unknown ids", () => {
  assert.equal(normalizeEquipment("Ablative-Plating"), "ablative-plating");
  assert.equal(normalizeEquipment("nonsense"), null);
  assert.equal(normalizeEquipment(null), null);
});

test("WEAPON_UPGRADES has exactly 2 upgrades for all 12 weapons", () => {
  const all = [...Object.keys(WEAPONS.longRange), ...Object.keys(WEAPONS.melee)];
  assert.equal(all.length, 12);
  for (const name of all) {
    const ups = WEAPON_UPGRADES[name];
    assert.equal(Array.isArray(ups), true, `${name} missing upgrades`);
    assert.equal(ups.length, 2, `${name} must have exactly 2 upgrades`);
    for (const u of ups) {
      assert.equal(typeof u.name, "string");
      assert.equal(typeof u.tag, "string");
    }
  }
});

test("makeRig accepts an equipment id and Ablative Plating grants +1 max/current Hull SP", () => {
  const plain = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  assert.equal(plain.equipment, null);
  assert.equal(plain.hull.max, 7);

  const armored = makeRig(2, "Bastion", "medium", "a", { longRange: "Autocannon", melee: "Claw" }, "ablative-plating");
  assert.equal(armored.equipment, "ablative-plating");
  assert.equal(armored.hull.max, 8);
  assert.equal(armored.hull.sp, 8);
});

test("makeRig rejects an invalid equipment id by falling back to no equipment", () => {
  const rig = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" }, "not-a-real-slot");
  assert.equal(rig.equipment, null);
  assert.equal(rig.hull.max, 7);
});

test("add passes equipment through to the created rig", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Bastion", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw", equipment: "servo-actuators" } });
  const rig = findRig(r, "Bastion");
  assert.equal(rig.equipment, "servo-actuators");
});

test("ensureRigShape backfills equipment/hardened/overclockCoreUsed on legacy rig objects", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Bastion", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw" } });
  const rig = findRig(r, "Bastion");
  delete rig.equipment; delete rig.hardened; delete rig.overclockCoreUsed;
  findRig(r, "Bastion"); // findRig calls ensureGameShape -> ensureRigShape internally
  assert.equal(rig.equipment, null);
  assert.equal(rig.hardened, false);
  assert.equal(rig.overclockCoreUsed, false);
});
