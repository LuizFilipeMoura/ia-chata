// Campaign missions (docs/design/campaign.md): the `mission` verb builds a
// started digital room from two squads, side modifiers and a contract type,
// and each type carries its own win condition.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, applyCommand, lastRejectionReason, findRig, heatMeter,
  effectiveWeaponProfile, __test,
} from "./game-state.js";
import { aimBreakdown } from "./combat.js";
import { driveBots } from "./bot/index.js";
import { mulberry32 } from "./sim/match.js";

const A = [
  { uid: "u1", name: "Gold", chassis: "light-claw-autocannon" },
  { uid: "u2", name: "Copper", chassis: "medium-lance-mortar" },
];
const B = [
  { name: "Red", chassis: "medium-sniper-chainsaw" },
  { name: "Blue", chassis: "light-missile-flamethrower" },
];

function mission(attrs = {}, seed = 7) {
  const room = createRoom("CAMP-T");
  applyCommand(room, { verb: "mission", attrs: { type: "skirmish", seed, squads: { a: A, b: B }, ...attrs } },
    { side: "a" }, { random: mulberry32(seed) });
  return room;
}

const act = (room, name, attrs) => applyCommand(room, { verb: "action", attrs: { name, ...attrs } }, { side: findRig(room, name).owner });
const activate = (room, name) => applyCommand(room, { verb: "activate", attrs: { name } }, { side: findRig(room, name).owner });
const endAct = (room, name) => applyCommand(room, { verb: "endactivation", attrs: { name } }, { side: findRig(room, name).owner });

function yourTurn(room, name) {
  const rig = findRig(room, name);
  room.game.phase = "activation";
  room.game.turn = { side: rig.owner, activeRigId: null, actionsUsed: 0, actionsMax: 0 };
  room.game.pendingAnswer = null;
  assert.ok(activate(room, name).game.turn.activeRigId === rig.id, lastRejectionReason() || "activate");
  return rig;
}

test("mission builds a started digital room with both squads deployed", () => {
  const room = mission({ maxRounds: 6, enemyBot: "hard" });
  assert.equal(room.mode, "digital");
  assert.equal(room.game.started, true);
  assert.equal(room.game.maxRounds, 6);
  assert.equal(room.rigs.length, 4);
  assert.ok(room.rigs.every((r) => r.pos && Number.isFinite(r.pos.x) && r.pos.x > 0));
  assert.ok(room.field.terrain.length > 0);
  assert.equal(room.game.sides.find((s) => s.id === "b").bot, "hard");
  assert.equal(room.game.sides.find((s) => s.id === "a").bot, null);
  assert.equal(room.campaign.type, "skirmish");
  assert.equal(findRig(room, "Gold").campaignUid, "u1");
  assert.deepEqual(room.game.objectives, [{ x: 21, y: 14, vp: 2 }]); // skirmish: one centre beacon
});

test("beacons keeps the standard objectives; same seed → same table", () => {
  const r1 = mission({ type: "beacons" }, 11);
  const r2 = mission({ type: "beacons" }, 11);
  assert.ok(r1.game.objectives.length >= 1);
  assert.deepEqual(r1.field.terrain, r2.field.terrain);
  assert.deepEqual(r1.rigs.map((r) => r.pos), r2.rigs.map((r) => r.pos));
});

test("mission rejects an unknown type, an unknown chassis, and two Prototypes on one rig", () => {
  const room = createRoom("CAMP-X");
  applyCommand(room, { verb: "mission", attrs: { type: "escort", squads: { a: A, b: B } } });
  assert.match(lastRejectionReason(), /mission type/i);
  applyCommand(room, { verb: "mission", attrs: { type: "skirmish", squads: { a: [{ name: "X", chassis: "nope" }], b: B } } });
  assert.match(lastRejectionReason(), /chassis/i);
  applyCommand(room, { verb: "mission", attrs: { type: "skirmish", squads: { a: [{
    name: "Gold", chassis: "light-claw-autocannon",
    equipment: "radiator-array", equipmentUpgrade: "cryo-reservoir",
    longRangeUpgrade: "ap-shells-nope",
  }], b: B } } });
  assert.match(lastRejectionReason(), /upgrade/i);
  assert.equal(room.game.started, false);
});

