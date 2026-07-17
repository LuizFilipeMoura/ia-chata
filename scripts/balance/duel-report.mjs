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
//
// Each row now carries TWO independently-aggregated sub-objects, `conservative`
// and `ceiling` (see duel-sim.mjs's makeAcc/PILOTING_HOOKS), rather than one flat
// mean. A piloted upgrade's ceiling and conservative numbers can differ a lot —
// that gap IS the skill-reward of the risky play, and PILOTING_BIASES documents
// exactly how each hook was piloted at each intensity, so it is printed here too.
import { readFileSync } from "node:fs";
import { KNOWN_BIASES } from "./policy.mjs";
import { PILOTING_BIASES } from "./piloting.mjs";

const data = JSON.parse(readFileSync(process.env.DATA || "duel.json", "utf8"));
const { trials, rounds: horizon, chassisA, chassisB, arc, minSample, rows } = data;

// Non-finite prints as a dash, never as 0. A fully-censored intensity sets its
// sub-object's means to null, and a `?? 0` there would read as "this weapon does
// nothing" — the exact misreading this harness exists to prevent.
const f = (n, p = 2) => (Number.isFinite(n) ? n.toFixed(p) : "  -  ");
const sign = (n, p = 2) => (Number.isFinite(n) ? (n >= 0 ? "+" : "") + n.toFixed(p) : "  -  ");

// SP/round is not in the JSON — derive it, per intensity sub-object. Null-safe by
// construction: null/0 or null/null yields a non-finite value, which f() dashes.
const rate = (sub) => (sub == null || sub.spDealt == null || !sub.rounds ? NaN : sub.spDealt / sub.rounds);

// A duel that never wrecked the control did not take `horizon` rounds — it took AT
// LEAST that many. At wreckRate 0 no trial resolved, so the whole rounds mean IS
// the horizon: a floor, not a measurement. SP/round divides by that floor, so the
// rate is a ceiling by an unknown margin. Averaging a non-kill in as though it
// were a kill at exactly 10 rounds is the same species of silent lie as `?? 0`,
// and the wreck% column alone will not save a reader scanning sp/rd descending —
// the inflated rows sort to the very places the eye lands first.
//
// wreckRate is null for a fully-censored sub-object (n=0); `=== 0` keeps those out
// of here, since they are already dashed everywhere by rate()/f().
const horizonCensored = (sub) => sub?.wreckRate === 0;
const mark = (s, sub) => s + (horizonCensored(sub) ? "†" : "");

// A row's overall sort key: the BETTER of its two intensities' rates (a piloted
// upgrade should sort on what a skilled pilot gets out of it, not the floor).
const bestRate = (r) => {
  const c = rate(r.conservative), e = rate(r.ceiling);
  if (!Number.isFinite(c) && !Number.isFinite(e)) return NaN;
  if (!Number.isFinite(c)) return e;
  if (!Number.isFinite(e)) return c;
  return Math.max(c, e);
};

