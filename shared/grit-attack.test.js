// Grit, wr-0.15: a Grit token may be spent OFFENSIVELY (a Gritted attack: every
// missed to-hit die is rerolled once), a side may Keep its Grit for attacks at
// the round-start gate, and the grant is capped at the side's living rigs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, claimSide, applyCommand, findRig, lastRejectionReason, deriveAttackGeometry,
} from "./game-state.js";
import { expectedDamage, rawExpectedHits } from "./bot/evaluate.js";
import { chooseAction, GRIT_SHOT_MIN_GAIN } from "./bot/index.js";

const W = { lr: "Mini Gun", melee: "Sword" };
const side = (r, id) => r.game.sides.find((s) => s.id === id);
const lastOf = (r, kind) => [...r.game.resolutions].reverse().find((e) => e.kind === kind);

// A physical 3v3 room, started, with the round-1 Answer gate cleared.
function startedRoom() {
  const r = createRoom("GRITA");
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

// Atk (Autocannon / Sword) mid-activation against Def, physical table.
function duel(grit = 1) {
  const room = createRoom("GRITD");
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Atk", class: "medium", owner: "a", longRange: "Autocannon", melee: "Sword" } });
  applyCommand(room, { verb: "add", attrs: { name: "Def", class: "medium", owner: "b", longRange: "Mini Gun", melee: "Claw" } });
  const a = findRig(room, "Atk");
  room.game.started = true;
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: a.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  room.game.gritTokens = { a: grit, b: 0 };
  a.loaded = { longRange: true, melee: true };
  return { room, a, def: findRig(room, "Def") };
}

const swing = (extra = {}) => ({
  verb: "action",
  attrs: { name: "Atk", action: "fire", target: "Def", weapon: "melee", arc: "front", range: "near", ...extra },
});
const hitStep = (room) => lastOf(room, "attack").breakdown.steps.find((s) => s.kind === "hit");

// ---------------------------------------------------------------------------
// Gritted attack
// ---------------------------------------------------------------------------

test("a Gritted melee Fire spends a token and rerolls only the missed die", () => {
  const { room } = duel(1);
  // Sword hits on 4+: the 1 misses and is rerolled into a 5; the 6 stands.
  applyCommand(room, swing({ grit: true, dice: { toHit: { 0: 1, 1: 6, rerolls: [5] }, location: 1, wounds: [1, 1] } }));
  assert.equal(room.game.gritTokens.a, 0);
  const step = hitStep(room);
  assert.equal(step.grit, true);
  assert.deepEqual(step.dice, [{ value: 5, ok: true, rerolledFrom: 1 }, { value: 6, ok: true }]);
  assert.equal(step.out, "2 of 2 hit");
  const res = lastOf(room, "attack");
  assert.equal(res.grit, true);
  assert.ok(res.effects.includes("Grit: rerolled 1 missed die"), res.effects.join(" | "));
});

test("a rerolled die that misses again stays a miss", () => {
  const { room } = duel(1);
  applyCommand(room, swing({ grit: true, dice: { toHit: { 0: 2, 1: 1, rerolls: [6, 3] }, location: 1, wounds: [1, 1] } }));
  const step = hitStep(room);
  assert.deepEqual(step.dice, [{ value: 6, ok: true, rerolledFrom: 2 }, { value: 3, ok: false, rerolledFrom: 1 }]);
  assert.equal(step.out, "1 of 2 hit");
  assert.ok(lastOf(room, "attack").effects.includes("Grit: rerolled 2 missed dice"));
});

test("a Gritted Aimed Shot: the natural-6 rule applies to the reroll", () => {
  const { room } = duel(1);
  // Aimed: 4+ base, −3 aim penalty → needs 7, so only natural 6s land.
  applyCommand(room, { verb: "action", attrs: {
    name: "Atk", action: "aimed", target: "Def", weapon: "longRange", loc: "arms", arc: "front", distance: 8, grit: true,
    dice: { toHit: { 0: 6, 1: 5, 2: 1, 3: 2, rerolls: [6, 5, 5] }, wounds: [1, 1, 1, 1] },
  } });
  const step = hitStep(room);
  assert.equal(step.target, 7);
  assert.equal(step.grit, true);
  assert.deepEqual(step.dice, [
    { value: 6, ok: true },
    { value: 6, ok: true, rerolledFrom: 5 },
    { value: 5, ok: false, rerolledFrom: 1 },
    { value: 5, ok: false, rerolledFrom: 2 },
  ]);
  assert.equal(room.game.gritTokens.a, 0);
  assert.equal(lastOf(room, "attack").grit, true);
});

test("an attack without grit rerolls nothing and carries no Grit fields", () => {
  const { room } = duel(1);
  applyCommand(room, swing({ dice: { toHit: { 0: 1, 1: 6, rerolls: [5] }, location: 1, wounds: [1, 1] } }));
  const step = hitStep(room);
  assert.equal(step.grit, undefined);
  assert.deepEqual(step.dice, [{ value: 1, ok: false }, { value: 6, ok: true }]);
  assert.equal(lastOf(room, "attack").grit, undefined);
  assert.equal(room.game.gritTokens.a, 1, "the token is untouched");
});

test("a Gritted attack with no Grit tokens is rejected and costs nothing", () => {
  const { room } = duel(0);
  const v = room.version;
  applyCommand(room, swing({ grit: true, dice: { toHit: [1, 6] } }));
  assert.equal(room.version, v);
  assert.equal(lastRejectionReason(), "No Grit tokens left.");
  assert.equal(room.game.turn.actionsUsed, 0);
  assert.equal(lastOf(room, "attack"), undefined);
});

test("a Gritted shot into an Evasive dodge spends exactly one token either way", () => {
  for (const [roll, dodged] of [[0.99, true], [0.1, false]]) {
    const room = createRoom("GRITE");
    room.mode = "digital";
    claimSide(room, { name: "A", side: "a" });
    claimSide(room, { name: "B", side: "b" });
    for (const owner of ["a", "b"]) {
      applyCommand(room, { verb: "add", attrs: { name: `${owner}1`, class: "light", owner, longRange: "Autocannon", melee: "Claw" } });
    }
    room.field.terrain = [];
    room.game.started = true;
    room.game.phase = "activation";
    const a = findRig(room, "a1"); const b = findRig(room, "b1");
    room.game.turn = { side: "a", activeRigId: a.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
    room.game.gritTokens = { a: 2, b: 0 };
    a.loaded = { longRange: true, melee: true };
    a.pos = { x: 10, y: 10 }; a.facing = 0;
    b.pos = { x: 20, y: 10 }; b.facing = 180;
    b.preparation = { type: "evasive", source: "answer", faceUp: false };
    applyCommand(room, { verb: "action", attrs: { name: "a1", action: "fire", weapon: "longRange", target: "b1", grit: true } });
    assert.equal(room.game.pendingReaction?.kind, "evasive");
    applyCommand(room, { verb: "react", attrs: { side: "b" } }, {}, { random: () => roll });
    assert.equal(room.game.gritTokens.a, 1, `dodged=${dodged}: one token spent`);
    if (!dodged) assert.equal(lastOf(room, "attack").grit, true);
  }
});

// ---------------------------------------------------------------------------
// Expected damage
// ---------------------------------------------------------------------------

test("expectedDamage `grit` option prices the reroll as 1-(1-p)^2 per die", () => {
  const { a, def } = duel(1);
  const shot = { arc: "front", distance: 8 };
  const plainHits = rawExpectedHits(a, def, "longRange", shot);
  const gritHits = rawExpectedHits(a, def, "longRange", { ...shot, grit: true });
  const rof = 4;
  const p = plainHits / rof;
  assert.ok(Math.abs(gritHits - rof * (1 - (1 - p) ** 2)) < 1e-9);
  const plain = expectedDamage(a, def, "longRange", shot);
  const grit = expectedDamage(a, def, "longRange", { ...shot, grit: true });
  assert.ok(grit > plain);
  assert.ok(Math.abs(grit / plain - gritHits / plainHits) < 1e-9);
});

// ---------------------------------------------------------------------------
// Keep for attacks
// ---------------------------------------------------------------------------

test("keep: a Grit-only side clears its gate and holds its tokens", () => {
  const r = startedRoom();
  nextRound(r, { a: 0, b: 3 }, "a"); // a behind (Grit), b second (Answer)
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } });
  assert.deepEqual(r.game.pendingAnswer, { side: "a", remaining: 0, grit: 1 });
  applyCommand(r, { verb: "answer", attrs: { side: "a", keep: true } });
  assert.equal(r.game.pendingAnswer, null);
  assert.equal(r.game.gritTokens.a, 1, "tokens stay for Gritted attacks");
  assert.equal(r.game.gritKept.a, true);
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });
  assert.equal(r.game.turn.activeRigId, findRig(r, "a1").id);
});