test("carried SP, commander multiplier and SP mods are baked into the rigs", () => {
  const room = mission({
    type: "assassinate",
    squads: {
      a: [{ ...A[0], sp: { hull: 5, arms: 11, legs: 2, engine: 9 } }, A[1]],
      b: [{ ...B[0], commander: true, spMult: 1.5 }, B[1]],
    },
    mods: { a: { sp: { legs: 1 } }, b: {} },
  });
  const gold = findRig(room, "Gold");
  assert.equal(gold.hull.sp, 5);
  assert.equal(gold.legs.sp, 3);           // carried 2 + 1 mod
  assert.equal(gold.legs.max, 12);         // chassis 11 + 1 mod
  const red = findRig(room, "Red");
  assert.equal(red.hull.max, 18);          // 12 × 1.5
  assert.equal(red.hull.sp, 18);
  assert.equal(room.campaign.commanderId, red.id);
});

test("side mods: speed, start heat, heat capacity, penetration, accuracy", () => {
  const room = mission({ mods: { a: { speed: 1, startHeat: 2, heatCap: 1, pen: { ranged: 1, melee: 2 }, acc: 1 }, b: {} } });
  const gold = findRig(room, "Gold");
  assert.equal(gold.speed, 6);
  assert.equal(gold.engine.heat, 2);
  assert.equal(heatMeter(gold).cap, 7);    // light 6 + 1
  assert.equal(effectiveWeaponProfile("longRange", "Autocannon", gold).pen, 8);
  assert.equal(effectiveWeaponProfile("melee", "Claw", gold).pen, 9);
  const base = aimBreakdown(findRig(room, "Red"), effectiveWeaponProfile("longRange", "Sniper Cannon", findRig(room, "Red")), { distance: 10 }).value;
  const buffed = aimBreakdown(gold, { ...effectiveWeaponProfile("longRange", "Sniper Cannon", findRig(room, "Red")) }, { distance: 10 }).value;
  assert.equal(base - buffed, 1);
});

test("perk kits graft a perk onto the weapon profile", () => {
  const room = mission({ squads: { a: [{ ...A[0], perkKits: { longRange: "Incendiary", melee: "Rend" } }, A[1]], b: B } });
  const gold = findRig(room, "Gold");
  assert.ok(effectiveWeaponProfile("longRange", "Autocannon", gold).perks.includes("Incendiary"));
  assert.ok(effectiveWeaponProfile("melee", "Claw", gold).perks.includes("Rend"));
});

test("answer mod adds tokens every round; grit mod seeds tokens at the start", () => {
  const room = mission({ mods: { a: { answer: 1, grit: 2 }, b: {} } });
  const second = room.game.initiative.second;
  assert.equal(room.game.answerTokens.a, (second === "a" ? 1 : 0) + 1);
  assert.equal(room.game.gritTokens.a, 2);
});

test("maxRounds ends the battle on points at the campaign limit", () => {
  const room = mission({ maxRounds: 3 });
  room.game.round = 3;
  room.game.sides[0].vp = 4;
  __test.advanceRound(room, Math.random);
  assert.equal(room.game.outcome?.winner, "a");
  assert.equal(room.game.outcome?.reason, "points");
});

test("assassinate: wrecking the commander wins at once; the limit loses", () => {
  const room = mission({ type: "assassinate", squads: { a: A, b: [{ ...B[0], commander: true }, B[1]] } });
  const red = findRig(room, "Red");
  __test.applyDamage(room, red, "engine", 99, { random: Math.random });
  assert.deepEqual(room.game.outcome, { winner: "a", reason: "commander" });

  const late = mission({ type: "assassinate", maxRounds: 2, squads: { a: A, b: [{ ...B[0], commander: true }, B[1]] } });
  late.game.round = 2;
  late.game.sides[0].vp = 9;
  __test.advanceRound(late, Math.random);
  assert.deepEqual(late.game.outcome, { winner: "b", reason: "timeout" });
});

test("maxRounds 0 means no round limit: the Warlord fight runs until someone falls", () => {
  const room = mission({ type: "boss", maxRounds: 0, squads: { a: A, b: [{ ...B[0], commander: true }, B[1]] } });
  assert.equal(room.game.maxRounds, 0);
  room.game.round = 40;
  __test.advanceRound(room, Math.random);
  assert.equal(room.game.outcome, null);
  assert.equal(room.game.round, 41);
});

test("last stand: surviving to the limit wins, reinforcements arrive on schedule", () => {
  const room = mission({
    type: "laststand", maxRounds: 4,
    reinforcements: [{ round: 2, unit: { name: "Silver", chassis: "medium-crossbow-talon" } }],
  });
  assert.equal(room.rigs.length, 4);
  __test.advanceRound(room, Math.random);
  assert.equal(room.game.round, 2);
  const silver = findRig(room, "Silver");
  assert.ok(silver && silver.owner === "b" && silver.pos);
  assert.ok(room.game.resolutions.some((r) => r.kind === "reinforcement"));
  room.game.round = 4;
  room.game.sides[1].vp = 20;
  __test.advanceRound(room, Math.random);
  assert.deepEqual(room.game.outcome, { winner: "a", reason: "survived" });
});

