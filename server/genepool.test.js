import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGenePool, rulesHash } from "./genepool.js";
import { randomGenome, evolve, genomeSignature } from "../shared/sim/genetic.js";
import { mulberry32 } from "../shared/sim/match.js";

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gp-")), "pool.json");

test("the gene pool persists the best genomes and seeds the next run from them", async () => {
  const file = tmp();
  const rnd = mulberry32(1);
  const pop = Array.from({ length: 6 }, () => randomGenome(rnd));
  createGenePool(file).deposit(pop.map((g, i) => ({ g, fitness: 1 - i / 10 })), { job: "j1", rulesHash: "abc", top: 4 });
  const pool = createGenePool(file);   // reloaded from disk
  assert.equal(pool.all().length, 4);
  const seeds = pool.seeds(3);
  assert.equal(seeds.length, 3);
  assert.equal(genomeSignature(seeds[0]), genomeSignature(pop[0]), "best first");

  // A run seeded from the pool starts with those genomes in its population.
  let first;
  await evolve({ population: 6, generations: 1, gamesPer: 1, seed: 2, seedPopulation: seeds,
    evaluate: async (jobs) => jobs.map(() => ({ winner: "a", vp: [1, 0], stats: {} })),
    onGeneration: ({ ranked }) => { first = ranked.map((r) => genomeSignature(r.g)); } });
  for (const s of seeds) assert.ok(first.includes(genomeSignature(s)), "seed genome took part");
});

test("stored genes are re-legalised against the current catalogue", () => {
  const file = tmp();
  const g = randomGenome(mulberry32(3));
  g.squad[0].meleeUpgrade = "an-upgrade-that-no-longer-exists";
  const ghost = { squad: [{ chassis: "a-retired-chassis" }, ...g.squad.slice(1)], weights: g.weights };
  createGenePool(file).deposit([{ g, fitness: 1 }, { g: ghost, fitness: 0.9 }], { job: "j", rulesHash: "x" });
  const seeds = createGenePool(file).seeds(5);
  assert.equal(seeds.length, 1, "a genome with an unknown chassis is dropped");
  assert.notEqual(seeds[0].squad[0].meleeUpgrade, "an-upgrade-that-no-longer-exists", "a dead upgrade is re-rolled");
});

test("the rules fingerprint changes when a rules file changes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rh-"));
  fs.mkdirSync(path.join(root, "shared"));
  fs.writeFileSync(path.join(root, "rules.md"), "heat 1");
  const a = rulesHash(root);
  fs.writeFileSync(path.join(root, "rules.md"), "heat 2");
  assert.notEqual(rulesHash(root), a);
});
