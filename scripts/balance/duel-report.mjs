// Formatter for the duel harness (duel-sim.mjs), sibling to report.mjs.
//
// Reads DATA (default duel.json) and prints the caveats FIRST, because the number
// most likely to be misused is the one printed without them.
//
// The policy's biases are printed from policy.mjs's KNOWN_BIASES rather than
// re-typed here: two copies drift, and a drifted caveat is worse than none
// because the reader trusts it. The caveats below are the ones KNOWN_BIASES does
// not own — they belong to the RUN, not the policy — and they are read out of the
// JSON header wherever the header knows them.
import { readFileSync } from "node:fs";
import { KNOWN_BIASES } from "./policy.mjs";

const data = JSON.parse(readFileSync(process.env.DATA || "duel.json", "utf8"));
const { trials, rounds: horizon, chassisA, chassisB, arc, minSample, rows } = data;

// Non-finite prints as a dash, never as 0. The sweep sets spDealt/rounds to null
// when every trial in a cell was censored, and a `?? 0` there would read as "this
// weapon does nothing" — the exact misreading this harness exists to prevent.
const f = (n, p = 2) => (Number.isFinite(n) ? n.toFixed(p) : "  -  ");
const sign = (n, p = 2) => (Number.isFinite(n) ? (n >= 0 ? "+" : "") + n.toFixed(p) : "  -  ");

// SP/round is not in the JSON — derive it. Null-safe by construction: null/0 or
// null/null yields a non-finite value, which f() prints as a dash.
const rate = (r) => (r.spDealt == null || !r.rounds ? NaN : r.spDealt / r.rounds);

// Rows with no measurable rate sort last, not as if they scored zero.
const byRate = (a, b) => {
  const x = rate(a), y = rate(b);
  if (!Number.isFinite(x) && !Number.isFinite(y)) return 0;
  if (!Number.isFinite(x)) return 1;
  if (!Number.isFinite(y)) return -1;
  return y - x;
};

console.log(`duel report — trials/cell=${trials} horizon=${horizon} rounds arc=${arc} cells=${rows.length}`);
console.log(`test rig=${chassisA}  control rig=${chassisB}  min sample=${minSample}`);

// ────────────────────────────────────────────────────────────────── caveats
console.log("\n=== READ THIS FIRST — what these numbers are NOT ===");
console.log("\nPolicy biases (printed verbatim from policy.mjs KNOWN_BIASES):\n");
console.log(KNOWN_BIASES);
console.log(`
Run biases (this run's inputs, not the policy's):
- THE CONTROL IS A CONSTANT. Every number here is "against the control rig"
  (${chassisB}), never in the abstract. A different control reorders this table.
- SINGLE ARC, SINGLE DISTANCE. arc="${arc}" and each weapon's distance are INPUTS
  (its sweet spot), not outcomes. No row here is a range or arc profile.
- A 0.00 OR A DASH HERE MEANS UNMEASURED, NOT WORTHLESS. Greedy-safe makes no
  choice, so Fire Control Lock, Enfilade, Barrage and the spatial effects cannot
  be exercised at all. This harness exists because 44 of the old sweep's 85
  upgrades read a misleading 0.00; do not read a new one as a verdict.
- SP TOTAL SATURATES AT THE WRECK. The duel ends when the control wrecks, so a
  weapon's total is bounded by the control's SP pool however good it is. Read
  "sp/rd" for the signal and never read "spTot" without "rounds" beside it.
- NOT A LIKE-FOR-LIKE BASELINE against report-2026-07-15-overflow.txt: the duel
  pays reload heat, which the clone-per-trial sweep never did.
- A dash means the cell was fully censored (n=0) — no sample, not a zero.`);

// ─────────────────────────────────────────────── 1. by weapon × tier
console.log(`\n=== BY WEAPON × TIER — sorted by SP/round (the rate is the signal) ===`);
console.log("weapon".padEnd(16), "tier".padEnd(10), "upgrade".padEnd(22),
  "dist".padStart(5), "sp/rd".padStart(7), "rounds".padStart(7), "spTot".padStart(7),
  "wreck%".padStart(7), "spTaken".padStart(8), "n".padStart(4), "cens".padStart(5));
for (const r of [...rows].sort(byRate)) {
  console.log(
    r.weapon.padEnd(16), r.tier.padEnd(10), r.upgrade.padEnd(22),
    String(r.distance).padStart(5),
    f(rate(r)).padStart(7),
    f(r.rounds, 1).padStart(7),
    f(r.spDealt, 1).padStart(7),
    (Number.isFinite(r.wreckRate) ? (r.wreckRate * 100).toFixed(0) + "%" : "  -  ").padStart(7),
    f(r.spTaken, 1).padStart(8),
    String(r.n).padStart(4),
    String(r.censored).padStart(5),
    r.underSampled ? " UNDER-SAMPLED" : "",
  );
}

// ────────────────────────── 2. upgrade uplift vs the weapon's field tier
// On SP/round, not on totals: totals saturate at the wreck, so a faster kill can
// read as LESS total damage and the uplift would carry the wrong sign.
console.log("\n=== UPGRADE UPLIFT vs the weapon's FIELD tier — on SP/round ===");
console.log("(a tier at ~0.00 is INERT *or* UNMEASURED — greedy-safe exercises no choice; see caveats)");
console.log("weapon".padEnd(16), "tier".padEnd(10), "upgrade".padEnd(22),
  "field".padStart(7), "tier".padStart(7), "uplift".padStart(7), "  rounds field→tier");
const uplift = [];
for (const weapon of [...new Set(rows.map((r) => r.weapon))]) {
  const base = rows.find((r) => r.weapon === weapon && r.tier === "field");
  if (!base) continue;
  for (const r of rows.filter((x) => x.weapon === weapon && x.tier !== "field")) {
    uplift.push({ r, base, up: rate(r) - rate(base) });
  }
}
// Same rule as above: unmeasurable uplift sorts last rather than as a zero.
uplift.sort((a, b) => {
  if (!Number.isFinite(a.up) && !Number.isFinite(b.up)) return 0;
  if (!Number.isFinite(a.up)) return 1;
  if (!Number.isFinite(b.up)) return -1;
  return b.up - a.up;
});
for (const { r, base, up } of uplift) {
  console.log(
    r.weapon.padEnd(16), r.tier.padEnd(10), r.upgrade.padEnd(22),
    f(rate(base)).padStart(7), f(rate(r)).padStart(7), sign(up).padStart(7),
    `   ${f(base.rounds, 1)} → ${f(r.rounds, 1)}`,
    r.underSampled || base.underSampled ? " UNDER-SAMPLED" : "",
  );
}
