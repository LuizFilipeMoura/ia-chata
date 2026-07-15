# Weapon balance — Monte Carlo findings

**Status:** F1-A, F3-B **shipped** 2026-07-15 and re-measured. F2/F4/F5 open — read
"Re-measured" below before acting on them, the numbers here are pre-change.
**Date:** 2026-07-15
**Harness:** `scripts/balance/weapon-sweep.mjs` + `scripts/balance/report.mjs`
**Raw report:** `scripts/balance/report-2026-07-15.txt` (pre-change baseline)
**Post-change:** `scripts/balance/report-2026-07-15-overflow.txt` (500 trials)

---

# Re-measured — what shipped and what it did

Design: `docs/superpowers/specs/2026-07-15-str-overflow-design.md`.
Plan: `docs/superpowers/plans/2026-07-15-str-overflow.md`.

**F1-A shipped** as Overmatch: STR past the wound clamp's floor converts to damage
at +1 D per 3, capped +2 (`strOverflowD`, `rules.js`). **F3-B shipped** as a
magnitude nerf, not a re-tier: Swarm Warheads +2 ROF → +1, staying Field, because
`+2 ROF` is a raw stat and Field *means* raw stats — the tier was right, the
number was the outlier.

## F1 — fixed, all three levers

| lever | before | after |
|---|---|---|
| arc bonus | ×1.00 on all six | Harpoon ×1.31, Lance ×1.25, Sniper ×1.24, Anchor ×1.24, Wrecking Ball ×1.19, Siege Maul ×1.18 |
| `WEIGHT_STR_MOD` | Δ0.00 on all six | 5–9% on all six |
| +STR upgrades | +0.00, every one | haymaker +0.41, fluked-head +0.41, cold-bore +0.69, reinforced-head +0.35, full-tilt +0.61, momentum-swing +0.31 |

Flanking a Wrecking Ball rig is now worth +19%. Haymaker now buys +0.41 SP.

## F3 — fixed

Swarm Warheads uplift **+2.31 → +1.20**. Missile Barrage **6.92 → 5.98**, no longer
alone at the top. Its tuned tier (5.34) now sits within 0.64 of its field tier
rather than 1.70 below it.

## F2 — NOT fixed, and F2-A's hypothesis is falsified

F2-A said: *"F2 is partly caused by F1… With STR overflow, a Wrecking Ball's
rear-arc shot becomes D6 and ROF-1 weapons climb without touching ROF. This may
resolve most of the spread on its own."*

It did not. Measured:

| weapon | profile | before → after |
|---|---|---|
| Rivet Gun | STR 3, D1, ROF 6 | 3.64 → 3.65 |
| Wrecking Ball | STR 10, D5, ROF 1 | 2.25 → **2.98** |
| Anchor | STR 10, D4, ROF 1 | 1.80 → **2.53** |
| Autocannon | STR 7, D2, ROF 4 | 4.82 → **6.05** |

**A rivet gun still out-damages a wrecking ball.** The heavies climbed 32–41%, the
gap narrowed from 1.39 to 0.67 SP — but the inversion survives, and the spread
(excluding Bulwark Shield, whose value F8 says this metric cannot see) only went
3.8× → 3.1×.

**Why, and it is structural.** Expected damage ≈ `ROF × P(hit) × P(wound) × D`.
Overflow adds to **D** — the term ROF *multiplies*. So a high-ROF weapon banks the
bonus once per shot in its volley and a ROF-1 weapon banks it once, full stop.
Overflow favours heavies only insofar as they overflow *more*, and the +2 cap
bounds that at 2× while ROF spans 1–8.

The weapon that gained most is the one this design never aimed at: **Autocannon
+1.23**, the largest absolute gain of any weapon, because Depleted Core (+2 STR)
lifts it to STR 9 → 12 on a rear arc → +1 D, multiplied by ROF 4. A mid-STR,
high-ROF gun captures more of Overmatch than any heavy does.

**Consequence: F2-B (price ROF in heat) is now the live option**, not a fallback.
F2's recommendation was "A, then re-measure, then B if the spread persists." A has
shipped, this is the re-measure, and the spread persists. B is next.

## F4 — reconnected, still small

