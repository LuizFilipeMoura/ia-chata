// Kill VP, Stagger, digital score/evade/blast resolutions and dice-proof Undo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, claimSide, applyCommand, findRig, publicState, __test,
  KILL_VP, ANY_KILL_VP, WEAPONS,
} from "./game-state.js";
import { aimBreakdown } from "./combat.js";
import { rigModifiers } from "./battle-view.js";
import { driveBots } from "./bot/index.js";

const W = { lr: "Mini Gun", melee: "Sword" };

// A physical room, 3v3 light rigs, started with b acting first.
function startedRoom() {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  r.game.pendingAnswer = null;
  return r;
}

// A digital room mid-activation: a1 active at (10,10) facing b1 at (20,10),
// b1 facing back. Terrain cleared. Nothing is "started" via ready, the phase
// is poked directly (as the geometry tests do).
function digitalFirefight() {
  const room = createRoom("DIG");
  room.mode = "digital";
  claimSide(room, { name: "Cyan", side: "a" });
  claimSide(room, { name: "Gold", side: "b" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 2; i++) {
      applyCommand(room, { verb: "add", attrs: {
        name: `${owner}${i}`, class: "light", owner, longRange: "Autocannon", melee: "Claw",
      } });
    }
  }
  room.field.terrain = [];
  room.game.started = true;
  room.game.phase = "activation";
  const a = findRig(room, "a1"); const b = findRig(room, "b1");
  room.game.turn = { side: "a", activeRigId: a.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  a.loaded = { longRange: true, melee: true };
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 20, y: 10 }; b.facing = 180;
  findRig(room, "a2").pos = { x: 5, y: 25 }; findRig(room, "a2").facing = 0;
  findRig(room, "b2").pos = { x: 40, y: 25 }; findRig(room, "b2").facing = 180;
  return { room, a, b };
}

const side = (r, id) => r.game.sides.find((s) => s.id === id);
const lastOf = (r, kind) => [...r.game.resolutions].reverse().find((e) => e.kind === kind);

// ---------------------------------------------------------------------------
// 1. Any kill scores
// ---------------------------------------------------------------------------

test("destroying any enemy rig scores ANY_KILL_VP for the opposing side", () => {
  const r = startedRoom();
  const b2 = findRig(r, "b2");
  r.game.priorityTargets = { a: findRig(r, "b1").id, b: findRig(r, "a1").id };
  __test.applyDamage(r, b2, "hull", 99, { dice: { destruction: 1 } });
  assert.equal(ANY_KILL_VP, 1);
  assert.equal(side(r, "a").vp, ANY_KILL_VP);
  const kill = lastOf(r, "destruction");
  assert.deepEqual(kill.vp, { side: "a", amount: ANY_KILL_VP });
  assert.ok(kill.effects.some((e) => /\+1 VP/.test(e) && /kill/i.test(e)));
});

test("a Priority Target kill stacks the kill VP and the Priority bonus", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  r.game.priorityTargets = { a: b1.id, b: findRig(r, "a1").id };
  __test.applyDamage(r, b1, "hull", 99, { dice: { destruction: 1 } });
  assert.equal(side(r, "a").vp, ANY_KILL_VP + KILL_VP);
  const kill = lastOf(r, "destruction");
  assert.deepEqual(kill.vp, { side: "a", amount: ANY_KILL_VP + KILL_VP });
  assert.equal(kill.effects.filter((e) => /VP/.test(e)).length, 2, "one line per award");
  assert.ok(kill.effects.some((e) => /Priority Elimination/.test(e)));
});

test("a self-inflicted wreck (overheat) still scores for the opponent, once", () => {
  const r = startedRoom();
  const a3 = findRig(r, "a3");
  r.game.priorityTargets = { a: findRig(r, "b1").id, b: findRig(r, "a1").id };
  __test.applyOverheat(r, a3, 99, {});        // off the table: engine/hull cook
  if (!a3.destroyed) __test.applyDamage(r, a3, "hull", 99, { dice: { destruction: 1 } });
  assert.equal(a3.destroyed, true);
  assert.equal(side(r, "b").vp, ANY_KILL_VP);
  __test.applyDamage(r, a3, "hull", 5, { dice: { destruction: 1 } });
  assert.equal(side(r, "b").vp, ANY_KILL_VP, "never re-awarded");
});

// ---------------------------------------------------------------------------
// 3. Stagger
// ---------------------------------------------------------------------------

function fireMiss(r, name, target) {
  applyCommand(r, { verb: "action", attrs: {
    name, action: "fire", weapon: "longRange", target, arc: "front", range: "near",
    dice: { toHit: [1, 1, 1, 1, 1, 1, 1, 1] },
  } });
}

