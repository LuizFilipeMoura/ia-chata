# Hit → Wound → Location — combat resolution rewrite

**Status:** design approved, not yet planned
**Date:** 2026-07-14
**Supersedes:** the impact-total model (`impactSeverity`, `RIG_IMPACT`, `direct/severe/critical`)

## Problem

Damage today is an *impact total* — `d6 + STR + arc + modifiers` — compared against a
three-tier armour row per location per weight class (`direct/severe/critical` → 1/2/3 SP).

Two things are wrong with it.

**It has 69 mathematically impossible matchups.** The impact total is capped at `6 + STR + arc`.
Melee gets no arc bonus at all (`combat.js` `arcBonus` returns 0 for `profile.melee`), so a melee
weapon's ceiling is `6 + STR`, forever. A light Circular Saw (STR 6, light weight mod −2 → 4)
tops out at 10 against a medium hull's `direct: 11`. It cannot deal damage. Not "rarely" — never.
An exhaustive sweep of every weapon × attacker class × target class × location found 69 such
combos, every one of them melee except the Rivet Gun.

This silently kills whole rig designs. `docs/design/light-saw-minigun.md` builds its entire
identity on Sunder and Dismember, both of which gate on `impacts.some(h => h.sp > 0)`. Against a
medium hull the saw is always 0 SP, so the rig's signature mechanic can never fire.

**It is unreadable at the table.** The impact dice are rolled inside `rollImpacts` but never
pushed into the resolution's `rolls`, so the player sees "2 hits · 4 weapon STR → 0 SP" with no
sight of the roll that decided it. The originating bug report for this work was a player asking
"why 0 damage?" — and the UI gave them nothing to answer it with.

## The model

Three dice, in order:

| Step | Die | Test |
|---|---|---|
| **Hit** | d6 | `≥ AIM` (unchanged; a natural 6 always hits) |
| **Wound** | **d10** | `≥ 6 + T − S`, clamped to `2..10` |
| **Location** | d12 | unchanged — picks where the damage lands |

Each wound deals the weapon's **D** (damage) stat to the struck location. There is no impact
total and no severity tier.

### Why d10

The wound target number must span the full range of `T − S` without clamping at either end.
With STR rescaled to 3..11 and T spanning 3..7, the gap runs −8..+4, and only a d10 fits it:

| die | TN formula | STR spread before saturation | per-point swing |
|---|---|---|---|
| d6 | `4 + T − S` | ±2 | 16.7% |
| d8 | `5 + T − S` | ±3 | 12.5% |
| **d10** | **`6 + T − S`** | **±4** | **10%** |
| d12 | `7 + T − S` | ±5 | 8.3% |

d6 is what causes the current compression — with only ±2 of live range, STR 8 through 13 all
wound identically. d12 was tested and **reintroduces the same bug at the top**: Sniper Cannon,
Siege Maul, Harpoon and Anchor all clamp to `2+` (92%) against every class. d10 is the only size
where the whole roster stays distinct with no clamp at either end.

Each point of STR is exactly 10%, so the wound roll is readable as a percentage with no lookup.

**Cost:** a d10 is a new die type at the table. Current play needs d6 + d12.

### Toughness grid

Replaces all 48 numbers of `RIG_IMPACT` with 16.

| T | hull | arms | legs | engine |
|---|---|---|---|---|
| light | 4 | 3 | 3 | 3 |
| medium | 5 | 4 | 4 | 3 |
| heavy | 6 | 5 | 5 | 4 |
| colossal | 7 | 6 | 6 | 5 |

This grid is **designed, not ported.** Deriving it mechanically from the old rows (`direct − 6`)
yields engine values of T1–T3, which would let every weapon in the game wound an engine on `2+`
and make it the only rational aim point on the table.

Tanks and Walkers need their own grids in `unit-kinds.js` (`armour` → `toughness`), keyed to
their own parts (`hull/tracks/turret/engine`, `hull/legs/mount/engine`). Values TBD in the plan;
mirror the Rig ladder by role.

### No dead zones, structurally

A wound roll's worst band is `6 + T − S` clamped to 10 — a 10% chance. It is impossible for a
matchup to be unwinnable, because the clamp guarantees a natural 10 always wounds. This is not a
patch or a floor rule; it falls out of the model. All 69 dead zones vanish with no special case.

The original bug case, on this model: light Circular Saw (new STR 5, light mod −1 → 4) versus a
medium hull (T5) → `7+`, 40%. Versus a colossal hull (T7) → `9+`, 20%. Low, never zero, and it
scales with the target.

### Saturation at the top is intended

Siege Maul reads ~2.3 SP/volley against every weight class — it ignores armour entirely, because
STR 8+ saturates at 90% against a light hull (T4). This is the mirror of the old bug but at the
*good* end, and it is correct: against a **colossal** hull (T7) the full ladder is live, from
Mini Gun at 10% to Siege Maul at 90%. Armour discriminates most exactly where it is thickest, and
a siege hammer flattening a light Rig regardless of the fine print is the right fantasy.