Δ0.00 → 5–9% on the six. Real, but the per-3 integer rate means a ±1 modifier only
bites when overflow crosses a multiple of 3. **F4-C (delete `WEIGHT_STR_MOD`)
remains open** — this change made the question measurable rather than answering it.

## F7 — unchanged, as intended

Still exactly **504 dead cells**, all Raking Fire front arc. Overflow did not
accidentally "fix" a deliberate mechanic.

## Caveat on these numbers

500 trials, against a 3000-trial baseline. Ratio noise ≈ ±0.045 — enough to trust
a structural zero moving off zero, not enough to tune against. **Do not re-tune
from this report.** If F2-B proceeds, run `TRIALS=3000` first.

---

## Method

32.3M simulated attacks. 10,752 cells × 3000 trials, driving the real
`resolveAttack` through an injected `ctx` (no game-state mutation), fresh
`structuredClone` of attacker and target per trial so per-shot cadence state
(Penetrator's belt, Momentum, suppression stacks) can't leak between samples.

Sweep axes — **rigs vs rigs only**, no Tanks/Walkers:

| axis | values |
|---|---|
| weapon | all 22 rig weapons (11 ranged + 11 melee) |
| upgrade tier | `none` (synthetic) / field / tuned / prototype |
| attacker | light, medium |
| target | light rig, medium rig |
| arc | front, side, rear |
| distance | min, sweet−6/−4/−2, sweet, +2/+4/+6, mid-band, max (~9 per weapon) |
| condition | `cold` (fresh target, cold attacker) / `primed` (half-dead target, overheated + charging attacker, target pinned/disrupted) |

**Metric:** mean SP delivered to the primary target by ONE attack action, no
cover, no aim. Damage is counted at the `ctx.applyDamage` seam, not from
`impacts` — on-hit extras (Mortar's cluster-shells, `combat.js:1102`) land there
and are otherwise invisible.

The `cold` / `primed` pair exists to bracket conditional upgrades: Cold Bore only
pays in `cold`; Evisceration / Exploit Wound / Bloodletter / Redline /
Superconductor / Opportunist / Taut Cable / Full Tilt only pay in `primed`.

### Two harness traps worth remembering

1. **`none` is not reachable in play.** `normalizeWeaponUpgrade`
   (`game-state.js:651`) returns `upgrades[0].id` for a null/unknown id, so
   `makeRig` *cannot* build an un-upgraded rig — **field is the floor**. The first
   run silently measured field twice and every conclusion from it was garbage. The
   `none` column here is produced by a synthetic `profileFor` that bypasses that
   fallback. It is a measuring stick, not a legal loadout.
2. **A single-shot metric cannot see multi-turn value.** See "Not measured" below
   before reading any `+0.00` as "useless".

## Results — SP per attack, best distance, pooled over targets/arcs/classes

```
weapon            slot       | none  field  tuned  proto
Missile Barrage   longRange  | 4.61  6.92  5.22  4.61
Flamethrower      melee      | 4.36  6.53  4.36  4.36
Autocannon        longRange  | 4.61  4.82  5.22  4.61
Double MG         longRange  | 3.14  3.52  3.14  4.61
Claw              melee      | 3.42  4.56  3.44  3.42
Mortar            longRange  | 3.48  4.44  3.48  3.48
Mini Gun          longRange  | 3.50  3.50  4.37  3.50
Pressure Claw     melee      | 3.42  3.91  3.42  3.42
Chainsaw          melee      | 2.59  3.89  2.59  2.59   (5.42 primed)
Rivet Gun         longRange  | 2.74  3.64  2.74  2.74
Crossbow          longRange  | 3.58  3.58  3.64  3.58
Arc Gun           longRange  | 3.54  3.54  3.54  3.54
Talon             melee      | 3.23  3.54  3.23  2.95   (4.31 primed)
Siege Maul        longRange  | 3.04  3.04  3.04  3.04
Sniper Cannon     longRange  | 3.03  3.03  3.03  3.03
Circular Saw      melee      | 2.22  2.75  2.22  2.22
Lance             melee      | 2.42  2.42  2.42  2.42
Harpoon           longRange  | 2.27  2.27  2.27  2.27
Wrecking Ball     melee      | 2.25  2.25  2.25  2.25
Sword             melee      | 2.20  2.20  2.20  2.20
Anchor            melee      | 1.80  1.80  1.80  1.80
Bulwark Shield    melee      | 1.11  1.11  1.11  1.11
```

Best-tier spread: **1.11 → 6.92 SP/attack, a 6.2× gap.**

---

# F1 — The STR ladder is saturated (the big one)

`woundTarget = clamp(2, 10, 6 + T − STR)` (`rules.js:95`). Every rig location is
T3–T5 (`unit-kinds.js:16`). So **any STR ≥ 9 sits on the TN-2 floor against every
part of every rig.** Six weapons live there: Siege Maul (11), Sniper Cannon /
Harpoon / Wrecking Ball / Anchor (10), Lance (9).

For those six, three separate design levers are dead at once. The sweep confirms
each independently:

| lever | evidence |
|---|---|
| arc bonus (+2 side / +3 rear) | rear/front ratio **×1.00** — Sniper, Siege Maul, Harpoon, Wrecking Ball, Anchor (Lance ×1.01) |
| weight class (`WEIGHT_STR_MOD`) | light↔medium delta **Δ0.00** for exactly those six |
| +STR upgrades | haymaker +3, fluked-head +3, reinforced-head +2, cold-bore +3, full-tilt +3, momentum-swing +2 → **+0.00 uplift** every one |

Flanking a Wrecking Ball rig is worth *nothing*. Haymaker is worth *nothing*. The
same +3 on an Autocannon (STR 7) moves TN 4→2 and is worth real damage.

Effective STR ceiling: **~8** vs a medium hull, **~7** vs a light hull, **~6** vs
an engine (T3). The entire STR 9–11 band is dead stat — and it is exactly where
the game's "heavy hitter" identity lives.

### Solutions

**A. STR overflow converts to damage — recommended.**
Excess STR past the TN-2 floor becomes bonus D (e.g. +1 D per 3 STR over the
floor point). One change restores all three dead levers simultaneously: a rear-arc
Wrecking Ball now overflows into +1 D instead of nothing, Haymaker buys depth,
and the light/medium mod matters again. Preserves the fantasy — big weapons both
wound easily *and* hit harder — and needs no re-tune of the existing stat tables.
Cost: a new rule at the wound step; interacts with Rend/Evisceration (all three
stack into `d`, so check the ceiling).

**B. Widen rig toughness to ~4–8.**
Un-saturates the top of the ladder using the existing formula, no new rules.
Cost: weakens every weapon at once, so SP pools and the whole D ladder need a
matching pass. Touches the most tuned numbers in the game.

**C. Compress weapon STR into 3–8.**
Bring the six offenders down (Siege Maul 11→8, the 10s→7–8, Lance 9→7) and pay
them back in D or ROF. Cheapest to implement, keeps `woundTarget` untouched.
Cost: flattens the stat *fiction* — a Siege Maul reading STR 8 next to an
Autocannon's 7 undersells it, and F2 says D pays back much less than it looks.

**D. Accept saturation; make it the identity.**
Declare STR ≥ 9 as "wounds anything, always" and delete the dead levers for those
weapons — drop their +STR upgrades and replace with utility, and document that
flanking them is pointless. Cost: three mechanics silently do nothing on a
quarter of the arsenal, which is exactly the readability failure the wound-engine
rewrite was meant to end.

**Recommendation:** A, optionally with C for the worst outlier (Siege Maul 11).
A is the only option that makes the existing upgrades and arc rules mean something
without a full re-tune.

---

# F2 — ROF dominates; the "big slow hitter" fantasy is inverted

Expected damage ≈ `ROF × P(hit) × P(wound) × D`. Saturation (F1) compresses
`P(wound)` into 0.7–0.9 across the *entire* arsenal — a **1.3× lever**. ROF spans
1–8: an **8× lever**. So damage ranking tracks ROF and essentially ignores STR.

The inversion, straight from the table:

- **Rivet Gun** (STR 3, D1, ROF 6) → **3.64**
- **Wrecking Ball** (STR 10, D5, ROF 1) → **2.25**
- **Anchor** (STR 10, D4, ROF 1) → **1.80**

The heaviest weapons in the game are the weakest. The top of the board is ROF 6
Missile Barrage and ROF 4 Flamethrower. Per the design note at `game-state.js:41`,
`d` exists to differentiate the ROF-1 weapons — it isn't succeeding, because ROF
multiplies against a near-constant wound chance while D only adds.

### Solutions

**A. Fix F1 first, then re-measure — recommended as step 1.**
F2 is partly *caused* by F1: `P(wound)` is a dead lever only because it's clamped.
With STR overflow (F1-A), a Wrecking Ball's rear-arc shot becomes D6 and ROF-1
weapons climb without touching ROF. Re-run the sweep before tuning anything else —
this may resolve most of the spread on its own.

**B. Price ROF in heat.**
High-ROF weapons currently pay nothing (Mini Gun has no heat cost; Missile Barrage
ROF 4→6 via a *field* upgrade is free). Make sustained high-ROF fire cost heat per
volley, so the ROF lever trades against the heat economy instead of being pure
upside. Fits the existing `fireModeHeat` seam in `rollToHit`.

**C. Direct re-tune.**
Swarm Warheads +2 ROF is the single strongest upgrade in the game (+2.31); pull it
down or move it off the field tier. Raise D on the ROF-1 weapons. Cost: whack-a-mole
without fixing the underlying lever asymmetry.

**D. Make D scale super-linearly on low-ROF weapons.**
E.g. a ROF-1 weapon's wound rolls a damage die rather than a flat `d`. Adds
variance and a new roll at the table; probably not worth it.

**Recommendation:** A, then re-measure, then B if the spread persists.

---

# F3 — Upgrading past field can *lose* you damage

Missile Barrage: field **6.92** → tuned **5.22** → prototype **4.61**. Field's
Swarm Warheads (+2 ROF) beats AP (tuned) and Fire Control Lock (prototype),
straight out of F2. Same shape on Flamethrower (6.53 → 4.36 → 4.36) and Chainsaw
(3.89 → 2.59). **Field is the best damage tier for 10 of 22 weapons.**

Since field is also the *floor* (see harness trap 1), "upgrade" currently means
"sidegrade or downgrade" for a big slice of the catalog. Nature is meant to read
Field < Tuned < Prototype in commitment, and the risk/reward slider in the
commission wizard sells it that way.

### Solutions

**A. Accept it and make it explicit — recommended.**
The tiers are *natures*, not a power ladder: Field = raw stats, Tuned = conditional
stats, Prototype = a new mechanic with a catch. A prototype that deals less raw SP
than a field upgrade is fine *if* its mechanic is worth the trade. The problem is
the wizard's framing implies a ladder. Fix the copy, not the numbers — and note
several prototypes are unmeasurable here anyway (see "Not measured").

**B. Re-tier the outliers.**
Swarm Warheads (+2 ROF, +2.31) is not a field-grade effect. Swap it with a tuned
or prototype effect on the same weapon.

**C. Floor the ladder.**
Require every tuned/prototype to be ≥ its field sibling in raw SP. Cost: kills
utility-first prototypes and forces damage onto mechanics that shouldn't carry it.
Not recommended.

**Recommendation:** A + B for Swarm Warheads specifically.

---

# F4 — Weight class barely matters for damage

`WEIGHT_STR_MOD` is −1 light / 0 medium. Measured light→medium delta, best tier:

- **Δ0.00 (0%)** — Sniper Cannon, Siege Maul, Harpoon, Wrecking Ball, Anchor (the F1 six)
- **<8%** — most of the rest
- **20%** — Rivet Gun (STR 3, the lowest in the game, so far from the clamp)

The pattern is a direct corollary of F1: the mod only bites where STR isn't
saturated, and it's worth at most ~1 point of a lever that spans 0.7–0.9.

### Solutions

**A. Fix F1 — recommended.** With overflow, the −1 always costs something (a
fraction of a D step), on every weapon. No separate change needed.

**B. Move the light-chassis cost off STR.** If light rigs are meant to be worse
shooters, express it somewhere unsaturated — ROF, ACC, or heat capacity — rather
than a STR point that's usually clamped away.

**C. Delete `WEIGHT_STR_MOD`.** It's ~0–8% on most weapons and 0% on a quarter of
them; it's a rule the player must remember for almost no effect. Let per-chassis
speed and SP carry the weight-class identity (they already do).

**Recommendation:** A. Revisit C afterwards if the mod still doesn't earn its
place at the table.

---

# F5 — Light and medium targets are nearly identical, and medium is strictly better

Mean SP taken per attack: **light 2.56 vs medium 2.46** — a 4% difference, from a
toughness split of light `4/3/3/3` vs medium `5/4/4/3`.

But medium chassis also carry *more* SP (hull 14–16 vs 11–13). So medium is
tankier on both axes and pays ~4% for it. Light's only compensation is speed
(5–6 vs 3–4). Toughness is a weak lever for the same reason as F1/F4: ±1 T is
±10% on a wound roll that's frequently clamped.

### Solutions

**A. Widen the toughness split.** Push medium up (e.g. `6/5/5/4`) or light down.
Only works in combination with F1 — while STR ≥ 9 saturates, more T on medium
still does nothing against a third of the arsenal.

**B. Re-price the SP pools.** If medium is meant to be the durable one, let SP
carry that alone and flatten toughness between the classes. Fewer levers, clearer
identity.

**C. Verify speed actually pays.** The claim "light trades durability for speed"
is untested — this sweep is positional-agnostic (arc and distance are inputs, not
outcomes). A light rig's speed only pays if it converts into better arcs and
better range bands. That needs a positional//turn-level sim, not this one.

**Recommendation:** C first — don't tune durability until we know what speed is
worth. Then A alongside F1.

---

# F6 — Range is the sharpest lever in the game, and point-blank is a trap

Retention at max range (vs peak): Sniper **80%**, Crossbow 67%, Harpoon 59%,
Missile Barrage 50%, Arc Gun / Mortar / Siege Maul 49%, Rivet Gun 40%, Double MG
25%, Autocannon 25%, **Mini Gun 20%**.

And closer is *not* better — the sweet spot is a ridge in both directions:

```
Autocannon    0":1.1   sweet(12"):4.6   max(26"):1.1
Mini Gun      0":2.1   sweet(7"):3.5    max(18"):0.7
```

An Autocannon at point-blank does **24%** of its sweet-spot damage. This is a
genuinely good mechanic — it's the strongest, cleanest lever measured, it rewards
positioning, and unlike arc it works on every weapon including the saturated six.
Flagged as a finding only because it's undocumented and much sharper than arc
(×1.00–×1.80) — players will feel it without being told.

### Solutions

**A. Nothing — surface it.** Working as designed and doing the most work of any
lever. Make the wizard/HUD show the range band and the ACC being paid, so the
ridge is legible at the table. (`rigEffects` / the attack wizard already have the
distance; this is a display question.)

**B. Consider a minimum range on the worst offenders.** Autocannon at 24% is
already a soft min-range; making it explicit would be more readable than an
invisible dropoff curve. Optional.

**Recommendation:** A.

---

# F7 — Raking Fire's dead front arc (working as designed)

All **504 zero-damage cells** in the sweep are Raking Fire's front arc — Mini Gun
and Double MG, every tier except Double MG's Kneecapper, every distance, both
conditions. This is `arcBonus` returning `null` (`combat.js:401`) and is
intentional.

Kneecapper is exactly the designed escape and it measures well: it bypasses the
front auto-fail for limb hits and is Double MG's best tier (**3.14 → 4.61,
+1.47**).

No action. Recorded so a future sweep doesn't "fix" it.

---

# F8 — Bulwark Shield is the floor at 1.11 SP

Half the next-worst weapon (Anchor 1.80), 6× below the top. Expected for a
defensive weapon whose value is Raise Shield (negates arcs outright) and whose
upgrades are all defensive (Tower Shield, Anvil Boss, Emplacement) — none of which
a single-attack damage metric can see.

### Solutions

**A. Nothing.** It's a shield. Its value is in `shieldCoverage` and the riposte,
measured nowhere in this sweep.
**B. If it feels bad at the table**, the lever is Anvil Boss's riposte (`riposteStr: 6`,
a forced flat STR), not the shield's own profile.