test("a resolved attack that deals 0 SP staggers the target: +1 heat, flag, resolution", () => {
  const r = startedRoom();          // b acts
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  const heat0 = a1.engine.heat;
  fireMiss(r, "b1", "a1");
  assert.equal(a1.staggered, true);
  assert.equal(a1.engine.heat, heat0 + 1);
  const atk = lastOf(r, "attack");
  assert.equal(atk.stagger, true);
  assert.ok(atk.effects.some((e) => /Staggered/.test(e)));
  assert.ok(rigModifiers(a1).some((m) => m.key === "staggered"));
});

test("a damaging attack does not stagger", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6], wounds: [10, 10], location: 1 },
  } });
  assert.ok(!findRig(r, "a1").staggered);
  assert.ok(!lastOf(r, "attack").stagger);
});

test("the staggered rig takes −1 Aim on its next attack, then the flag clears", () => {
  const rig = { weightClass: "light", hull: { sp: 5 }, staggered: true };
  const bd = aimBreakdown(rig, { ...WEAPONS.longRange["Autocannon"] }, { distance: 12 });
  assert.ok(bd.terms.some((t) => t.label === "staggered" && t.value === -1));

  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  findRig(r, "b1").staggered = true;
  fireMiss(r, "b1", "a1");
  const hit = lastOf(r, "attack").breakdown.steps.find((s) => s.kind === "hit");
  assert.ok(hit.terms.some((t) => t.label === "staggered" && t.value === -1));
  assert.equal(findRig(r, "b1").staggered, false, "spent on the attack");
});

test("stagger clears at the end of the rig's next activation if it never attacks", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.staggered = true;               // staggered on a's turn, before b1 acts
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(b1.staggered, true);
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(b1.staggered, false);
});

test("staggered during its OWN activation, it keeps the flag through its next one", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  // A counter (Return Fire, Brace…) whiffs on the active rig mid-activation.
  __test.staggerRig(r, b1);
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(b1.staggered, true, "survives the activation it was staggered in");
  // Next activation (poke the turn back to b1 directly).
  b1.activated = false;
  r.game.turn = { side: "b", activeRigId: b1.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(b1.staggered, false);
});

test("an evaded attack does not stagger", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "evasive", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } });
  applyCommand(r, { verb: "react", attrs: { evaded: true, side: "a" } });
  assert.ok(!findRig(r, "a1").staggered);
});

// ---------------------------------------------------------------------------
// 4. Digital round-end scoring emits resolutions
// ---------------------------------------------------------------------------

test("digital recovery pushes a score resolution per held or contested marker", () => {
  const { room, a, b } = digitalFirefight();
  room.game.objectives = [{ x: 10, y: 10, vp: 2 }, { x: 30, y: 30, vp: 1 }, { x: 40, y: 25, vp: 1 }];
  b.pos = { x: 10, y: 10 };           // a1 and b1 both on marker 0 → contested
  // marker 1: nobody. marker 2: b2 alone.
  const n = room.game.nextResolutionId;
  __test.runRecovery(room);
  const scores = room.game.resolutions.filter((e) => e.kind === "score" && e.id >= n);
  assert.equal(scores.length, 2);
  const contested = scores.find((e) => e.objective === 0);
  assert.deepEqual(
    { contested: contested.contested, vp: contested.vp, x: contested.x, y: contested.y },
    { contested: true, vp: 0, x: 10, y: 10 });
  assert.match(contested.summary, /contested/i);
  const held = scores.find((e) => e.objective === 2);
  assert.equal(held.side, "b"); assert.equal(held.actor, "b"); assert.equal(held.vp, 1);
  assert.equal(held.x, 40); assert.equal(held.y, 25);
  assert.equal(held.summary, "Gold holds the beacon: +1 VP");
  assert.equal(side(room, "b").vp, 1);
});

// ---------------------------------------------------------------------------
// 5. Undo can't re-roll engine dice
// ---------------------------------------------------------------------------

test("a command that rolled engine dice wipes the undo history", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(publicState(r, "b").game.canUndo, true, "a dice-free move is undoable");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } }, {}, { random: () => 0.5 });
  assert.equal(r._history.length, 0);
  assert.equal(publicState(r, "b").game.canUndo, false);
  const v = r.version;
  applyCommand(r, { verb: "undo", attrs: { side: "b" } });
  assert.equal(r.version, v, "nothing to revert");
});

test("player-typed dice keep the command undoable", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6], wounds: [10, 10], location: 1 },
  } });
  assert.equal(publicState(r, "b").game.canUndo, true);
});

test("an overheat roll on end-activation can't be undone either", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  findRig(r, "b1").engine.heat = 20;
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } }, {}, { random: () => 0.1 });
  assert.equal(r._history.length, 0);
});