test("breakthrough: Extract inside the exit zone lifts the rig off; the goal wins", () => {
  const room = mission({ type: "breakthrough", extractGoal: 2 });
  const { exit } = room.campaign;
  assert.ok(exit && exit.r > 0);
  const gold = yourTurn(room, "Gold");
  act(room, "Gold", { action: "extract" });
  assert.match(lastRejectionReason(), /extraction zone/i);
  gold.pos = { x: exit.x + (exit.x > 1 ? -1.5 : 1.5), y: exit.y + (exit.y > 1 ? -1.5 : 1.5) };
  act(room, "Gold", { action: "extract" });
  assert.equal(findRig(room, "Gold"), null);
  assert.equal(room.campaign.extracted.a.length, 1);
  assert.equal(room.campaign.extracted.a[0].campaignUid, "u1");
  assert.ok(room.game.resolutions.some((r) => r.kind === "extract"));
  assert.equal(room.game.outcome, null);
  const copper = yourTurn(room, "Copper");
  copper.pos = { x: exit.x + (exit.x > 1 ? -2 : 2), y: exit.y + (exit.y > 1 ? -2 : 2) };
  act(room, "Copper", { action: "extract" });
  assert.deepEqual(room.game.outcome, { winner: "a", reason: "extraction" });
});

test("extract is refused outside a breakthrough", () => {
  const room = mission();
  yourTurn(room, "Gold");
  act(room, "Gold", { action: "extract" });
  assert.match(lastRejectionReason(), /extract/i);
});

test("salvage: a rig ending its activation by a crate claims it for VP", () => {
  const room = mission({ type: "salvage", crates: 3 });
  const crates = room.game.objectives.filter((o) => o.crate);
  assert.equal(crates.length, 3);
  const gold = yourTurn(room, "Gold");
  gold.pos = { x: crates[0].x + 1, y: crates[0].y };
  const vp0 = room.game.sides[0].vp;
  endAct(room, "Gold");
  assert.equal(room.campaign.crates.a, 1);
  assert.equal(room.game.sides[0].vp, vp0 + 2);
  assert.equal(room.game.objectives.filter((o) => o.crate).length, 2);
  assert.ok(room.game.resolutions.some((r) => r.kind === "crate"));
});

for (const type of ["beacons", "skirmish", "assassinate", "breakthrough", "laststand", "salvage", "boss"]) {
  test(`bot vs bot plays a ${type} mission to the end`, () => {
    const seed = 3;
    const room = mission({
      type, maxRounds: 4, enemyBot: "normal", extractGoal: 1, crates: 3,
      squads: { a: A, b: [{ ...B[0], commander: type === "assassinate" || type === "boss" }, B[1]] },
      reinforcements: type === "laststand" ? [{ round: 2, unit: { name: "Silver", chassis: "medium-crossbow-talon" } }] : [],
    }, seed);
    room.game.sides.find((s) => s.id === "a").bot = "normal";
    driveBots(room, { random: mulberry32(seed) });
    assert.equal(room.game.phase, "finished", `${type} did not finish (round ${room.game.round})`);
    assert.ok(room.game.outcome);
  });
}

test("bots fly every Prototype equipment through a whole digital mission", () => {
  const kits = [
    ["light-claw-autocannon", "ablative-plating", "ablative-cascade"],
    ["light-missile-flamethrower", "blast-furnace-core", "meltdown-protocol"],
    ["light-saw-minigun", "servo-actuators", "grapnel-launcher"],
    ["medium-lance-mortar", "radiator-array", "cryo-reservoir"],
    ["medium-shield-siege", "field-repair-suite", "nanite-swarm"],
    ["light-harpoon-anchor", "reactive-plating", "point-defense-system"],
    ["medium-sniper-chainsaw", "targeting-computer", "fire-solution-lock"],
    ["light-rivet-pressureclaw", "overclock-core", "reactor-overdrive"],
  ].map(([chassis, equipment, equipmentUpgrade], i) => ({ name: `K${i}`, chassis, equipment, equipmentUpgrade }));
  for (const seed of [1, 2, 3]) {
    const room = createRoom("CAMP-P");
    applyCommand(room, { verb: "mission", attrs: { type: "skirmish", seed, maxRounds: 5, squads: { a: kits.slice(0, 4), b: kits.slice(4) } } });
    assert.ok(room.game.started, lastRejectionReason());
    room.game.sides.find((s) => s.id === "a").bot = "hard";
    driveBots(room, { random: mulberry32(seed) });
    assert.equal(room.game.phase, "finished", `seed ${seed} stalled in round ${room.game.round}`);
  }
});
