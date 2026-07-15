import { test } from "node:test";
import assert from "node:assert/strict";
import { runDuel } from "./duel-sim.mjs";

const CELL = { chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
  weaponA: "Autocannon", upgradeA: "depleted-core", distance: 12, arc: "side" };

test("a duel is deterministic for a given seed", () => {
  // Without this, nothing below is reproducible and a regression is unfalsifiable.
  assert.deepEqual(runDuel({ ...CELL, seed: 7 }), runDuel({ ...CELL, seed: 7 }));
});

test("a duel actually fights — it does not stall and report a tidy zero", () => {
  // The failure that would make every downstream number fiction: a loop that
  // spins, never lands a command, and reports 0. That is not hypothetical — the
  // first version of the policy fired into a silent no-op forever, because a
  // spent weapon's Fire tile stays `enabled` while firing it does nothing.
  const r = runDuel({ ...CELL, seed: 3 });
  assert.ok(r.spDealt > 0, `expected damage dealt, got ${r.spDealt}`);
  assert.ok(r.rounds > 1, `expected multiple rounds, got ${r.rounds}`);
});

test("the control returns fire — spTaken is the only place denial can show", () => {
  // Suppression Lock and Pinning Burst make the CONTROL fire less, which never
  // appears in A1's column. If B1 never fights, that column is dead and we would
  // not notice.
  const r = runDuel({ ...CELL, seed: 5 });
  assert.ok(r.spTaken > 0, `expected the control to return fire, got ${r.spTaken}`);
});

test("CALIBRATION — the first shot agrees with weapon-sweep.mjs", () => {
  // THE test. A new instrument that disagrees with a trusted one is fiction.
  //
  // Only the first shot is comparable: the sweep records INTENDED damage and
  // never truncates (weapon-sweep.mjs:35); the real applyDamage walks SP down
  // against actual pools. On a fresh target they measure the same thing.
  //
  // Reference: report-2026-07-15-overflow.txt (32.3M attacks) puts Autocannon's
  // field tier at 6.06 SP/attack, pooled over targets/arcs/classes at its best
  // distance. This duel is one cell of that pool — medium vs medium, side arc,
  // sweet spot — so it will not equal 6.06 exactly. Measured: 6.51, a 7% gap in
  // the expected direction (side is +2 STR; the sweep averages front/side/rear).
  //
  // The band is wide ON PURPOSE. It catches "the harness is broken", not "the
  // harness is 4% off". Do not tighten it to the measured value — that would make
  // it a change-detector for the RNG rather than a check against the sweep.
  let total = 0, n = 0;
  for (let s = 1; s <= 200; s++) {
    const { firstShotSp } = runDuel({ ...CELL, seed: s });
    // null means A1 never fired at a FRESH B1 (too hot, or B1 self-damaged
    // first). That is a non-measurement, not a zero — averaging it in with `?? 0`
    // would silently drag the calibration down.
    if (firstShotSp == null) continue;
    total += firstShotSp; n += 1;
  }
  assert.ok(n > 150, `too few measurable first shots (${n}/200) — the calibration is not sampling what it claims`);
  const mean = total / n;
  assert.ok(mean > 3 && mean < 9,
    `first-shot SP ${mean.toFixed(2)} is nowhere near the sweep's 6.06 — the harness is wrong, not the sweep`);
});

test("Raking Fire's front arc is a structural zero — which is why arc is required", () => {
  // arcBonus returns null for Raking Fire outside side/rear (combat.js:401-406):
  // a hard zero by rule, not a failed roll. Nothing lies — the command applies,
  // the volley resolves, the damage is genuinely nothing. This is why the duel
  // declares its arc and why "front" was the wrong default.
  const mini = { ...CELL, weaponA: "Mini Gun", upgradeA: "extended-belt", distance: 7 };
  const front = runDuel({ ...mini, arc: "front", seed: 1 });
  const side = runDuel({ ...mini, arc: "side", seed: 1 });
  assert.equal(front.spDealt, 0, "Raking Fire's front arc must be a hard zero");
  assert.ok(side.spDealt > 0, `side arc must be live, got ${side.spDealt}`);
});
