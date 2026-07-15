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
| arc | front/side/rear | **front only** | F1/F6 answered arc; it doesn't interact with cadence |
| distance | ~9 bands | **sweet spot only** | F6: range is the sharpest lever and works as designed |

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
| **A's SP@10** | primary — the tuning signal |
| **wreck-rate** | secondary — catches damage going into locations that don't kill |
| **B's SP@10** | free from the same run, and the only way denial appears: Suppression Lock and Pinning Burst make *B* fire less, which never shows in A's column |

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
