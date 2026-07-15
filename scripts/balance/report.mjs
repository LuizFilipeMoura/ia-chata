import { readFileSync } from "node:fs";
const { trials, rows } = JSON.parse(readFileSync(process.env.DATA || "full.json", "utf8"));
const f = (n, p = 2) => (Number.isFinite(n) ? n.toFixed(p) : "  -  ");
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sel = (pred) => rows.filter(pred);
const spOf = (rs) => mean(rs.map((r) => r.sp));

console.log(`trials/cell=${trials} cells=${rows.length} attacks=${(trials * rows.length / 1e6).toFixed(1)}M`);

const WEAPONS = [...new Set(rows.map((r) => `${r.slot}|${r.weapon}`))];
// "best distance" per (weapon,tier,cond): the band with the highest pooled SP
function bestDist(rs) {
  const by = new Map();
  for (const r of rs) { const k = r.distance; if (!by.has(k)) by.set(k, []); by.get(k).push(r.sp); }
  let bd = null, bv = -Infinity;
  for (const [d, v] of by) { const m = mean(v); if (m > bv) { bv = m; bd = d; } }
  return { dist: bd, sp: bv };
}

// ─────────────────────────────────────────────────────────── 1. tier ladder
console.log("\n=== TIER LADDER — SP/attack at best distance, pooled targets+arcs+classes ===");
console.log("weapon".padEnd(17), "slot".padEnd(10), "| none  field  tuned  proto | cold→primed swing (best tier)");
const ladder = [];
for (const k of WEAPONS) {
  const [slot, weapon] = k.split("|");
  const rs = sel((r) => r.slot === slot && r.weapon === weapon);
  const cell = (tier, cond) => {
    const s = rs.filter((r) => r.tier === tier && r.cond === cond);
    return s.length ? bestDist(s).sp : NaN;
  };
  const tiers = ["none", "field", "tuned", "prototype"];
  const cold = Object.fromEntries(tiers.map((t) => [t, cell(t, "cold")]));
  const prim = Object.fromEntries(tiers.map((t) => [t, cell(t, "primed")]));
  const best = Math.max(...tiers.map((t) => (Number.isFinite(cold[t]) ? cold[t] : -1)));
  ladder.push({ slot, weapon, cold, prim, best });
}
ladder.sort((a, b) => b.best - a.best);
for (const r of ladder) {
  console.log(r.weapon.padEnd(17), r.slot.padEnd(10), "|",
    `${f(r.cold.none)}  ${f(r.cold.field)}  ${f(r.cold.tuned)}  ${f(r.cold.prototype)}`);
}

// ────────────────────────────────────────────── 2. cold vs primed per tier
console.log("\n=== CONDITIONAL UPGRADES — cold vs primed (SP/attack, best dist) ===");
console.log("weapon".padEnd(17), "tier".padEnd(10), "upgrade".padEnd(22), "cold", "primed", "delta");
const condRows = [];
for (const k of WEAPONS) {
  const [slot, weapon] = k.split("|");
  for (const tier of ["none", "field", "tuned", "prototype"]) {
    const c = sel((r) => r.slot === slot && r.weapon === weapon && r.tier === tier && r.cond === "cold");
    const p = sel((r) => r.slot === slot && r.weapon === weapon && r.tier === tier && r.cond === "primed");
    if (!c.length || !p.length) continue;
    const cv = bestDist(c).sp, pv = bestDist(p).sp;
    condRows.push({ weapon, tier, upgrade: c[0].upgrade, cold: cv, primed: pv, delta: pv - cv });
  }
}
for (const r of condRows.sort((a, b) => b.delta - a.delta).slice(0, 22))
  console.log(r.weapon.padEnd(17), r.tier.padEnd(10), r.upgrade.padEnd(22), f(r.cold), f(r.primed), (r.delta >= 0 ? "+" : "") + f(r.delta));

// ────────────────────────────────────── 3. upgrade uplift over base (cold)
console.log("\n=== UPGRADE UPLIFT vs BASE (cold, best dist) — a tier at ~0 is inert ===");
console.log("weapon".padEnd(17), "tier".padEnd(10), "upgrade".padEnd(22), "base", "tier", "uplift");
const uplift = [];
for (const k of WEAPONS) {
  const [slot, weapon] = k.split("|");
  const b = sel((r) => r.slot === slot && r.weapon === weapon && r.tier === "none" && r.cond === "cold");
  if (!b.length) continue;
  const bv = bestDist(b).sp;
  for (const tier of ["field", "tuned", "prototype"]) {
    const t = sel((r) => r.slot === slot && r.weapon === weapon && r.tier === tier && r.cond === "cold");
    if (!t.length) continue;
    // an upgrade whose condition only exists in `primed` gets credited its primed value
    const tp = sel((r) => r.slot === slot && r.weapon === weapon && r.tier === tier && r.cond === "primed");
    const bp = sel((r) => r.slot === slot && r.weapon === weapon && r.tier === "none" && r.cond === "primed");
    uplift.push({
      weapon, tier, upgrade: t[0].upgrade, base: bv, val: bestDist(t).sp, up: bestDist(t).sp - bv,
      primedUp: bestDist(tp).sp - bestDist(bp).sp,
    });
  }
}
for (const r of uplift.sort((a, b) => a.up - b.up))
  console.log(r.weapon.padEnd(17), r.tier.padEnd(10), r.upgrade.padEnd(22), f(r.base), f(r.val), (r.up >= 0 ? "+" : "") + f(r.up), `(primed ${(r.primedUp >= 0 ? "+" : "") + f(r.primedUp)})`);