// Rows with no measurable rate sort last, not as if they scored zero.
const byRate = (a, b) => {
  const x = bestRate(a), y = bestRate(b);
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
console.log("\nPiloting biases (printed verbatim from piloting.mjs PILOTING_BIASES):\n");
console.log(PILOTING_BIASES);
console.log(`
Run biases (this run's inputs, not the policy's):
- THE CONTROL IS A CONSTANT. Every number here is "against the control rig"
  (${chassisB}), never in the abstract. A different control reorders this table.
- SINGLE ARC, SINGLE DISTANCE. arc="${arc}" and each weapon's distance are INPUTS
  (its sweet spot), not outcomes. No row here is a range or arc profile.
- TWO INTENSITIES, NOT TWO RUNS. "cons" and "ceil" share the same 500 seeds and
  differ only in how a PILOTED upgrade's hook decides to act (see PILOTING_BIASES
  above). An upgrade with no hook measures the same under both — the spread is
  the tell for which upgrades reward skillful play and which do not.
- A 0.00 OR A DASH HERE MEANS UNMEASURED, NOT WORTHLESS. Greedy-safe makes no
  choice on its own, so any upgrade without a piloting hook cannot be exercised
  beyond plain firing. This harness exists because 44 of the old sweep's 85
  upgrades read a misleading 0.00; do not read a new one as a verdict.
- SP TOTAL SATURATES AT THE WRECK. The duel ends when the control wrecks, so a
  weapon's total is bounded by the control's SP pool however good it is. Read
  "sp/rd" for the signal and never read "spTot" without "rounds" beside it.
- AND THE RATE INFLATES WHEN THE CONTROL NEVER DIES — the same coin's other face.
  rounds-to-wreck is well-behaved for the bulk (most cells wreck) but CENSORED for
  the weak tail: a duel still running when we stop it contributes ${horizon} rounds,
  when the truth is "at least ${horizon}". So "rounds" reads LOW and "sp/rd" reads HIGH
  for any row that failed to wreck. Rows where NO trial resolved are marked † —
  their rate is a ceiling, not a measurement — and rows at wreck% < 100 are partly
  censored, leaning the same way in proportion. A 0% wreck row is not a slow kill;
  it is a NON-kill, and its rounds column is the horizon talking, not the weapon.
- EQUIPMENT ROWS FIX THE WEAPON. Every equipment row carries the SAME weapon field
  tier (documented in duel-sim.mjs as EQ_WEAPON) so the module, not the gun, is the
  variable. spTaken is the column defensive/heat/repair modules register through —
  read it alongside spDealt, not instead of it.
- NOT A LIKE-FOR-LIKE BASELINE against report-2026-07-15-overflow.txt: the duel
  pays reload heat, which the clone-per-trial sweep never did.
- A dash means the cell was fully censored (n=0) — no sample, not a zero.`);

// Two SP columns (spDealt, spTaken) per intensity, per row.
function printRow(label, r) {
  const c = r.conservative, e = r.ceiling;
  const rc = rate(c), re = rate(e);
  const spread = Number.isFinite(rc) && Number.isFinite(re) ? re - rc : NaN;
  console.log(
    label.padEnd(16), r.tier.padEnd(10), r.upgrade.padEnd(22),
    String(r.distance).padStart(5),
    mark(f(rc), c).padStart(7), mark(f(re), e).padStart(7), sign(spread).padStart(7),
    f(c.spDealt, 1).padStart(7), f(e.spDealt, 1).padStart(7),
    f(c.spTaken, 1).padStart(7), f(e.spTaken, 1).padStart(7),
    (Number.isFinite(c.wreckRate) ? (c.wreckRate * 100).toFixed(0) + "%" : "  -  ").padStart(6),
    (Number.isFinite(e.wreckRate) ? (e.wreckRate * 100).toFixed(0) + "%" : "  -  ").padStart(6),
    `${c.n}/${e.n}`.padStart(9),
    `${c.censored}/${e.censored}`.padStart(9),
  );
}

function printHeader() {
  console.log(
    "name".padEnd(16), "tier".padEnd(10), "upgrade".padEnd(22),
    "dist".padStart(5), "cons".padStart(7), "ceil".padStart(7), "spread".padStart(7),
    "consT".padStart(7), "ceilT".padStart(7), "consK".padStart(7), "ceilK".padStart(7),
    "wr.c".padStart(6), "wr.e".padStart(6), "n c/e".padStart(9), "cens c/e".padStart(9),
  );
  console.log("(cons/ceil = sp/round at each intensity; consT/ceilT = spDealt total; consK/ceilK = spTaken total)");
}

// ─────────────────────────────────────────────── 1. by weapon × tier
const weaponRows = rows.filter((r) => r.axis === "weapon");
console.log(`\n=== BY WEAPON × TIER — sorted by best-of sp/round (the rate is the signal) ===`);
printHeader();
for (const r of [...weaponRows].sort(byRate)) printRow(r.weapon, r);
console.log(`\n† rounds hit the ${horizon}-round horizon in EVERY trial at that intensity (wreck% = 0) — a`);
console.log("  floor, not a measurement; SP/round is correspondingly a ceiling.");
console.log("  Any row at wreck% < 100 is PARTLY censored the same way: read rounds with wreck%.");

// ────────────────────────── 2. by equipment × tier
const equipmentRows = rows.filter((r) => r.axis === "equipment");
console.log(`\n=== BY EQUIPMENT × TIER — sorted by best-of sp/round ===`);
console.log("(weapon is FIXED to the documented field-tier control — see EQ_WEAPON in duel-sim.mjs; spTaken is where defensive/heat modules register)");
printHeader();
for (const r of [...equipmentRows].sort(byRate)) printRow(r.equipment, r);

// ────────────────────────── 3. upgrade uplift vs the weapon's field tier
// On SP/round, not on totals: totals saturate at the wreck, so a faster kill can
// read as LESS total damage and the uplift would carry the wrong sign. Computed
// per intensity so a piloted upgrade's ceiling uplift is not blended with its
// conservative one.
console.log("\n=== UPGRADE UPLIFT vs the weapon's FIELD tier — on SP/round, per intensity ===");
console.log("(a tier at ~0.00 is INERT *or* UNMEASURED — greedy-safe exercises no choice unless piloted; see caveats)");
console.log("weapon".padEnd(16), "tier".padEnd(10), "upgrade".padEnd(22),
  "field.c".padStart(8), "tier.c".padStart(8), "up.c".padStart(7),
  "field.e".padStart(8), "tier.e".padStart(8), "up.e".padStart(7));
const uplift = [];
for (const weapon of [...new Set(weaponRows.map((r) => r.weapon))]) {
  const base = weaponRows.find((r) => r.weapon === weapon && r.tier === "field");
  if (!base) continue;
  for (const r of weaponRows.filter((x) => x.weapon === weapon && x.tier !== "field")) {
    // REFUSE the subtraction when either side never wrecked at that intensity. A
    // horizon-censored rate is a ceiling, so "9.89 → 12.00" would be
    // measurement-minus-ceiling: a number with no defined sign. Dash it and let †
    // say why — the reader can still read both rates above.
    const upC = horizonCensored(r.conservative) || horizonCensored(base.conservative)
      ? NaN : rate(r.conservative) - rate(base.conservative);
    const upE = horizonCensored(r.ceiling) || horizonCensored(base.ceiling)
      ? NaN : rate(r.ceiling) - rate(base.ceiling);
    uplift.push({ r, base, upC, upE });
  }
}
// Sort on the better-defined uplift; unmeasurable sorts last rather than as zero.
uplift.sort((a, b) => {
  const x = Number.isFinite(a.upE) ? a.upE : a.upC;
  const y = Number.isFinite(b.upE) ? b.upE : b.upC;
  if (!Number.isFinite(x) && !Number.isFinite(y)) return 0;
  if (!Number.isFinite(x)) return 1;
  if (!Number.isFinite(y)) return -1;
  return y - x;
});
for (const { r, base, upC, upE } of uplift) {
  console.log(
    r.weapon.padEnd(16), r.tier.padEnd(10), r.upgrade.padEnd(22),
    mark(f(rate(base.conservative)), base.conservative).padStart(8),
    mark(f(rate(r.conservative)), r.conservative).padStart(8),
    sign(upC).padStart(7),
    mark(f(rate(base.ceiling)), base.ceiling).padStart(8),
    mark(f(rate(r.ceiling)), r.ceiling).padStart(8),
    sign(upE).padStart(7),
  );
}
console.log(`\n† that side hit the ${horizon}-round horizon in every trial at that intensity, so its rate is a ceiling.`);
console.log("  No uplift is computed against a ceiling: the difference would have no defined sign.");