// ---------------------------------------------------------------------------
// 6. Evasive / Sidestep rolled on the server in digital rooms
// ---------------------------------------------------------------------------

function digitalEvasive(prep) {
  const { room, a, b } = digitalFirefight();
  b.preparation = { type: prep, source: "answer", faceUp: false };
  applyCommand(room, { verb: "action", attrs: { name: "a1", action: "fire", weapon: "longRange", target: "b1" } });
  assert.equal(room.game.pendingReaction?.kind, prep);
  return { room, a, b };
}

for (const prep of ["evasive", "sidestep"]) {
  test(`digital ${prep}: no flag → the server rolls a D6, 4+ dodges`, () => {
    const { room, b } = digitalEvasive(prep);
    const sp0 = b.hull.sp + b.arms.sp + b.legs.sp + b.engine.sp;
    applyCommand(room, { verb: "react", attrs: { side: "b" } }, {}, { random: () => 0.7 }); // → 5
    assert.equal(room.game.pendingReaction, null);
    const re = room.game.resolutions.find((e) => e.kind === "reaction" && e.rolls?.length);
    assert.equal(re.rolls[0].sides, 6); assert.equal(re.rolls[0].value, 5);
    assert.match(re.summary, /^b1 tries to (evade|sidestep): rolled 5, dodged!$/);
    assert.equal(b.hull.sp + b.arms.sp + b.legs.sp + b.engine.sp, sp0);
  });

  test(`digital ${prep}: a 1–3 is caught and the shot resolves`, () => {
    const { room } = digitalEvasive(prep);
    applyCommand(room, { verb: "react", attrs: { side: "b" } }, {}, { random: () => 0.2 }); // → 2
    const re = room.game.resolutions.find((e) => e.kind === "reaction" && e.rolls?.length);
    assert.match(re.summary, /rolled 2, caught/);
    assert.ok(room.game.resolutions.some((e) => e.kind === "attack" && e.breakdown), "the shot rolled");
  });
}

test("physical evasive with no flag is not evaded (players adjudicate)", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "evasive", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } });
  applyCommand(r, { verb: "react", attrs: { side: "a" } }, {}, { random: () => 0.99 });
  assert.ok(!r.game.resolutions.some((e) => e.kind === "reaction" && e.rolls?.length));
  assert.ok(r.game.resolutions.some((e) => e.kind === "attack" && e.breakdown));
});

test("a bot defender resolves its own Evasive reaction", () => {
  const { room, b } = digitalEvasive("evasive");
  room.game.sides.find((s) => s.id === "b").bot = "normal";
  driveBots(room, { random: () => 0.2 });
  assert.equal(room.game.pendingReaction, null);
  assert.equal(b.preparation, null);
});

// ---------------------------------------------------------------------------
// 7. Blast targets picked by the server in digital rooms
// ---------------------------------------------------------------------------

test("digital blast with no target list hits every living rig within 4\" of the wreck", () => {
  const { room, a, b } = digitalFirefight();
  const a2 = findRig(room, "a2"); const b2 = findRig(room, "b2");
  a.pos = { x: 15.5, y: 10 };  // 4.5" centre to centre
  a2.pos = { x: 20, y: 14 };   // 4"
  b2.pos = { x: 40, y: 25 };   // far
  b.hull.destroyed = true; b.hull.sp = 0; b.destroyed = true;
  room.game.pendingBlast = { sourceId: b.id, exploded: true };
  applyCommand(room, { verb: "blast", attrs: {} }, {}, { random: () => 0.99 });
  const hit = room.game.resolutions.filter((e) => e.kind === "blast").map((e) => e.rigId).sort();
  assert.deepEqual(hit, [a.id, a2.id].sort());
  assert.equal(room.game.pendingBlast, null);
});

test("an explicit empty target list still means nobody (physical adjudication)", () => {
  const { room, b } = digitalFirefight();
  b.destroyed = true;
  room.game.pendingBlast = { sourceId: b.id, exploded: true };
  applyCommand(room, { verb: "blast", attrs: { targets: [] } });
  assert.equal(room.game.resolutions.filter((e) => e.kind === "blast").length, 0);
});

test("recorded frames carry the score / destruction / stagger fields", async () => {
  const { frameOf } = await import("./sim/match.js");
  const { room, a, b } = digitalFirefight();
  room.game.objectives = [{ x: 40, y: 25, vp: 1 }];
  const n = room.game.nextResolutionId;
  __test.staggerRig(room, b);
  __test.runRecovery(room);
  const f = frameOf(room, null, n);
  const score = f.log.find((e) => e.kind === "score");
  assert.deepEqual([score.side, score.objective, score.x, score.y, score.vp], ["b", 0, 40, 25, 1]);
  assert.equal(f.rigs.find((r) => r.id === b.id).staggered, true);
});