**Recommendation:** A, pending a defensive-side sweep.

---

# Not measured — do not read these as weak

A single-shot SP metric is blind to multi-turn and utility value. Every upgrade
below scored `+0.00` for reasons that are **harness limits, not balance verdicts**:

| upgrade | why unmeasured |
|---|---|
| Penetrator Rounds | fires every 3rd volley; each trial is a fresh clone, so the cadence never reaches 3 |
| Fire Control Lock | needs a prior paint turn (`lockedTarget` + `lockExpiresRound`) |
| Enfilade | every 3rd *aimed* shot; sweep fires unaimed |
| Barrage | shells a zone over 2 rounds |
| Napalm / Conflagration / Ion Burn (Incendiary) | burn is damage-over-time across activations |
| Rivet Lock, Breach Grip, Sunder, Crush Grip, Dismember | need repeated//persistent hits on one location |
| Suppression Lock, Pinning Burst, Staple Burst, Systems Overload | action denial, not SP |
| Tow Chain, Harpoon Winch, Skewer, Ground Anchor, Dead Weight | spatial / lock effects |
| Emplacement, Tower Shield, Anvil Boss | defensive |

**Follow-up worth doing:** a turn-level sim (N rounds, two rigs, cadence and DoT
and heat carried across activations) would value these properly. That is a
different harness, not a parameter change to this one.

