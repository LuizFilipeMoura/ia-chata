// Grit tokens (§5, wr-0.13): the comeback mechanic. A side 2+ VP behind at the
// start of a round gains a Grit token: a free Answer-style preparation that is
// Improved, or an upgrade to one a rig already holds.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, claimSide, applyCommand, findRig, publicState, lastRejectionReason, __test,
  gritFor, GRIT_SCALE,
} from "./game-state.js";
import { effectivePenAgainst } from "./combat.js";
import { effectiveWeaponProfile } from "./game-state.js";
import { rigModifiers } from "./battle-view.js";
import { driveBots } from "./bot/index.js";

const W = { lr: "Mini Gun", melee: "Sword" };
const side = (r, id) => r.game.sides.find((s) => s.id === id);
const lastOf = (r, kind) => [...r.game.resolutions].reverse().find((e) => e.kind === kind);

// A physical 3v3 room, started, with the round-1 Answer gate cleared.
function startedRoom() {
  const r = createRoom("GRIT");
  claimSide(r, { name: "Cyan", side: "a" });
  claimSide(r, { name: "Gold", side: "b" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  r.game.pendingAnswer = null;
  r.game.answerTokens = { a: 0, b: 0 };
  return r;
}

// Jump to the next round's initiative with the given score, then roll it:
// `first` activates first, the other side gets the Answer token.
function nextRound(r, vp, first = "a") {
  side(r, "a").vp = vp.a; side(r, "b").vp = vp.b;
  for (const rig of r.rigs) { rig.preparation = null; rig.activated = false; }
  r.game.phase = "initiative";
  r.game.turn = null;
  r.game.round += 1;
  const dice = first === "a" ? { a: 9, b: 2 } : { a: 2, b: 9 };
  applyCommand(r, { verb: "initiative", attrs: { dice } });
  assert.equal(r.game.phase, "activation");
}

// ---------------------------------------------------------------------------
// Grant
// ---------------------------------------------------------------------------

test("round 1 at 0-0: nobody gets Grit", () => {
  const r = startedRoom();
  assert.deepEqual(r.game.gritTokens, { a: 0, b: 0 });
  assert.ok(!r.game.resolutions.some((e) => e.kind === "grit"));
});

test("1 VP behind: no Grit", () => {
  const r = startedRoom();
  nextRound(r, { a: 0, b: 1 });
  assert.deepEqual(r.game.gritTokens, { a: 0, b: 0 });
  assert.equal(lastOf(r, "grit"), undefined);
});

test("2 VP behind: the trailing side gains 1 Grit token and it is logged", () => {
  const r = startedRoom();
  nextRound(r, { a: 1, b: 3 });
  assert.deepEqual(r.game.gritTokens, { a: 1, b: 0 });
  const e = lastOf(r, "grit");
  assert.equal(e.side, "a");
  assert.equal(e.amount, 1);
  assert.equal(e.summary, "Cyan is behind by 2 VP: +1 Grit token");
});

test("gritFor: 0 under 2, 1 for 2-4, 2 for 5-7, 3 for 8+", () => {
  const got = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 40].map(gritFor);
  assert.deepEqual(got, [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3]);
  assert.deepEqual(GRIT_SCALE, [{ gap: 2, tokens: 1 }, { gap: 5, tokens: 2 }, { gap: 8, tokens: 3 }]);
});

test("5 VP behind: 2 Grit tokens, logged with the amount", () => {
  const r = startedRoom();
  nextRound(r, { a: 5, b: 0 });
  assert.deepEqual(r.game.gritTokens, { a: 0, b: 2 });
  const e = lastOf(r, "grit");
  assert.equal(e.side, "b");
  assert.equal(e.amount, 2);
  assert.equal(e.summary, "Gold is behind by 5 VP: +2 Grit tokens");
});

test("8+ VP behind: 3 Grit tokens (the cap)", () => {
  const r = startedRoom();
  nextRound(r, { a: 1, b: 13 });
  assert.deepEqual(r.game.gritTokens, { a: 3, b: 0 });
  assert.equal(lastOf(r, "grit").amount, 3);
  assert.equal(lastOf(r, "grit").summary, "Cyan is behind by 12 VP: +3 Grit tokens");
});

test("a side can hold an Answer token and Grit tokens in the same round", () => {
  const r = startedRoom();
  nextRound(r, { a: 5, b: 0 }, "a"); // b is behind AND activates second
  assert.deepEqual(r.game.answerTokens, { a: 0, b: 1 });
  assert.deepEqual(r.game.gritTokens, { a: 0, b: 2 });
  assert.deepEqual(r.game.pendingAnswer, { side: "b", remaining: 1, grit: 2 });
});

test("unspent Grit is removed in Recovery", () => {
  const r = startedRoom();
  nextRound(r, { a: 0, b: 4 });
  assert.equal(r.game.gritTokens.a, 1);
  __test.runRecovery(r);
  assert.deepEqual(r.game.gritTokens, { a: 0, b: 0 });
});

// ---------------------------------------------------------------------------
// Spend + upgrade
// ---------------------------------------------------------------------------

test("spending Grit places an Improved face-down preparation and leaves Answer tokens alone", () => {
  const r = startedRoom();
  nextRound(r, { a: 3, b: 0 }, "a");
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "riposte", side: "b", grit: true } });
  assert.deepEqual(findRig(r, "b1").preparation, { type: "riposte", source: "grit", improved: true, faceUp: false });
  assert.equal(r.game.gritTokens.b, 0);
  assert.equal(r.game.answerTokens.b, 1);
  // The plain Answer still works and is not improved.
  applyCommand(r, { verb: "answer", attrs: { name: "b2", prep: "brace", side: "b" } });
  assert.deepEqual(findRig(r, "b2").preparation, { type: "brace", source: "answer", faceUp: false });
});