test("keep: Answer tokens still prompt; Grit is not asked for again this round", () => {
  const r = startedRoom();
  nextRound(r, { a: 4, b: 1 }, "a"); // b behind by 3 AND second: Answer + Grit
  assert.deepEqual(r.game.pendingAnswer, { side: "b", remaining: 1, grit: 1 });
  applyCommand(r, { verb: "answer", attrs: { side: "b", keep: true } });
  assert.deepEqual(r.game.pendingAnswer, { side: "b", remaining: 1, grit: 0 });
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } });
  assert.equal(r.game.pendingAnswer, null, "the kept Grit doesn't re-open the gate");
  assert.equal(r.game.gritTokens.b, 1);
});

test("keep with no Grit tokens is rejected", () => {
  const r = startedRoom();
  nextRound(r, { a: 0, b: 0 }, "a");
  const v = r.version;
  applyCommand(r, { verb: "answer", attrs: { side: "b", keep: true } });
  assert.equal(r.version, v);
  assert.equal(lastRejectionReason(), "No Grit tokens to keep.");
});

test("keep lasts one round: the next round's grant prompts again", () => {
  const r = startedRoom();
  nextRound(r, { a: 0, b: 3 }, "b"); // a behind and second
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { side: "a", keep: true } });
  assert.equal(r.game.pendingAnswer, null);
  nextRound(r, { a: 0, b: 3 }, "a");
  assert.equal(r.game.gritKept.a, false);
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } });
  assert.deepEqual(r.game.pendingAnswer, { side: "a", remaining: 0, grit: 1 });
});