## Weapon stats

STR rescales from 4..13 onto 3..11 (`round(3 + (str − 4) × 8/9)`). D is **hand-assigned per
weapon** — deriving it from ROF was tested and collapsed all eleven ROF-1 weapons onto an
identical 1.8 SP/volley, which is exactly the differentiation failure D exists to prevent.

Expected SP/volley assumes a 50% hit rate (AIM 4 on d6) against a medium hull, no upgrades, no arc.

### Rig weapons

| Weapon | ROF | STR old → new | D | SP/volley vs medium hull |
|---|---|---|---|---|
| Mini Gun | 8 | 4 → 3 | 1 | 1.2 |
| Double MG | 8 | 6 → 5 | 1 | 2.0 |
| Autocannon | 4 | 8 → 7 | 2 | 2.8 |
| Arc Gun | 2 | 10 → 8 | 3 | 2.4 |
| Mortar | 3 | 9 → 7 | 2 | 2.1 |
| Sniper Cannon | 1 | 12 → 10 | 4 | 1.8 |
| Siege Maul | 1 | 13 → 11 | 5 | 2.3 |
| Missile Barrage | 4 | 9 → 7 | 2 | 2.8 |
| Harpoon | 1 | 12 → 10 | 3 | 1.4 |
| Rivet Gun | 6 | 4 → 3 | 1 | 0.9 |
| Crossbow | 1 | 10 → 8 | 4 | 1.6 |
| Sword | 2 | 6 → 5 | 3 | 1.5 |
| Circular Saw | 3 | 6 → 5 | 2 | 1.5 |
| Chainsaw | 3 | 8 → 7 | 2 | 2.1 |
| Claw | 2 | 8 → 7 | 3 | 2.1 |
| Lance | 1 | 11 → 9 | 4 | 1.8 |
| Wrecking Ball | 1 | 12 → 10 | 5 | 2.3 |
| Bulwark Shield | 1 | 6 → 5 | 3 | 0.8 |
| Flamethrower | 4 | 7 → 6 | 2 | 2.4 |
| Anchor | 1 | 12 → 10 | 4 | 1.8 |
| Pressure Claw | 2 | 9 → 7 | 3 | 2.1 |
| Talon | 2 | 7 → 6 | 3 | 1.8 |

### Unit weapons (`flatPick` — no weight modifier)

| Weapon | ROF | STR old → new | D | SP/volley vs medium hull |
|---|---|---|---|---|
| Tank Cannon | 1 | 12 → 10 | 5 | 2.3 |
| Autocannon Mount | 3 | 8 → 7 | 2 | 2.1 |
| Coaxial MG | 6 | 5 → 4 | 1 | 1.2 |
| Rocket Pod | 2 | 10 → 8 | 3 | 2.4 |
| Dozer Blade | 1 | 10 → 8 | 4 | 1.6 |
| Ram Spike | 1 | 11 → 9 | 4 | 1.8 |
| Sidearm | 2 | 4 → 3 | 1 | 0.3 |

Spread against a medium hull: **0.8 → 2.8 SP/volley, median 1.8** (Sidearm's 0.3 is deliberate —
it is the built-in weak weapon every support unit carries until a Damage module replaces it).
The ROF-1 club now spans 0.8 → 2.3 rather than collapsing onto one value.

SP pools are **unchanged** (`RIG_DEFAULTS`: light 6/5/5/4 → colossal 9/8/8/7). At these numbers a
medium hull takes 2.5 volleys to strip under the best weapon and 7.8 under the worst, across a
10-round match. The pools also carry the per-location texture the T grid leans on — an engine is
fragile because its pool is 4, not because its row is soft.

`WEIGHT_STR_MOD` compresses from `−2/0/+2/+4` to `−1/0/+1/+2`, matching the ×0.8 STR rescale.

## Modifier mapping

Every existing `±N to the impact total` becomes **`±N to STR`** — same sign, same position in the
formula, now worth a flat 10% each. This is a mechanical substitution for roughly 20 of the ~25
live effects:

All magnitudes below are the old value × 0.8, rounded — the same factor as the STR rescale, so a
modifier keeps its size *relative to* the STR scale it modifies. Values of 1–2 round back to
themselves; only 3, 4 and 8 actually move.

| Effect | Today | After |
|---|---|---|
| Arc — side / rear | +2 / +4 to total | +2 / +3 STR |
| Raking Fire — side / rear | +4 / +8 to total | +3 / +6 STR |
| Brace (front arc) | −2 to total | −2 STR |
| Harden / Ablative Plating | −1 / −2 to total | −1 / −2 STR |
| Reactive Plating (side/rear) | −1 / −2 to total | −1 / −2 STR |
| Shield blunt | −4 to total | −3 STR |
| Breach Grip (cracked) | +2 to total | +2 STR |
| Cold Bore | +3 STR | +2 STR |
| Full Tilt / Momentum Swing | +3 / +2 STR | +2 / +2 STR |
| Opportunist / Taut Cable / Steady Aim | +3 STR | +2 STR |
| Reactor Overdrive | +2 STR | +2 STR |
| Piledriver | +1 STR per momentum | unchanged |
| Charged Shot | +2 STR | +2 STR |