test("Grit with no Grit tokens is rejected", () => {
  const r = startedRoom();
  r.game.answerTokens.a = 1;
  const v = r.version;
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a", grit: true } });
  assert.equal(r.version, v);
  assert.equal(lastRejectionReason(), "No Grit tokens left.");
});

test("Grit upgrade improves an existing preparation, keeping its type and face-down state", () => {
  const r = startedRoom();
  r.game.gritTokens.a = 1;
  findRig(r, "a1").preparation = { type: "evasive", source: "action", faceUp: false };
  applyCommand(r, { verb: "answer", attrs: { name: "a1", side: "a", grit: true, upgrade: true } });
  assert.deepEqual(findRig(r, "a1").preparation, { type: "evasive", source: "action", faceUp: false, improved: true });
  assert.equal(r.game.gritTokens.a, 0);
});

test("Grit upgrade rejects a rig with no preparation, or one already improved", () => {
  const r = startedRoom();
  r.game.gritTokens.a = 2;
  let v = r.version;
  applyCommand(r, { verb: "answer", attrs: { name: "a1", side: "a", grit: true, upgrade: true } });
  assert.equal(r.version, v);
  assert.match(lastRejectionReason(), /no preparation/i);
  findRig(r, "a1").preparation = { type: "brace", source: "grit", improved: true, faceUp: false };
  v = r.version;
  applyCommand(r, { verb: "answer", attrs: { name: "a1", side: "a", grit: true, upgrade: true } });
  assert.equal(r.version, v);
  assert.match(lastRejectionReason(), /already improved/i);
  assert.equal(r.game.gritTokens.a, 2);
});

test("placing Grit on an already-prepared rig without `upgrade` is rejected", () => {
  const r = startedRoom();
  r.game.gritTokens.a = 1;
  findRig(r, "a1").preparation = { type: "brace", source: "action", faceUp: false };
  const v = r.version;
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "evasive", side: "a", grit: true } });
  assert.equal(r.version, v);
  assert.match(lastRejectionReason(), /already prepared/);
});

// ---------------------------------------------------------------------------
// The pendingAnswer gate
// ---------------------------------------------------------------------------

test("gate: the Answer side goes first, then the gate moves to the Grit side, then clears", () => {
  const r = startedRoom();
  nextRound(r, { a: 0, b: 3 }, "a"); // a behind (Grit), b second (Answer)
  assert.deepEqual(r.game.pendingAnswer, { side: "b", remaining: 1, grit: 0 });
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });
  assert.equal(r.game.turn.activeRigId, null, "activation is gated");
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } });
  assert.deepEqual(r.game.pendingAnswer, { side: "a", remaining: 0, grit: 1 });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "return", side: "a", grit: true } });
  assert.equal(r.game.pendingAnswer, null);
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });
  assert.equal(r.game.turn.activeRigId, findRig(r, "a1").id);
});