test("a kept token can then power a Gritted attack", () => {
  const r = startedRoom();
  nextRound(r, { a: 0, b: 3 }, "a");
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } });
  applyCommand(r, { verb: "answer", attrs: { side: "a", keep: true } });
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "a1", action: "fire", target: "b2", weapon: "melee", arc: "front", range: "near", grit: true,
    dice: { toHit: { 0: 1, 1: 1, rerolls: [6, 6] }, location: 1, wounds: [1, 1] },
  } });
  assert.equal(r.game.gritTokens.a, 0);
  assert.equal(hitStep(r).grit, true);
});

// ---------------------------------------------------------------------------
// Cap by living rigs
// ---------------------------------------------------------------------------

test("the Grit grant is capped at the trailing side's living rigs", () => {
  const r = startedRoom();
  findRig(r, "a2").destroyed = true;
  findRig(r, "a3").destroyed = true;
  nextRound(r, { a: 1, b: 13 });
  assert.equal(r.game.gritTokens.a, 1);
  assert.equal(lastOf(r, "grit").amount, 1);
  assert.equal(lastOf(r, "grit").summary, "Cyan is behind by 12 VP: +1 Grit token");
});

test("the cap doesn't bite with every rig alive", () => {
  const r = startedRoom();
  findRig(r, "a3").destroyed = true;
  nextRound(r, { a: 0, b: 5 });
  assert.equal(r.game.gritTokens.a, 2);
});

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

