# The duel harness — design

**Date:** 2026-07-15
**Status:** approved, not implemented
**Source:** `docs/superpowers/specs/2026-07-15-weapon-balance-findings.md` (step 5)
**Sub-project:** 1 of 2. Step 2 is bot-vs-bot, gated on the opponent brain
(`2026-07-15-opponent-brain-design.md`) — see "When to build step 2".

## Problem

**The existing sweep cannot see half the catalog.** Of the 85 upgrades it
measures, **44 (52%) are worth +0.00 in both conditions**. Arc Gun's and Bulwark
Shield's *entire* three-tier trees are invisible.

So its ranking does not measure weapon strength. It measures **how much of each
weapon happens to be raw stats**. Flamethrower tops the board at 6.53 because
Sticky Fuel is +2.19 of pure stat; Sword sits at the bottom at 2.20 because all
three of its tiers are conditional — Duelist's Balance grants Precision, which
waives the aimed-shot penalty, and the sweep fires *unaimed*.

This blocks everything downstream. It has now killed three separate proposals:

| blocked | why |
|---|---|
| **F2-B** (price ROF in heat) | heat is a multi-turn resource; the sweep stubs `bumpHeat` |
| **per-weapon tuning** | can't see 52% of the catalog; would buff weapons for being *legible*, not weak |
| **F2-C** (raise D on ROF-1 weapons) | can't judge what the heavies' conditional kit is already worth |

It is the bottleneck, not a follow-up.

**The cause is one line.** `weapon-sweep.mjs` takes a fresh `structuredClone` of
attacker and target per trial — deliberately, so per-shot cadence state can't leak
between samples. That decision is what makes the metric clean *and* what makes it
blind: nothing accumulates, so nothing that needs two rounds exists.

## Decisions

| decision | choice | rejected |
|---|---|---|
| scope | **scripted duel now, bot-vs-bot later** | bot-first (gated on the opponent brain, itself gated on an `effectiveStrAgainst` refactor) |
| metric | **SP@10 primary, wreck-rate secondary, B's SP@10 free** | rounds-to-wreck (censored, awkward); SP alone (gamed by shredding limbs) |
| policy | **greedy-safe** — fire while heat ≤ capacity, else Shut Down | fire-once (heat never binds — rebuilds the blindness); fire-max (everyone overheats — discriminates nothing) |
| loop | **drive `applyCommand`** | model the round ourselves |
| mode | **physical** — arc/distance declared | digital (needs deployment + geometry for no gain) |

### Why "drive, don't re-implement" is the load-bearing decision

The action budget, the heat payment, the second-shot surcharge, Recovery cooling,
the overheat table and round advance all live in `game-state.js`. A harness that
models them itself is a second copy of the rules that drifts from the first —
and then prints confident numbers about a game nobody is playing.

The Overmatch work watched a *comment* drift from its code four times in three
tasks. A re-implemented rules engine is that same failure at scale, and worse:
invisible, because the harness still prints a tidy table.

So the sim owns exactly two things it cannot borrow: **which command to issue**
and **what to record**. Everything else it asks the engine for. This is the same
argument the opponent-brain spec makes for its bot — *"it goes through the same
validation, rejection, and resolution path a human does; it cannot cheat and
cannot desync."*

## Architecture

Physical mode (`room.mode` defaults to `"physical"`, `game-state.js:786,923`), so
distance and arc are **declared per command** — no positions, no deployment, no
geometry. Arc and distance stay inputs, exactly as in the current sweep.

| file | responsibility |
|---|---|
| `scripts/balance/duel-sim.mjs` | seed a room, run 10 rounds via `applyCommand`, emit JSON |
| `scripts/balance/policy.mjs` | the greedy-safe policy |
| `scripts/balance/duel-report.mjs` | SP@10 + wreck-rate formatter |

**The policy gets its own file because it is this harness's largest bias.** The
current sweep's fatal flaw was a measurement decision (`structuredClone` per
trial) buried where nobody thought to question it. Put the bias where it is
visible, named, and swappable.

10 rounds is not arbitrary: `MAX_ROUNDS = 10` (`rules.md:103`) is the real game.

### The axes must shrink — the one non-obvious cost

The sweep does 10,752 cells × 3000 trials = 32.3M attacks in ~12 min. A duel is
~15–20 attacks, so the same grid would be ~485M attacks — **roughly 3 hours**.

