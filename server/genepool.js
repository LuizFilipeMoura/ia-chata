// The gene pool: the GA's long-term memory. Every finished run deposits its best
// genomes here (data/gene-pool.json), and every new run is SEEDED from it — so
// checking the meta after a tweak fine-tunes the last meta instead of starting
// from scratch. Genes never bend rules: a seeded genome is re-legalised against
// the current catalogue, and anything the server's commissioning guard rejects
// simply loses its games.
//
// Also: the rules fingerprint — a hash of the engine files + rules.md. Stored
// with the Hard playbook and with pooled genes so the Lab can say "rules changed
// since this meta was evolved".
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { sanitiseGenome, genomeSignature } from "../shared/sim/genetic.js";

const RULE_FILES = ["shared/game-state.js", "shared/combat.js", "shared/rules.js", "shared/geometry.js", "shared/field.js", "shared/pathfind.js", "shared/unit-kinds.js", "shared/battle-view.js", "shared/commission.js", "rules.md"];

export function rulesHash(rootDir) {
  const h = crypto.createHash("sha256");
  for (const f of RULE_FILES) {
    try { h.update(f); h.update(fs.readFileSync(path.join(rootDir, f))); } catch {}
  }
  return h.digest("hex").slice(0, 12);
}

export function createGenePool(file, { cap = 48 } = {}) {
  let pool = [];
  try { pool = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const save = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(pool, null, 1)); };

  return {
    all: () => pool,
    // Deposit ranked genomes ({ g, fitness, games }) from a finished run.
    deposit(ranked, { job, rulesHash: rh, top = 8 } = {}) {
      for (const r of ranked.slice(0, top)) {
        const sig = genomeSignature(r.g);
        const entry = { genome: r.g, fitness: +r.fitness.toFixed(3), games: r.games ?? 0, job, rulesHash: rh, addedAt: new Date().toISOString(), sig };
        const i = pool.findIndex((p) => p.sig === sig);
        if (i >= 0) pool[i] = { ...entry, fitness: Math.max(entry.fitness, pool[i].fitness), runs: (pool[i].runs || 1) + 1 };
        else pool.push({ ...entry, runs: 1 });
      }
      // Newest rules first, then fitness — stale-rules genes age out first.
      pool.sort((a, b) => (b.rulesHash === rh) - (a.rulesHash === rh) || b.fitness - a.fitness);
      pool = pool.slice(0, cap);
      save();
    },
    // Up to n legal seed genomes for a new run (best first).
    seeds(n) {
      const out = [];
      for (const p of pool) {
        if (out.length >= n) break;
        const g = sanitiseGenome(p.genome);
        if (g) out.push(g);
      }
      return out;
    },
    clear() { pool = []; save(); },
  };
}