// A digital room where bot side a has one rig (a1) facing b1 at 10", mid-activation.
function botShooter(grit) {
  const room = createRoom("GRITB");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  for (const owner of ["a", "b"]) {
    applyCommand(room, { verb: "add", attrs: { name: `${owner}1`, class: "light", owner, longRange: "Autocannon", melee: "Claw" } });
  }
  room.field.terrain = [];
  room.game.started = true;
  room.game.phase = "activation";
  side(room, "a").bot = "normal";
  const a = findRig(room, "a1"); const b = findRig(room, "b1");
  room.game.turn = { side: "a", activeRigId: a.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  room.game.gritTokens = { a: grit, b: 0 };
  a.loaded = { longRange: true, melee: true };
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 18, y: 10 }; b.facing = 180;
  return { room, a, b };
}

// A shooter's weights: offence only, never walk (so the pick is a shot).
const SHOOTER = { damage: 1, b_move: -100, b_sprint: -100, b_prepare: -100, b_special: -100 };

test("bot: its last rig spends a Grit token on its shot", () => {
  const { room, a } = botShooter(1);
  const cmd = chooseAction(room, a, SHOOTER);
  assert.ok(cmd.attrs.action === "fire" || cmd.attrs.action === "aimed", JSON.stringify(cmd));
  assert.equal(cmd.attrs.grit, true);
});

test("bot: with more rigs to act than tokens, only a high-gain shot spends the token", () => {
  const at = (x) => {
    const { room, a, b } = botShooter(1);
    for (const n of ["a2", "a3"]) {
      applyCommand(room, { verb: "add", attrs: { name: n, class: "light", owner: "a", longRange: "Mini Gun", melee: "Sword" } });
      findRig(room, n).pos = { x: 2, y: 25 };
    }
    b.pos = { x, y: 10 };
    const cmd = chooseAction(room, a, SHOOTER);
    assert.equal(cmd.attrs.weapon, "longRange");
    const shot = { ...deriveAttackGeometry(room, a, b), ...(cmd.attrs.action === "aimed" ? { aimed: true, location: cmd.attrs.loc } : {}) };
    const gain = expectedDamage(a, b, "longRange", { ...shot, grit: true }) - expectedDamage(a, b, "longRange", shot);
    return { gain, grit: cmd.attrs.grit === true };
  };
  const near = at(18); // 8": the Autocannon's sweet spot
  assert.ok(near.gain >= GRIT_SHOT_MIN_GAIN);
  assert.equal(near.grit, true);
  const far = at(34); // 24": long range, few dice worth rerolling
  assert.ok(far.gain < GRIT_SHOT_MIN_GAIN);
  assert.equal(far.grit, false);
});

test("bot: no Grit tokens, no Gritted shot", () => {
  const { room, a } = botShooter(0);
  const cmd = chooseAction(room, a, SHOOTER);
  assert.ok(cmd.attrs.action === "fire" || cmd.attrs.action === "aimed");
  assert.equal(cmd.attrs.grit, undefined);
});

test("a bot-vs-bot game with a VP gap spends Grit on attacks and doesn't stall", async () => {
  const { playMatch, mulberry32 } = await import("./sim/match.js");
  const { tierSquad } = await import("./sim/tiers.js");
  const rnd = mulberry32(3);
  const a = tierSquad("normal", [], rnd); const b = tierSquad("normal", a.map((u) => u.chassis), rnd);
  let offensive = 0, finished = 0;
  for (const seed of [1, 2, 3]) {
    const res = playMatch({ squads: { a, b }, weights: { a: "normal", b: "normal" }, seed, table: { width: 42, height: 28 }, record: true });
    if (res.finished) finished++;
    for (const f of res.frames) if (f.cmd?.verb === "action" && f.cmd.attrs?.grit) offensive++;
  }
  assert.equal(finished, 3);
  assert.ok(offensive > 0, "some attacks were Gritted");
});
