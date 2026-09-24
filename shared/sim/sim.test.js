import { test } from "node:test";
import assert from "node:assert/strict";
import { playMatch, mulberry32 } from "./match.js";
import { randomGenome, evolve, summarise, WEIGHT_KEYS } from "./genetic.js";
import { CHASSIS, WEAPON_UPGRADES } from "../game-state.js";
import { EQUIPMENT_UPGRADES } from "../rules.js";

const squads = {
  a: [{ chassis: "medium-lance-mortar" }, { chassis: "light-claw-autocannon" }, { chassis: "light-sword-arc" }],
  b: [{ chassis: "medium-shield-siege" }, { chassis: "light-saw-minigun" }, { chassis: "light-harpoon-anchor" }],
};

test("a headless match terminates, is reproducible, and records replay frames", () => {
  const r1 = playMatch({ squads, seed: 3, record: true });
  const r2 = playMatch({ squads, seed: 3, record: true });
  assert.ok(r1.frames.length > 10);
  assert.equal(r1.frames.at(-1).phase, "finished");
  assert.deepEqual(r1.vp, r2.vp);
  assert.equal(r1.winner, r2.winner);
  assert.deepEqual(r1.frames.at(-1).rigs, r2.frames.at(-1).rigs);
  assert.ok(r1.frames[0].rigs.every((r) => r.pos), "rigs are deployed");
});

test("random genomes honour composition, distinct chassis and one-Prototype", () => {
  const rnd = mulberry32(9);
  const nat = (list, id) => list.find((u) => u.id === id)?.nature;
  for (let i = 0; i < 200; i++) {
    const g = randomGenome(rnd);
    const ids = g.squad.map((u) => u.chassis);
    assert.equal(new Set(ids).size, 3);
    const classes = ids.map((id) => CHASSIS.find((c) => c.id === id).class).sort();
    assert.deepEqual(classes, ["light", "light", "medium"]);
    for (const u of g.squad) {
      const ch = CHASSIS.find((c) => c.id === u.chassis);
      const protos = [nat(WEAPON_UPGRADES[ch.longRange], u.longRangeUpgrade), nat(WEAPON_UPGRADES[ch.melee], u.meleeUpgrade),
        nat(EQUIPMENT_UPGRADES[u.equipment], u.equipmentUpgrade)].filter((n) => n === "prototype").length;
      assert.ok(protos <= 1);
    }
    assert.deepEqual(Object.keys(g.weights), WEIGHT_KEYS);
  }
});

test("evolve runs generations, only pairs disjoint squads, and reports balance stats", async () => {
  let gens = 0;
  // Stub evaluator: side A wins when its squad holds Copper. Deterministic and fast.
  const evaluate = async (jobs) => jobs.map((j) => {
    const a = j.squads.a.map((u) => u.chassis), b = j.squads.b.map((u) => u.chassis);
    assert.ok(!a.some((id) => b.includes(id)), "no mirrored chassis on one field");
    const aHas = a.includes("medium-lance-mortar"), bHas = b.includes("medium-lance-mortar");
    return { winner: aHas ? "a" : bHas ? "b" : null, vp: [aHas ? 5 : 0, bHas ? 5 : 0], stats: {} };
  });
  const res = await evolve({ population: 10, generations: 5, gamesPer: 3, seed: 2, evaluate, onGeneration: () => gens++ });
  assert.equal(gens, 5);
  assert.equal(res.history.length, 5);
  const copper = res.stats.find((s) => s.key === "chassis:medium-lance-mortar");
  assert.ok(copper && copper.winRate > 0.9, "the rigged chassis shows up as the meta");
  assert.ok(res.best.g.squad.some((u) => u.chassis === "medium-lance-mortar"));
});

test("summarise turns tallies into win-rate rows", () => {
  const rows = summarise({ "chassis:x": { games: 4, wins: 3, draws: 0, dmg: 8 } });
  assert.deepEqual(rows[0], { key: "chassis:x", kind: "chassis", id: "x", games: 4, winRate: 0.75, avgDmg: 2 });
});