---

# Bug found and fixed during this work

**`combat.js:728` read the hit-location table off the attacker's kind instead of
the target's.**

```js
// before
location = opts.aimed ? opts.aimedLoc : hitLocation(attacker.kind || "rig", locDie);
```

The table names the parts *being shot at*, so it must be the target's. A Rig
shooting a Tank rolled `arms`/`legs` — parts a Tank doesn't have — and
`toughnessOf` threw: `toughnessOf: no T for tank/flat/legs`. A hard crash on ~50%
of landed hits vs a Tank, ~25% vs a Walker, and on every Tank/Walker→Rig hit.

Rig↔Rig never tripped it (both share a part list), which is why the whole shared
suite missed it. Every other call site was already correct (`combat.js:1097`,
`game-state.js:3446`), and the unit-system plan specifies the target's kind
(`docs/superpowers/plans/2026-07-06-unit-system.md:330`).

Fixed, with a regression test pinning both directions of the cross-kind matrix
(`combat.test.js`, "hit location comes from the target's kind"). Shared suite
green, 706/706 at time of writing. **Committed** — the fix and its comment are at
`combat.js:728` and the regression test is in the shared suite. (This section
previously read "Uncommitted, in the working tree"; that was already stale when
the STR-overflow work began.)

---

# Reproducing