test("gate: one side holding both tokens clears only when both are spent", () => {
  const r = startedRoom();
  nextRound(r, { a: 4, b: 1 }, "a");
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } });
  assert.deepEqual(r.game.pendingAnswer, { side: "b", remaining: 0, grit: 1 });
  applyCommand(r, { verb: "answer", attrs: { name: "b1", side: "b", grit: true, upgrade: true } });
  assert.equal(r.game.pendingAnswer, null);
});

test("gate: several Grit tokens keep the gate open until each is spent", () => {
  const r = startedRoom();
  nextRound(r, { a: 9, b: 1 }, "a"); // b trails by 8: 3 Grit, plus the Answer token
  assert.deepEqual(r.game.pendingAnswer, { side: "b", remaining: 1, grit: 3 });
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } });
  assert.deepEqual(r.game.pendingAnswer, { side: "b", remaining: 0, grit: 3 });
  applyCommand(r, { verb: "answer", attrs: { name: "b2", prep: "evasive", side: "b", grit: true } });
  assert.deepEqual(r.game.pendingAnswer, { side: "b", remaining: 0, grit: 2 });
  applyCommand(r, { verb: "answer", attrs: { name: "b3", prep: "return", side: "b", grit: true } });
  assert.deepEqual(r.game.pendingAnswer, { side: "b", remaining: 0, grit: 1 });
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });
  assert.equal(r.game.turn.activeRigId, null, "still gated with a Grit token left");
  applyCommand(r, { verb: "answer", attrs: { name: "b1", side: "b", grit: true, upgrade: true } });
  assert.equal(r.game.pendingAnswer, null);
  assert.equal(r.game.gritTokens.b, 0);
  assert.ok(["b1", "b2", "b3"].every((n) => findRig(r, n).preparation.improved));
});

test("gate: leftover Grit with nothing left to improve releases the gate", () => {
  const r = startedRoom();
  nextRound(r, { a: 8, b: 0 }, "a"); // 3 Grit
  findRig(r, "b3").destroyed = true;
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } });
  applyCommand(r, { verb: "answer", attrs: { name: "b1", side: "b", grit: true, upgrade: true } });
  assert.deepEqual(r.game.pendingAnswer, { side: "b", remaining: 0, grit: 2 });
  applyCommand(r, { verb: "answer", attrs: { name: "b2", prep: "brace", side: "b", grit: true } });
  assert.equal(r.game.gritTokens.b, 1, "one token left over");
  assert.equal(r.game.pendingAnswer, null, "but no rig can take it");
});

test("gate: Grit with nothing eligible (every rig already improved) opens no gate", () => {
  const r = startedRoom();
  side(r, "b").vp = 3;
  for (const rig of r.rigs) rig.activated = false;
  r.game.phase = "initiative";
  r.game.round = 2;
  // Preparations survive into the roll only in this contrived setup.
  for (const n of ["a1", "a2", "a3"]) findRig(r, n).preparation = { type: "brace", source: "grit", improved: true, faceUp: false };
  applyCommand(r, { verb: "initiative", attrs: { dice: { a: 2, b: 9 } } }); // b first, a second
  assert.equal(r.game.gritTokens.a, 1);
  assert.equal(r.game.pendingAnswer, null, "no unprepared rig for the Answer, nothing to upgrade for the Grit");
});

// ---------------------------------------------------------------------------
// Improved effects
// ---------------------------------------------------------------------------

function duel() {
  const r = startedRoom();
  return { r, atk: findRig(r, "a1"), def: findRig(r, "b1") };
}

test("Improved Brace: −3 Penetration on front-arc wounds (plain Brace −2)", () => {
  const { atk, def } = duel();
  // The Sword, not the Mini Gun: a rake can't wound the front arc at all.
  const profile = effectiveWeaponProfile("melee", atk.weapons.melee, atk);
  def.preparation = { type: "brace", faceUp: false };
  const plain = effectivePenAgainst(atk, def, profile, "hull", { arc: "front" });
  def.preparation = { type: "brace", faceUp: false, improved: true };
  const imp = effectivePenAgainst(atk, def, profile, "hull", { arc: "front" });
  assert.equal(plain.braced, -2);
  assert.equal(imp.braced, -3);
  assert.equal(imp.effPen, plain.effPen - 1);
  // Side arc: Brace does nothing either way.
  assert.equal(effectivePenAgainst(atk, def, profile, "hull", { arc: "side" }).braced, 0);
});