**Melee gains the arc ladder.** Deleting `if (profile.melee) return 0;` from `arcBonus` lets melee
fall through to the shared side/rear values. This was the root asymmetry behind the dead zones and
it should not survive the rewrite. The Raking Fire branch stays ahead of it (no melee weapon
carries the perk).

Modifier magnitudes are marked ×0.8 above to track the STR rescale, but they are **tuning values,
not derived constants** — the plan should treat the table as a starting point and check the
resulting bands, not trust the arithmetic.

## Effects needing redesign

Five effects reference machinery that no longer exists. These are **decisions, not translations**:

| Effect | Today | Proposed |
|---|---|---|
| Armour Piercing | +d3 to total on a natural 6 | **reroll failed wounds** |
| Rend | +d3 to total on a 5+ | **reroll failed wounds** (weaker trigger — needs differentiating from AP) |
| Penetrator Rounds | every 3rd volley forces Severe | **auto-wound** (skip the wound roll) |
| Evisceration | forces Critical on a half-SP location | **+1 D against a location at or below half SP** |
| Ablative Cascade | softens one severity step, `direct → none` | **negate one wound per charge** |

**Intentional zeroes survive as auto-fails.** A negating shield and Raking Fire's front-arc both
short-circuit before any roll today (`combat.js:345`) and must keep doing so. The distinction the
rewrite must preserve: an *armour-row* zero was a bug; an *earned* zero (a raised shield, a paid
charge, firing into a rake's blind arc) is a mechanic.

**Obsolete outright:** the machine-gun crit cap (`sev.tier === "critical" && profile.machineGun`)
has nothing to cap — volume weapons are now bounded by D1 instead.

## UI

The panel that prompted this work must show the roll that decided the outcome.

- **Wound dice join `rolls`** as `wound 1..N`, toned pass/fail, so they animate in the DICE zone
  beside the hit dice. Today's impact dice are rolled and discarded, which is why the player could
  not answer "why 0 damage?".
- **The damage zone shows the wound line**: target's T for the struck location, the shot's
  effective STR, and the resulting target number (`STR 4 vs T5 → 7+`).
- `ResolutionBreakdown.tier` and the `direct/severe/critical` badge are **removed** — there are no
  tiers. `total` is likewise gone. `sp` becomes wounds × D.
- The glossary and any `InfoTerm` entries covering impact rows / severity need rewriting.

## Testing

- `woundTarget(S, T)` — clamps at both ends; `2..10`; a natural 10 always wounds; a natural 1
  never does.
- No dead zones: sweep every weapon × attacker class × target class × location and assert every
  combo has a nonzero wound chance. This is the regression test for the original bug and should
  be written to fail against the old model.
- The bug case explicitly: light Circular Saw vs medium hull is `7+`, not impossible.
- Sunder / Dismember fire on a wound (they gate on damage > 0 and were unreachable before).
- Earned zeroes still zero: shield negate and Raking front-arc deal nothing on a natural 10.
- Per-weapon D is applied per wound, not per hit.
- Expected-damage band holds: no weapon outside ~0.8–3.0 SP/volley vs a medium hull (Sidearm
  exempt).

Existing tests that will break and need rewriting rather than patching: `combat.test.js` around
the `weapon STR` breakdown terms and the "per-die roll for each hit-die plus a location d12"
assertion (there are wound dice now), plus every `impactSeverity` unit test.

## Migration

`impactSeverity`, `RIG_IMPACT`, and the armour tables in `unit-kinds.js` are deleted, not
deprecated. Three call sites read `impactSeverity` today — `combat.js` `rollImpacts`, the Reactive
Armor re-derive in `applyDefensiveReactions`, and the Blast branch in `game-state.js` (`D6 + STR 10`,
which needs its own conversion to a wound roll). `client/shared.d.ts` mirrors these signatures.

In-flight saved rigs carry no impact data, so there is no save migration — but `content/chassis.json`
and `client/src/v2/lib/commissionData.ts` mirror weapon stats and must move with `WEAPONS`.

## Open questions

- **Does a natural 10 do anything beyond wound?** A crit hook exists for free here (the die is
  already distinct) and could rehome some of the flavour lost with `critical`. Deliberately
  unresolved — decide before the plan, not during it.
- **Rend vs Armour Piercing** both map to "reroll failed wounds", which makes them the same perk
  with different names. One needs a different mechanic.
- **Tank / Walker toughness grids** are TBD.
- **Ram** (`RAM_STR`) resolves through `rollImpacts` today and inherits the rewrite; its STR needs
  rescaling with everything else.