```bash
TRIALS=3000 node scripts/balance/weapon-sweep.mjs > full.json 2>progress.txt   # ~12 min
DATA=full.json node scripts/balance/report.mjs
```

`TRIALS=200` gives a usable read in ~15s. The harness asserts its own tier ladder
on startup (every weapon must expose 3 upgrade ids, each yielding a distinct
profile) — this is what catches the field-is-the-floor trap that silently ruined
the first run.

## Suggested order of work

1. ~~**F1-A (STR overflow)**~~ — **DONE.** Shipped as Overmatch. Revived all three
   levers and all six upgrades; see "Re-measured" above.
2. ~~**Re-run the sweep.**~~ **DONE** at 500 trials —
   `scripts/balance/report-2026-07-15-overflow.txt`.
3. ~~**F3-B** — re-tier Swarm Warheads.~~ **DONE**, as a magnitude nerf rather than
   a re-tier: `+2 ROF` is correctly Field-shaped, so the tier was never the
   problem. Uplift +2.31 → +1.20.
4. **F2-B (price ROF in heat)** — *promoted to next.* Step 2 falsified F2-A's
   hypothesis that fixing F1 would resolve the spread. It didn't, for a structural
   reason: overflow adds to D, which ROF multiplies. ROF remains an 8× lever
   against a wound chance that is now unclamped but still narrow. Run
   `TRIALS=3000` before tuning.
5. **Turn-level harness** — value the ~20 upgrades this sweep can't see. Note
   Redline Governor now measures **+4.85 primed**, the largest conditional swing in
   the game, which this single-shot metric still cannot properly price.
6. **F5-C** — find out what speed is actually worth before touching durability.
7. **F4-C** — revisit deleting `WEIGHT_STR_MOD`. Now worth 5–9% instead of 0%, so
   the question is finally measurable; it was not before.
