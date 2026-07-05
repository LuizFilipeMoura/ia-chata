import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, makeRig, claimSide, applyCommand, findRig,
  normalizeWeapon, WEAPONS, formatBattleState, publicState,
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
  assert.equal(WEAPONS.longRange.length, 6);
  assert.equal(WEAPONS.melee.length, 6);
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

  applyCommand(r, { verb: "add", attrs: { name: "A4", class: "light", owner: "a", ...W } });
  assert.equal(r.game.sides.every((s) => s.ready === false), true);

  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  applyCommand(r, { verb: "remove", attrs: { name: "A4" } });
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
