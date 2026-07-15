# STR overflow + Swarm Warheads re-tier — design

**Date:** 2026-07-15
**Status:** approved, not implemented
**Source:** `docs/superpowers/specs/2026-07-15-weapon-balance-findings.md` (F1-A, F3-B)

Implements steps 1–3 of the findings doc's suggested order. Steps 4 (turn-level
harness) and 5 (F5-C, what speed is worth) are explicitly out of scope.

## Problem

`woundTarget = clamp(2, 10, 6 + T − STR)` (`rules.js:95`) saturates. Rig
toughness is T3–T5 (`unit-kinds.js:16`), so any STR ≥ 9 sits on the TN-2 floor
against every part of every rig. Six weapons live there — Siege Maul (11), Sniper
Cannon / Harpoon / Wrecking Ball / Anchor (10), Lance (9).

For those six, three design levers are simultaneously dead, each confirmed
independently by the sweep:

| lever | measured |
|---|---|
| arc bonus (+2 side / +3 rear) | rear/front ratio ×1.00 |
| weight class (`WEIGHT_STR_MOD`) | light↔medium delta Δ0.00 |
| +STR upgrades (haymaker, fluked-head, reinforced-head, cold-bore, full-tilt, momentum-swing) | +0.00 uplift, every one |

Flanking a Wrecking Ball rig is worth nothing. Haymaker is worth nothing.

Downstream, this inverts the heavy-hitter fantasy (F2): expected damage ≈
`ROF × P(hit) × P(wound) × D`, and saturation compresses `P(wound)` to a 1.3×
lever while ROF spans 1–8, an 8× lever. Rivet Gun (STR 3, D1, ROF 6) delivers
3.64 SP; Wrecking Ball (STR 10, D5, ROF 1) delivers 2.25.

Separately (F3), Swarm Warheads (+2 ROF, field) is the strongest upgrade
measured at +2.31, which puts Missile Barrage alone at the top of the board at
6.92 and makes its tuned (5.22) and prototype (4.61) tiers read as downgrades.

## Decisions

| decision | choice | rejected |
|---|---|---|
| overflow rate | +1 D per **3** points past the floor | per-2 (re-ranks too hard), per-1 (inverts F2 the other way) |
| overflow cap | **+2 D** | uncapped (rear-arc Siege Maul → D8 vs engine SP 8–11 = one-shot; `unit-kinds.js:11` warns against making the engine the only rational aim point) |
| Swarm Warheads | **+2 ROF → +1 ROF**, stays field | re-tier to tuned (parks an unconditional stat in the conditional tier, breaking the nature contract F3-A relies on) |
| sweep trials | **500** | 3000 (12 min, not needed to answer a directional question), 100 (±0.1 ratio noise swamps the arc checks) |

The Swarm Warheads decision is worth stating plainly, because it departs from
F3-B as literally written. F3-B says "swap it with a tuned or prototype effect."
But the natures are Field = raw stats, Tuned = conditional stats, Prototype = new
mechanic with a catch. "+2 ROF" is a pure raw stat — it is *correctly*
field-shaped. The outlier is the magnitude, not the tier. Nerfing in place fixes
the measured problem without breaking the contract.

Note F1-A does **not** touch Missile Barrage: STR 7 vs engine T3 (floor 7) yields
overflow 0. Overflow lifts the heavies around it; it never lowers Missile
Barrage. F3-B is therefore still required, and the two changes are independent.

## The rule

Lives in `rules.js` beside `woundTarget`. Same rule family, and `combat.js`
imports only from `rules.js` to avoid a cycle with `game-state.js`
(`rules.js:69`).

The floor point is `STR = T + 4`, but that is a *restatement* of `woundTarget`'s
clamp — two expressions of one truth, which drift the first time someone touches
the wound formula. Both read from one private helper instead:

```js
// The pre-clamp wound value. woundTarget clamps it; strOverflowD measures how
// far past the floor it went. One expression, so the two cannot drift.
function woundRaw(str, toughness) { /* 6 + t - s, with woundTarget's guards */ }

export const OVERFLOW_PER_D = 3;
export const OVERFLOW_MAX_D = 2;

export function strOverflowD(str, toughness) {
  const over = Math.max(0, 2 - woundRaw(str, toughness));  // 2 is woundTarget's floor
  return Math.min(OVERFLOW_MAX_D, Math.floor(over / OVERFLOW_PER_D));
}
```

`strOverflowD` inherits `woundTarget`'s toughness guard verbatim: a non-number T
throws (`rules.js:99–107`). That guard exists because a null T coerces to 0 and
yields TN 2, the most dangerous default in the system. Overflow carries the
identical hazard in the same direction — a null T would read as maximum
overflow — so it must not be relaxed here.

Worked examples:

| shot | effStr | T | over | +D |
|---|---|---|---|---|
| Wrecking Ball, front, arms | 10 | 4 | 2 | +0 |
| Wrecking Ball, rear, arms | 13 | 4 | 5 | +1 |
| Siege Maul + Reinforced Head, rear, engine | 16 | 3 | 9 | +2 (capped from 3) |
| Autocannon, front, hull | 7 | 5 | 0 | +0 |
| Rivet Gun, anywhere | 3 | 3–5 | 0 | +0 |

A +3 STR upgrade now always buys exactly +1 D on a saturated weapon — `+3` is one
whole rate step, so it lifts `floor(over / 3)` by exactly 1 from any starting
point. That is the dead-lever fix, at the smallest magnitude that achieves it.

### Known limit of the per-3 rate

The rate is integer, so a **±1 modifier only bites when overflow crosses a
multiple of 3** — about a third of the time. This matters for `WEIGHT_STR_MOD`,
whose light penalty is exactly −1.