// ───────────────────────────────────────────────────────── 4. dead cells
console.log("\n=== ZERO-DAMAGE CELLS (sp==0 over every trial) ===");
const dead = sel((r) => r.sp === 0 && r.n > 0);
const agg = new Map();
for (const r of dead) {
  const k = `${r.weapon} [${r.tier}] vs ${r.target} @${r.arc}`;
  if (!agg.has(k)) agg.set(k, new Set());
  agg.get(k).add(`${r.distance}/${r.cond}`);
}
console.log(`${dead.length} dead cells / ${rows.length}`);
for (const [k, v] of [...agg].sort()) console.log("  ", k, `[${[...v].join(" ")}]`);

// ───────────────────────────────────────────────────────── 5. arc swing
console.log("\n=== ARC SWING (best tier, cold, best dist) ===");
console.log("weapon".padEnd(17), "front", " side", " rear", " rear/front");
const arcRows = [];
for (const k of WEAPONS) {
  const [slot, weapon] = k.split("|");
  const at = (arc) => {
    const s = sel((r) => r.slot === slot && r.weapon === weapon && r.cond === "cold" && r.arc === arc && r.tier === "none");
    return s.length ? bestDist(s).sp : NaN;
  };
  const fr = at("front"), sd = at("side"), re = at("rear");
  arcRows.push({ weapon, fr, sd, re, ratio: fr > 0 ? re / fr : Infinity });
}
for (const r of arcRows.sort((a, b) => b.ratio - a.ratio))
  console.log(r.weapon.padEnd(17), f(r.fr), f(r.sd), f(r.re), r.ratio === Infinity ? " front is DEAD" : "×" + f(r.ratio));

// ─────────────────────────────────────────────────────── 6. range falloff
console.log("\n=== RANGE PROFILE (base tier, cold, pooled targets/arcs/classes) ===");
for (const k of WEAPONS) {
  const [slot, weapon] = k.split("|");
  const rs = sel((r) => r.slot === slot && r.weapon === weapon && r.tier === "none" && r.cond === "cold");
  if (!rs.length || rs[0].distance === "melee") continue;
  const ds = [...new Set(rs.map((r) => r.distance))].sort((a, b) => a - b);
  const at = (d) => spOf(rs.filter((r) => r.distance === d));
  const peak = Math.max(...ds.map(at));
  console.log(weapon.padEnd(17), ds.map((d) => `${d}:${f(at(d), 1)}`).join(" "), `| retain@max=${f(at(ds[ds.length - 1]) / peak * 100, 0)}%`);
}

// ─────────────────────────────────────────────────────── 7. matchup grid
console.log("\n=== MATCHUP GRID (base tier, cold, medium attacker, best dist) ===");
console.log("weapon".padEnd(17), "arc".padEnd(6), "rig-light rig-med");
for (const k of WEAPONS) {
  const [slot, weapon] = k.split("|");
  for (const arc of ["front", "side", "rear"]) {
    const cell = (t) => {
      const s = sel((r) => r.slot === slot && r.weapon === weapon && r.tier === "none" && r.cond === "cold"
        && r.arc === arc && r.target === t && r.attacker === "medium");
      return s.length ? f(bestDist(s).sp) : "  -  ";
    };
    console.log(weapon.padEnd(17), arc.padEnd(6),
      cell("rig-light").padStart(8), cell("rig-medium").padStart(8));
  }
}

// ─────────────────────────────────────────────── 8. target hardness
console.log("\n=== BY TARGET (all weapons, base tier, cold) ===");
for (const t of ["rig-light", "rig-medium"])
  console.log(t.padEnd(12), f(spOf(sel((r) => r.target === t && r.tier === "none" && r.cond === "cold"))));

// ─────────────────────────────────────────────── 9. light vs medium attacker
console.log("\n=== ATTACKER WEIGHT PENALTY (rig weapons, base, cold, best dist) ===");
for (const k of WEAPONS) {
  const [slot, weapon] = k.split("|");
  const at = (c) => {
    const s = sel((r) => r.slot === slot && r.weapon === weapon && r.tier === "none" && r.cond === "cold" && r.attacker === c);
    return s.length ? bestDist(s).sp : NaN;
  };
  const l = at("light"), m = at("medium");
  if (!Number.isFinite(l) || !Number.isFinite(m)) continue;
  console.log(weapon.padEnd(17), "light", f(l), "medium", f(m), `Δ${f(m - l)}`, `(${f((m / l - 1) * 100, 0)}%)`);
}