test("Improved Raise Shield: side/rear −4 Penetration (plain −3)", () => {
  const { atk, def } = duel();
  const profile = effectiveWeaponProfile("longRange", atk.weapons.longRange, atk);
  def.weapons.melee = "Bulwark Shield";
  def.preparation = { type: "raise-shield", faceUp: true };
  assert.equal(effectivePenAgainst(atk, def, profile, "hull", { arc: "side" }).shieldBlunt, -3);
  def.preparation = { type: "raise-shield", faceUp: true, improved: true };
  assert.equal(effectivePenAgainst(atk, def, profile, "hull", { arc: "rear" }).shieldBlunt, -4);
  assert.equal(effectivePenAgainst(atk, def, profile, "hull", { arc: "front" }).shieldNegates, true);
});

// A digital room mid-activation: a1 facing b1 at 10", clear LoS.
function digitalFirefight() {
  const room = createRoom("DIG");
  room.mode = "digital";
  claimSide(room, { name: "Cyan", side: "a" });
  claimSide(room, { name: "Gold", side: "b" });
  for (const owner of ["a", "b"]) {
    applyCommand(room, { verb: "add", attrs: { name: `${owner}1`, class: "light", owner, longRange: "Autocannon", melee: "Claw" } });
  }
  room.field.terrain = [];
  room.game.started = true;
  room.game.phase = "activation";
  const a = findRig(room, "a1"); const b = findRig(room, "b1");
  room.game.turn = { side: "a", activeRigId: a.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  a.loaded = { longRange: true, melee: true };
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 20, y: 10 }; b.facing = 180;
  return { room, a, b };
}

for (const prep of ["evasive", "sidestep"]) {
  test(`Improved ${prep}: the digital dodge succeeds on a 3`, () => {
    const { room, b } = digitalFirefight();
    b.preparation = { type: prep, source: "grit", improved: true, faceUp: false };
    applyCommand(room, { verb: "action", attrs: { name: "a1", action: "fire", weapon: "longRange", target: "b1" } });
    assert.equal(room.game.pendingReaction?.kind, prep);
    const reveal = lastOf(room, "reaction");
    assert.equal(reveal.improved, true);
    assert.match(reveal.summary, /Improved/);
    const sp0 = b.hull.sp + b.arms.sp + b.legs.sp + b.engine.sp;
    applyCommand(room, { verb: "react", attrs: { side: "b" } }, {}, { random: () => 0.4 }); // → 3
    const roll = room.game.resolutions.find((e) => e.kind === "reaction" && e.rolls?.length);
    assert.equal(roll.rolls[0].value, 3);
    assert.equal(roll.improved, true);
    assert.match(roll.summary, /Improved/);
    assert.match(roll.summary, /dodged!/);
    assert.equal(b.hull.sp + b.arms.sp + b.legs.sp + b.engine.sp, sp0);
  });

  test(`plain ${prep}: a 3 is still caught`, () => {
    const { room, b } = digitalFirefight();
    b.preparation = { type: prep, source: "answer", faceUp: false };
    applyCommand(room, { verb: "action", attrs: { name: "a1", action: "fire", weapon: "longRange", target: "b1" } });
    applyCommand(room, { verb: "react", attrs: { side: "b" } }, {}, { random: () => 0.4 }); // → 3
    const roll = room.game.resolutions.find((e) => e.kind === "reaction" && e.rolls?.length);
    assert.match(roll.summary, /rolled 3, caught/);
    assert.ok(!roll.improved);
  });
}

test("Improved Evasive narrates a full-Speed move on a physical table", () => {
  const r = startedRoom();
  findRig(r, "a1").preparation = { type: "evasive", source: "grit", improved: true, faceUp: false };
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near" } });
  const reveal = lastOf(r, "reaction");
  assert.equal(reveal.improved, true);
  assert.match(reveal.summary, /Improved Evasive/);
  assert.ok(reveal.effects.some((e) => /full Speed/.test(e)));
});

