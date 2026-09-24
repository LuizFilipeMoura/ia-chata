import { test } from "node:test";
import assert from "node:assert/strict";
import { playMatch, mulberry32 } from "./match.js";
import { randomGenome, evolve, summarise, wilson, compKey, WEIGHT_KEYS, BIAS_KEYS } from "./genetic.js";
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
    assert.deepEqual(Object.keys(g.weights), [...WEIGHT_KEYS, ...BIAS_KEYS]);
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
  const { ciLow, ciHigh, ...rest } = rows[0];
  assert.deepEqual(rest, { key: "chassis:x", kind: "chassis", id: "x", games: 4, winRate: 0.75, avgDmg: 2 });
  assert.ok(ciLow < 0.75 && ciHigh > 0.75 && ciLow > 0 && ciHigh <= 1, "4 games is a wide interval");
  const [lo, hi] = wilson(0.75, 400);
  assert.ok(hi - lo < 0.1, "400 games is a tight one");
});

test("simulated rooms go through the server's commissioning guard", () => {
  // Two Prototypes on one rig is illegal for a player — and for the GA.
  const bad = { a: [{ chassis: "medium-lance-mortar", longRangeUpgrade: "barrage", meleeUpgrade: WEAPON_UPGRADES["Lance"].find((u) => u.nature === "prototype").id }, { chassis: "light-claw-autocannon" }, { chassis: "light-sword-arc" }], b: squads.b };
  assert.throws(() => playMatch({ squads: bad, seed: 1 }), /Prototype/);
  assert.throws(() => playMatch({ squads: { a: [{ chassis: "medium-lance-mortar", meleeUpgrade: "not-a-real-upgrade" }, ...squads.a.slice(1)], b: squads.b }, seed: 1 }), /upgrade/);
});

test("the GA explores squad makeups and tables, pairing only mirrored makeups", async () => {
  const seen = new Set();
  const evaluate = async (jobs) => jobs.map((j) => {
    const cls = (sq) => sq.map((u) => CHASSIS.find((c) => c.id === u.chassis).class).sort().join();
    assert.equal(cls(j.squads.a), cls(j.squads.b), "server parity: weight classes mirror");
    assert.ok(j.table && j.tableId, "each match is on a table");
    seen.add(compKey({ squad: j.squads.a }));
    return { winner: "a", vp: [1, 0], stats: {} };
  });
  const res = await evolve({ population: 12, generations: 2, gamesPer: 2, seed: 3, evaluate, compositions: "all", tables: ["standard", "skirmish"] });
  assert.ok(seen.size >= 2, `several makeups played (${[...seen]})`);
  assert.ok(res.stats.some((s) => s.kind === "comp") && res.stats.some((s) => s.kind === "chassis@skirmish") && res.stats.some((s) => s.kind === "table"));
});