| axis | sweep | duel | why |
|---|---|---|---|
| weapon × tier | 22 × 4 | **22 × 4** | the point |
| attacker class | light, medium | **both** | cheap |
| target | light, medium rig | **both** | cheap |
| arc | front/side/rear | **side only** | one arc is enough (F1/F6 own arc, and it doesn't interact with cadence) — but it must be **side**, not front. See below. |
| distance | ~9 bands | **sweet spot only** | F6: range is the sharpest lever and works as designed |

> **The arc must be side, and this spec originally said front — which measured
> two weapons as a structural zero.**
>
> `arcBonus` returns **`null`** for Raking Fire on the front arc
> (`combat.js:401-411`), which is a hard "earned zero", not a failed roll. Mini
> Gun and Double MG are the only two weapons carrying the perk. So a front-only
> duel reports **`spDealt: 0` for both, in every tier, at every seed** — verified:
> Mini Gun ran 10 full rounds dealing literally nothing while taking 26–33 SP.
>
> This is F7 in the findings doc — *"All 504 zero-damage cells in the sweep are
> Raking Fire's front arc"* — i.e. the very document this harness was specced
> from. The sweep survives it by pooling over arcs; a single-arc duel cannot.
>
> Side is live for all eleven weapons (standard +2, Raking +3 — the designed
> asymmetry), and it is the arc a competent player actually seeks now that F1
> revived the bonus. Measured at side: Mini Gun **27.7**, Double MG **27.7**,
> Autocannon 31.0, Siege Maul 30.0 — all comparable, none structurally dead.
>
> The lesson generalises past the arc: **cutting an axis is a measurement
> decision, and the thing to check is whether any cell becomes structurally
> unmeasurable — not whether the axis is "interesting".** A harness built because
> 44 upgrades read a misleading 0.00 must not manufacture fresh ones.

352 cells × 500 trials × ~15 attacks ≈ **2.6M attacks, about a minute**. The
dropped axes are not a loss — the existing sweep owns them, and this harness
exists to answer what that one structurally cannot.

## The policy

```js
// scripts/balance/policy.mjs
export function greedySafe(room, rig, enemy) { … }
```

Three rules, in order:

1. Ranged spent and reload is free → **reload**
2. Firing keeps heat at or under capacity → **fire**
3. Otherwise → **Shut Down** (vents `min(5, 2 × actionsLeft)`, `game-state.js:2554`)

**It asks the engine what things cost; it does not compute them.**
`availableActions` (`battle-view.js`) already returns `{ key, heat, enabled, cost,
note }` per action, including the second-shot surcharge. The policy reads that.
No second copy of the cost rules — and it dogfoods the same view-model the UI
renders, so if the action console lies to a player it lies to the harness too, and
the bug surfaces.

### Correction: `availableActions` is a UI model, not a legality oracle

This section originally claimed "the engine owns legality" and left it there.
That is **only partly true**, and implementing the policy found three places where
`enabled` disagrees with what the engine will actually do. All three were verified
against source:

| the view says | the engine does | why |
|---|---|---|
| a **spent** weapon's Fire tile is `enabled` (`battle-view.js:43-46`) | firing it is a **silent no-op** (`game-state.js:2287`) | Fire is what opens the reload drawer, so the tile must stay live for a human |
| Shut Down is **hardcoded** `enabled` (`battle-view.js:37`) | refuses while a meltdown charge is banked (`game-state.js:2559`) | the tile is "available any time" for the player; the engine has the real gate |
| — | `shutdown` calls `endActivation`, so `activeRigId` goes null and every later command is dropped | the view has no notion of "you already ended" |
| a **gunless** rig's Fire tile is `enabled` | `combat.js:668` refuses with `weapon-destroyed`, and `performAction`'s `return !!res` swallows it — the surfaced reason is a generic "can't be applied right now" | an Arms hit at 0 SP rolls a weapon dead (`game-state.js:1679`); the tile never learns |

### A fifth shape, and its tell is different

The four above are all **the view saying yes where the engine says no**. The fifth is worse, because nothing lies:

**`arcBonus` returns `null` for Raking Fire outside side/rear** (`combat.js:402-406`). No refusal is recorded anywhere. The command applies, the volley resolves, the damage is genuinely 0. Every layer is telling the truth — and the output is indistinguishable from a weapon that simply rolled badly.

The old sweep survives it by pooling arcs, and even then it took **504 cells** to notice (F7). A single-condition duel just prints it as a measurement.

So the tell for the first four is *"check whether the tile lied."* The tell for this one is:

> **Check whether a zero is a measurement or a rule.**

### A sixth, and the rule for writing the guard

**Rivet Lock** (`game-state.js:2811-2817`) seizes the control's weapon-role location; the engine refuses its fire while the Fire tile stays `enabled`. It crashed the sweep on ~10% of `Rivet Gun / prototype` trials — the driver's no-op detector doing its job, since unlike Ion Storm (which clears itself on refusal, so one retry succeeds) a rivet **persists ~2 rounds**.

The interesting part is not the bug; it is that **both plausible fixes were wrong, and both would have failed silently rather than loudly.**

| candidate guard | why it's wrong |
|---|---|
| `Object.values(rivetSeized).some(v => v > 0)` | drops the engine's **role filter**. `partsByRole("rig","weapon")` is `["arms"]` alone — a rivet on **legs still fires**. This guard vents a rig that shoots fine. |
| `v > room.game.round` (round-aware) | **inverted.** Recovery deletes expired seizes (`:2062`, `if (rivetSeized[loc] < round) delete`), so presence *is* liveness — which is why the engine's own test is a bare `> 0`. A seize applied in round R stores `R+1`, so on the lock's second round `value === round` and this guard **fires through a live lock**. |

Both are quieter than the crash and worse than it: the harness would under-report a weapon rather than stop. **A crash tells you; a wrong number doesn't.**

> **The rule: when mirroring an engine refusal, copy its *predicate*, not its *gist*.**

Read the engine's actual condition — its role filter, its comparison, its expiry semantics — and reproduce it exactly. A guard written from a plain-English summary of the rule ("if the weapon is riveted, don't fire") lands on one of the two wrong answers above. Both were caught only by mutation-testing the near-misses, not the absence.

That is the whole reason `arc` is a required parameter with no default, and why `policy.test.mjs` pins `arcBonus(miniGun, "front") === null` against the real profiles — with a contrast case (`arcBonus(mortar, "front") === 0`) showing that a non-Raking weapon has no cliff. Pinning the *reason*, not the throw.

Measured, to make it concrete — Mini Gun, five seeds, real engine:

| arc | spDealt |
|---|---|
| front | `[0, 0, 0, 0, 0]` |
| side | `[5, 7, 9, 7, 5]` |
| rear | `[8, 9, 11, 11, 7]` |

**The first one nearly destroyed the harness.** The policy as originally specced
fired once and then emitted `fire` forever into a no-op — heat, actions and shots
all frozen. The duel would have stalled on volley one and reported a tidy table:
precisely the blindness this harness exists to remove, reproduced in a new place.
It passed every test the spec asked for.

The lesson is not "don't read `availableActions`" — the cost data is right, and
`RELOAD_MAX_HEAT` aside it remains the single source of pricing. It is that
`enabled` answers *"should the UI offer this?"*, not *"will this command have an
effect?"* Those coincide for a human, who reads the drawer the tile opens. They do
not coincide for a policy.

So the policy carries three engine-verified exceptions, each documented inline at
its site, and **`policy.test.mjs` pins the stall itself** — driving real
`applyCommand` calls and asserting `longRangeShots >= 2`. Pin the defect, not the
fix; a future refactor that reintroduces it must go red.

### Reload is a cost the old sweep never paid

A rig reloads for **0 action slots**, paid in heat instead: a d6, where 1–3 costs
2 heat and 4–6 costs 1 (`game-state.js:2705`). The clone-per-trial sweep never
reloads, so it never pays this. The duel does, every time a weapon runs dry.

Consequence for reading the numbers: **the duel is not a like-for-like baseline
against `report-2026-07-15-overflow.txt`.** Weapons that empty often now carry a
real recurring cost the single-shot metric was blind to. That is more truthful,
not less — but it must be said in the report header, or someone will diff the two
tables and call the difference a bug.

### The heat economy is already sharp, and has never been measured

`rules.md:132`: two shots in one activation costs `1 + (1–2 reload) + 2
barrel-hot` = **4–5 heat**, against a medium capacity of 5 and Recovery cooling of
1. A second shot costs 3–4 extra heat and is flatly unsustainable round-on-round.

Greedy-safe will settle into **burst → vent → burst**, and that rhythm is what
SP@10 measures. The game already prices sustained fire. F2-B was designing a rule
for a tradeoff that exists and has simply never been visible.

### Known bias, stated up front

- **Greedy-safe never exceeds capacity.** A real player does, when the trade is
  worth it. So high-heat weapons are systematically under-rated. Acceptable
  because it is consistent across weapons, and the policy is swappable.
- **Weapon heat is partly random** (`fireModeHeat` — dice showing 1 under Full
  Auto / Extended Belt), so the policy budgets against *known* cost and will
  sometimes overshoot. That is not a flaw to engineer away; it is the gamble a
  player actually takes, and modelling it as certain would be the lie.
- **The control rig's loadout is a constant that shapes every number.** It must
  be documented in the report header, not just in code.

## Metric

Rig A carries the weapon under test. Rig B is a **control** — a fixed, documented
loadout — so exactly one thing varies. Both fire, so A takes real damage and eats
the real Hull penalty (−2 actions, −1 Aim at Hull 0), which no single-shot metric
can see.

| column | why |
|---|---|
| **rounds-to-wreck** | **primary** — see the correction below |
| **A's SP/round** | the rate signal; comparable across rows that ran different lengths |
| **A's SP total** | shown, but **saturating** — read with `rounds`, never alone |
| **wreck-rate** | how often the duel resolved at all; also catches damage going into locations that don't kill |
| **B's SP total** | free from the same run, and the only way denial appears: Suppression Lock and Pinning Burst make *B* fire less, which never shows in A's column |

### Correction: SP@10 was the wrong primary, and my reason for rejecting rounds-to-wreck was empirically false

This spec chose SP@10 and rejected rounds-to-wreck as *"censored, awkward — a large share of duels won't wreck inside the horizon."* Both halves are wrong, measured on the built harness:

| cell | rounds | wreck% | SP total | SP/round |
|---|---|---|---|---|
| Autocannon / depleted-core | 4.7 | **92%** | 36.1 | **7.72** |
| Autocannon / penetrator-rounds | 6.0 | **81%** | 31.6 | **5.29** |
| Siege Maul / reinforced-head | 5.8 | **93%** | 32.1 | 5.56 |
| Sniper Cannon / cold-bore | 7.1 | **59%** | 26.6 | 3.76 |

**Wreck rates are 59–93%, not the sparse tail I assumed.** Rounds-to-wreck is well-behaved, barely censored, and is the question a player actually has.

**And SP total saturates.** The duel ends when B1 wrecks, so A's total damage is bounded by B1's pool no matter how good the weapon is. A weapon that kills in 4.7 rounds deals *more* than one taking 6.0 only incidentally — the better weapon has less time to accumulate. Depleted Core vs Penetrator Rounds reads 36.1 vs 31.6 on totals (a 14% gap) and 7.72 vs 5.29 on rate (a 46% gap). The rate is the signal; the total is mostly a measure of how long B1 survived.

So: **rounds-to-wreck primary, SP/round as the rate, SP total shown but never read alone.** Keeping the total is still right — it is what makes `weaponLost` cells legible as censored, and it is the quantity the calibration compares against the old sweep.

### But the censoring I dismissed is real — for the weak tail, not the bulk

The correction above is itself only two-thirds right, and the report caught it.

`Crossbow / pinning-bolt` and `Double MG / kneecapper` measure **0% wreck at 10.0
rounds**. That 10.0 is **the horizon, not a measurement** — a floor. The duel was
still running when we stopped it. And SP/round divided by a floor is a **ceiling**,
so those rows overstate the rate by an unknown amount.

So both positions were half right:

| | true | false |
|---|---|---|
| the original spec | rounds-to-wreck *is* censored | …for "a large share of duels" — it's 59–93% resolved |
| the correction | it's well-behaved for the bulk | …but silent about the weak tail, where it's fully censored |

A row at 0% wreck is not a slow kill. It is a **non-kill**, and averaging 10 into a
rounds column as though it were an observation is the same species as `?? 0`.

**Three censoring modes, and the report must distinguish all three:**

| mode | signature | what the number means |
|---|---|---|
| **arm-loss** (`weaponLost`) | counted in `censored`, excluded from the mean | `spDealt` was capped by an arm, not the weapon |
| **wreck** (early exit) | `rounds` low, `wreckRate` high | **SP total saturates** — bounded by the control's pool |
| **horizon** (no exit) | `rounds` = 10, `wreckRate` < 1 | **rounds is a floor; SP/round is a ceiling** |

The wreck mode and the horizon mode are two faces of one thing: the total
saturates when the control dies early, and the rate inflates when it never dies
at all. Marked with `†` in the report, with the legend beside it.

**The lesson, twice over:** a metric choice is a measurement decision, and you
check it by measuring. I rejected the right primary on an assumption testable in
ten seconds; then, correcting it, I overshot and declared it clean when it is
clean *in the middle and censored at both ends*. Neither error was visible from
the spec. Both were obvious the moment a real number was printed.

A rig is destroyed at Hull 0 (`rules.md:258,269`). Hull is 12–16 SP and the d12
table sends 4/12 of hits there, so ~4 SP/round × 10 rounds ≈ 13 to the hull — the
game is tuned so a 1v1 duel kills right at the buzzer. The metric will
discriminate rather than saturate.

## Testing

### The calibration test — the most important thing here

**At N=1, one shot, nothing carried, the duel must reproduce the existing sweep's
SP/attack.** Same weapon, same tier, same band, within noise, against
`scripts/balance/report-2026-07-15-overflow.txt` (32.3M attacks, committed).

If it doesn't, the harness is wrong and every number it prints is fiction. This is
cheap, falsifiable, and checks the new instrument against a trusted one. The
current sweep never had such a check, which is exactly how it silently measured
field twice on its first run and produced a report whose every conclusion was
garbage.

### The falsifiable prediction — the acceptance bar

We know *why* the sweep is blind (`structuredClone` per trial), so we can predict
precisely which of the 44 this fixes:

| should light up | should stay at 0.00 |
|---|---|
| Penetrator Rounds (fires rounds 3, 6, 9) | Fire Control Lock — needs a paint turn |
| Napalm / Conflagration / Ion Burn (burn ticks) | Enfilade — needs aimed shots |
| Sunder / Dismember (max-SP chipping compounds) | Barrage — needs a zone commit |
| Rivet Lock, Breach Grip, Crush Grip (repeat hits) | Tow Chain, Skewer, Ground Anchor, Dead Weight — spatial |

**If Fire Control Lock lights up, the harness is lying.** The right column needs
*choice*; greedy-safe makes none. A harness reporting value for an upgrade it
cannot exercise has a bug, and this table is how it gets caught.

### The credit can land on the wrong side of the ledger

Greedy-safe has **no melee fallback**. So a control whose gun is destroyed or
riveted **passes instead of swinging** — and its output drops.

That means a weapon which disarms the control (Rivet Gun's Rivet Lock; any hit
that takes an arm) reads as **less incoming damage** — a *lower `spTaken`* — rather
than as the tempo win it actually is. The advantage shows up in the opponent's
column, negated, instead of in the weapon's own.

This is the subtlest misread the report can produce, because nothing is zero and
nothing looks broken: the numbers are all plausible and the credit is simply
filed under the wrong heading. Rivet Gun is the upgrade that surfaced it and the
one most exposed to it.

A bot with a melee branch would fix this properly. Until then it is a documented
bias, printed with the numbers.

### Unit tests

- `policy.mjs` is pure and node-testable: given a rig at heat 4 with capacity 5
  and a 2-heat weapon, it Shuts Down rather than fires; given heat 0, it fires;
  given a spent ranged weapon, it reloads first.
- The policy reads `availableActions` rather than recomputing cost — pin that by
  asserting it never fires an action `availableActions` reports as disabled.

## When to build step 2 (bot-vs-bot)

Build it when the right-hand column above starts mattering — i.e. when tuning
decisions turn on Fire Control Lock, Enfilade, Barrage, or the spatial effects.

Step 2 needs the opponent brain, which needs `effectiveStrAgainst` extracted from
`rollWounds` (its spec calls that its one blocker). And it carries a risk this
harness does not: **a bot-driven harness only measures upgrades the bot knows how
to use.** If its scorer doesn't value Sunder, Sunder reads 0 — the same blindness,
relocated somewhere harder to see. This harness's blindness is at least
*predictable*, which is why the table above can exist.

Run this one first. Its results say whether step 2 is worth it.

## Out of scope

- **Defensive-upgrade valuation** — Tower Shield, Anvil Boss, Emplacement sit on
  the control rig, which doesn't vary. A separate axis, a separate run.
- **Positional questions** — F5-C (what is speed worth) needs geometry and a
  policy that moves. Physical mode is chosen precisely to avoid that here.
- **Any tuning.** This spec builds the instrument. It changes no balance numbers.
- **F2-B** — shelved; taxing ROF makes the spread worse
  (`2026-07-15-rof-heat-design.md`).