// Medium Atk (Mini Gun/Sword) attacks medium Def (Autocannon/Sword), Def holds `prep`.
function battleWithPreparedDefender(prep, improved) {
  const room = createRoom("PREP01");
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Atk", class: "medium", owner: "a", longRange: "Mini Gun", melee: "Sword" } });
  applyCommand(room, { verb: "add", attrs: { name: "Def", class: "medium", owner: "b", longRange: "Autocannon", melee: "Sword" } });
  const a = findRig(room, "Atk"); const b = findRig(room, "Def");
  b.preparation = { type: prep, source: improved ? "grit" : "answer", faceUp: false, ...(improved ? { improved: true } : {}) };
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: a.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  a.loaded = { longRange: true, melee: true };
  return { room, a, b };
}

const counterWoundTerms = (room) => {
  const atk = [...room.game.resolutions].reverse().find((e) => e.kind === "attack" && e.breakdown);
  return atk.breakdown.steps.find((s) => s.kind === "wound").terms;
};

const COUNTERS = {
  return: { weapon: "longRange", counter: { weapon: "melee" } },
  riposte: { weapon: "melee", counter: { weapon: "melee" } },
  exploit: { weapon: "longRange", counter: { weapon: "longRange", loc: "arms" }, final: true },
};
for (const [prep, cfg] of Object.entries(COUNTERS)) {
  for (const improved of [true, false]) {
    test(`${improved ? "Improved" : "plain"} ${prep}: the counter-attack ${improved ? "gets" : "does not get"} +2 Penetration`, () => {
      const { room } = battleWithPreparedDefender(prep, improved);
      if (cfg.final) room.game.turn.actionsUsed = 2;
      applyCommand(room, { verb: "action", attrs: {
        name: "Atk", action: "fire", target: "Def", weapon: cfg.weapon, arc: "front", range: "near",
        dice: { toHit: [1, 1, 1, 1], location: 1, wounds: [1, 1, 1, 1] },
      } });
      assert.equal(room.game.pendingReaction?.kind, prep);
      const reveal = lastOf(room, "reaction");
      assert.equal(!!reveal.improved, improved);
      if (improved) assert.match(reveal.summary, /Improved/);
      applyCommand(room, { verb: "react", attrs: {
        side: "b", attack: { ...cfg.counter, arc: "front", range: "near",
          dice: { toHit: [6, 6, 6, 6], location: 1, wounds: [5, 5, 5, 5] } },
      } });
      const term = counterWoundTerms(room).find((t) => t.label === "improved");
      if (improved) assert.deepEqual(term, { label: "improved", value: 2 });
      else assert.equal(term, undefined);
    });
  }
}

// ---------------------------------------------------------------------------
// Hidden info
// ---------------------------------------------------------------------------

test("publicState: both sides see Grit counts; only the owner sees a face-down Improved prep", () => {
  const r = startedRoom();
  nextRound(r, { a: 0, b: 2 }, "a");
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a", grit: true } });
  const mine = publicState(r, "a");
  const theirs = publicState(r, "b");
  assert.deepEqual(theirs.game.gritTokens, mine.game.gritTokens);
  const ownA1 = mine.rigs.find((x) => x.name === "a1");
  const foeA1 = theirs.rigs.find((x) => x.name === "a1");
  assert.equal(ownA1.preparation.improved, true);
  assert.deepEqual(foeA1.preparation, { hidden: true });
  assert.equal(rigModifiers(ownA1).find((m) => m.key === "prep").tag, "Improved Brace");
  assert.equal(rigModifiers(foeA1).find((m) => m.key === "prep").tag, "Reaction set");
});

test("an upgraded face-down prep stays masked for the opponent", () => {
  const r = startedRoom();
  r.game.gritTokens.a = 1;
  findRig(r, "a2").preparation = { type: "return", source: "action", faceUp: false };
  applyCommand(r, { verb: "answer", attrs: { name: "a2", side: "a", grit: true, upgrade: true } });
  assert.deepEqual(publicState(r, "b").rigs.find((x) => x.name === "a2").preparation, { hidden: true });
  assert.equal(rigModifiers(publicState(r, "a").rigs.find((x) => x.name === "a2")).find((m) => m.key === "prep").tag, "Improved Return Fire");
});

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