F4-A in the findings doc claims that with overflow "the −1 always costs something
(a fraction of a D step), on every weapon." That is overstated for this design:
there are no fractional D steps. A light Siege Maul into medium arms wastes 2 and
gets +0 where a medium wastes 3 and gets +1 — the mod is live there. Into an
engine, both waste enough to floor to the same +1, and the mod is still worth
nothing on that shot.

This is accepted, not a defect:

- The six saturated weapons were the target, and their +STR **upgrades** are all
  +2/+3 — a full rate step or close to it. Those reconnect unconditionally.
- The alternative (per-2, or fractional D) was rejected in the decisions above for
  overshoot and for adding a fraction to a stat the whole game reads as an integer.
- F4's own recommendation is to fix F1 and then **revisit F4-C** (delete
  `WEIGHT_STR_MOD` entirely) if the mod still fails to earn its place. This design
  does not settle that question; it makes it measurable for the first time.

Consequence for measurement: expect the light↔medium delta for the six to move
*off* Δ0.00 but stay small. Do not read a small delta as the change having failed.

## Wiring

| # | file | change |
|---|---|---|
| 1 | `rules.js` | `woundRaw`, `OVERFLOW_PER_D`, `OVERFLOW_MAX_D`, `strOverflowD` |
| 2 | `combat.js:547–556` | compute overflow, add into `sp` |
| 3 | `combat.js:527` | `overflow: 0` on the negated path, shape parity |
| 4 | `combat.js:567` | thread `overflow` onto the rider |
| 5 | `combat.js:~889` | ledger term, label **"Overmatch"** |
| 6 | `glossary.js` | Overmatch term |
| 7 | `game-state.js:571` | Swarm Warheads `rof: 2` → `1`, tag `"+2 ROF"` → `"+1 ROF"` |

The compute mirrors rend/evisc exactly. `effStr` and `toughness` are both already
in scope from `combat.js:532–533`:

```js
if (wounded) {
  rend = hasPerk(profile, "Rend") ? 1 : 0;
  evisc = /* unchanged */;
  overflow = strOverflowD(effStr, toughness);
  sp = (profile.d || 1) + rend + evisc + overflow;
}
```

Overflow rides `effStr`, so it inherits every STR modifier already summed at
`:532` — arc, weight class, Haymaker, Brace, shield blunt. That is what lets one
rule revive all three dead levers at once. It also applies on the Penetrator
Rounds path (`opts.penetrate` skips the roll, not the STR), which is consistent.

Overflow is threaded as a **named rider**, not folded silently into `sp`, per the
rule stated at `combat.js:543`: the ledger names what decided the shot. A
crushing hit rendering `weapon D 5, +2` with no label is exactly the readability
failure for which F1-D was rejected.

On edit 7: `tag` is rendered verbatim by many surfaces, so `effect.rof` and `tag`
must change together or the commission wizard lies about the upgrade.

## Testing

Two different questions, two different instruments. They must not be conflated.

**Correctness — unit tests, exact, zero noise.** `strOverflowD` is a pure
function.

- `rules.test.js` — floor boundary (`s = t+4` → 0, `s = t+5` → 0, `s = t+7` → +1);
  cap (`s = t+13` → +2, not +3); non-number T throws; STR 3 vs T3–5 → 0.
- `combat.test.js` — overflow lands in `sp`; rides the arc bonus (one shot, front
  vs rear, differs by exactly +1 D); negated path carries `overflow: 0`; ledger
  emits "Overmatch" only when it fired.
- `game-state.test.js` — Swarm Warheads `rof: 1`, tag matches.
- `glossary.test.js` — Overmatch term.

**Balance — the sweep, directional.** The unit tests already prove the levers
reconnect, deterministically and for free. The sweep answers only what tests
cannot: did the ranking move, and roughly how far.

```bash
TRIALS=500 node scripts/balance/weapon-sweep.mjs > full.json 2>progress.txt   # ~40s
DATA=full.json node scripts/balance/report.mjs
```

Baseline for comparison: `scripts/balance/report-2026-07-15.txt` (3000 trials).

| question | instrument | bar |
|---|---|---|
| do the dead levers reconnect? | unit tests | exact, must pass |
| did Missile Barrage come off the top? | sweep @ 500 | ~6.9 → ~5.5–6.0 |
| did the ROF-1 heavies climb? | sweep @ 500 | Wrecking Ball ~2.25 → ~2.8–3.2 |
| did the 6.2× spread narrow? | sweep @ 500 | directional only |

**Do not re-tune off the 500-trial run.** At 500, ratio noise is roughly ±0.045 —
enough to see the arc and weight-class checks move off their structural zeros,
not enough to justify adjusting numbers. If the spread still looks wrong, that is
the trigger to spend 12 minutes on a 3000-trial run, not to start tuning against
noise. This protects the findings doc's step 2: measure before tuning.

## Correction to the findings doc

The findings doc records the `combat.js:728` hit-location fix as "Uncommitted, in
the working tree." That is stale — the fix is **committed**: the explanatory
comment sits at `combat.js:728` and the regression test ("hit location comes from
the target's kind") is in `combat.test.js`. The findings doc should be amended.

## Out of scope

- **F2-B** (price ROF in heat) — revisit only if the spread persists after re-measure.
- **F4/F5** — downstream of F1; the doc says measure before tuning them.
- **Turn-level harness** (findings step 4) — a different harness, not a parameter change.
- **F5-C** (what speed is worth) — needs a positional sim.
- **F6/F7/F8** — no action recommended by the findings.