function botGate({ prepared, grit = 1 }) {
  const { room } = digitalFirefight();
  for (const [n, x, y] of [["b2", 5, 25], ["b3", 2, 2]]) {
    applyCommand(room, { verb: "add", attrs: { name: n, class: "light", owner: "b", longRange: "Autocannon", melee: "Claw" } });
    const rig = findRig(room, n); rig.pos = { x, y }; rig.facing = 180;
  }
  side(room, "b").bot = "normal";
  const bs = room.rigs.filter((r) => r.owner === "b");
  if (prepared) for (const rig of bs) rig.preparation = { type: "brace", source: "action", faceUp: false };
  room.game.turn = { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 0 };
  room.game.gritTokens = { a: 0, b: grit };
  room.game.pendingAnswer = { side: "b", remaining: 0, grit };
  return { room, bs };
}

test("bot spends Grit on an unprepared rig as an Improved Brace", () => {
  const { room, bs } = botGate({ prepared: false });
  driveBots(room, { random: () => 0.5 });
  assert.equal(room.game.pendingAnswer, null);
  assert.equal(room.game.gritTokens.b, 0);
  const imp = bs.filter((r) => r.preparation?.improved);
  assert.equal(imp.length, 1);
  assert.deepEqual(imp[0].preparation, { type: "brace", source: "grit", improved: true, faceUp: false });
});

test("bot with every rig prepared upgrades the most threatened one", () => {
  const { room, bs } = botGate({ prepared: true });
  driveBots(room, { random: () => 0.5 });
  assert.equal(room.game.pendingAnswer, null);
  const imp = bs.filter((r) => r.preparation?.improved);
  assert.equal(imp.length, 1);
  assert.equal(imp[0].name, "b1", "b1 sits in a1's sights; b2/b3 are out of its arc");
});

test("bot spends every Grit token: Improved preps on all unprepared rigs", () => {
  const { room, bs } = botGate({ prepared: false, grit: 3 });
  driveBots(room, { random: () => 0.5 });
  assert.equal(room.game.pendingAnswer, null);
  assert.equal(room.game.gritTokens.b, 0);
  assert.ok(bs.every((r) => r.preparation?.improved && r.preparation.source === "grit"));
});

test("bot places Grit on unprepared rigs first, then upgrades by exposure", () => {
  const { room, bs } = botGate({ prepared: true, grit: 2 });
  const b3 = bs.find((r) => r.name === "b3");
  b3.preparation = null;
  driveBots(room, { random: () => 0.5 });
  assert.equal(room.game.gritTokens.b, 0);
  assert.deepEqual(b3.preparation, { type: "brace", source: "grit", improved: true, faceUp: false });
  const upgraded = bs.filter((r) => r.preparation?.improved && r.preparation.source === "action");
  assert.deepEqual(upgraded.map((r) => r.name), ["b1"], "the exposed rig takes the upgrade");
});

test("a bot-vs-bot game with a VP gap spends Grit and doesn't stall", async () => {
  const { playMatch, mulberry32 } = await import("./sim/match.js");
  const { tierSquad } = await import("./sim/tiers.js");
  const rnd = mulberry32(3);
  const a = tierSquad("normal", [], rnd); const b = tierSquad("normal", a.map((u) => u.chassis), rnd);
  // Find a seed whose game hands out Grit (most do); the game must finish.
  let spent = 0, granted = 0, finished = 0;
  for (const seed of [1, 2, 3]) {
    const res = playMatch({ squads: { a, b }, weights: { a: "normal", b: "normal" }, seed, table: { width: 42, height: 28 }, record: true });
    if (res.finished) finished++;
    for (const f of res.frames) {
      if (f.cmd?.verb === "answer" && f.cmd.attrs?.grit) spent++;
      // A token needs a living rig to land on: spendable = min(granted, alive).
      for (const l of f.log || []) {
        if (l.kind === "grit") granted += Math.min(l.amount, f.rigs.filter((r) => r.owner === l.side && !r.destroyed).length);
      }
    }
  }
  assert.equal(finished, 3);
  assert.ok(granted > 0, "some Grit was granted");
  assert.equal(spent, granted, "every spendable Grit granted to a bot gets spent (the gate forces it)");
});
