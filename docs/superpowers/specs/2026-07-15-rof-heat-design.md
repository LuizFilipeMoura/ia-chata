# Rate of fire runs the barrel hot — design

**Date:** 2026-07-15
**Status:** **SHELVED — do not implement.** The design is sound; its premise is
false. Kept as a record of why, and of the two findings the work turned up.
**Source:** `docs/superpowers/specs/2026-07-15-weapon-balance-findings.md` (F2-B)
**Baseline:** `scripts/balance/report-2026-07-15-overflow.txt` (3000 trials, post-Overmatch)

---

# Why this was shelved

**Taxing ROF makes the spread worse than doing nothing.** Measured against the
committed 3000-trial data:

| SP/heat spread | |
|---|---|
| today (heat is flat 1) | **3.0×** |
| taxed by ROF, as this spec designs | **3.9×** — worse than shipping nothing |
| taxed by raw output (ROF × D) | 2.6× |

The reason is that **F2's premise does not survive its own re-measurement.**
SP/attack does not rise with ROF. It peaks in the middle and dips at the top:

| ROF | mean SP/attack | weapons |
|---|---|---|
| 8 | 5.09 | Mini Gun 4.37, Double MG 5.81 |
| 6 | **3.64** | Rivet Gun |
| 4 | **6.18** | Autocannon 6.06, Missile Barrage 5.96, Flamethrower 6.53 |
| 3 | 3.77 | Mortar, Chainsaw, Circular Saw |
| 2 | 3.72 | Arc Gun, Sword, Claw, Pressure Claw, Talon |
| 1 | 3.17 | the eight heavies |

ROF 4 is the peak; ROF 6 is nearly the trough. So `floor(ROF/3)` charges **Rivet
Gun (3.64, second-worst band) 3 heat** while **Autocannon (6.06, the actual
outlier) pays 2**. It taxes hardest precisely where the problem isn't.

"ROF dominates" was a fair reading of the *pre-Overmatch* numbers, where the
wound clamp flattened `P(wound)` to a 1.3× lever and ROF was the only thing left
moving. Overmatch un-clamped that. Post-Overmatch, neither end of the board is a
ROF story: the top is ROF 4 and 8 mixed; the bottom is Sword (ROF 2), Anchor
(ROF 1), Lance (ROF 1) and Circular Saw (ROF 3). The residual spread is
per-weapon, not a lever asymmetry.

## The two findings worth keeping

**1. `ROF × D` is 6–8 for the whole catalog except the ROF-1 weapons at 3–5.**
`game-state.js:41` says `d` exists to differentiate the ROF-1 weapons; it cannot,
because D5 × 1 = 5 against D2 × 4 = 8. This is F2-C's territory and it is one
systematic gap in one column, not the whack-a-mole the findings doc called it. It
may well be intentional — heavies trade output for reliability, wounding ~90%
where STR 3 wounds ~40%. Recorded so the option is chosen rather than forgotten.

**2. The harness cannot see half the catalog, which is why no tuning follows from
this data.** Of 85 upgrades measured, **44 (52%) are worth +0.00 in both
conditions**. Arc Gun's and Bulwark Shield's *entire* trees are invisible. The
ranking therefore measures how much of each weapon happens to be raw stats, not
how strong it is: Flamethrower tops the board because Sticky Fuel is +2.19 of pure
stat, and Sword sits at the bottom because all three of its tiers are conditional
(Precision waives an aimed-shot penalty the sweep never pays, since it fires
unaimed). See the turn-level harness design.

## If a heat rule is ever wanted for its own sake

Tax **ROF × D**, not ROF: propellant burned rather than rounds fired. A ROF-8/D1
minigun and a ROF-4/D2 autocannon put the same mass downrange and pay the same;
a Siege Maul's single charge pays less. Coherent fiction, and it improves the
spread (2.6×) rather than degrading it. But it would be a **lore feature with a
balance side-benefit**, not a balance fix, and should be argued as such.

The design below is left intact and unedited. Everything in it — the seam, the
cold-kind trap, the display requirement, the anti-drift test — remains correct if
the premise is ever revisited.

---

Implements F2-B. F2-A (fix F1 first) shipped as Overmatch on 2026-07-15 and was
re-measured; it did not resolve F2, which is why F2-B is now the live step rather
than the fallback its own section called it.

## Problem

Firing costs **1 heat, flat**, whether the weapon is ROF 1 or ROF 8. Recovery
cools 1/round; a medium rig's capacity is 5, and each point over adds +2 to the
misfire roll. So ROF is pure upside: it buys output and consistency and trades
against nothing.

Overmatch was supposed to fix this indirectly. It didn't, and the reason is
structural: expected damage is `ROF × P(hit) × P(wound) × D`, and Overmatch adds
to **D** — the term ROF *multiplies*. A high-ROF weapon banks the bonus once per
shot in its volley. Measured at 3000 trials, post-Overmatch:

| weapon | profile | SP/attack |
|---|---|---|
| Autocannon | STR 7, D2, ROF 4 | **6.06** |
| Rivet Gun | STR 3, D1, ROF 6 | 3.64 |
| Wrecking Ball | STR 10, D5, ROF 1 | 3.01 |

A rivet gun still out-damages a wrecking ball, and the weapon that gained most
from Overmatch was a mid-STR, high-ROF gun the rule never aimed at.

### What the sweep also revealed, and the findings doc missed

Raw output per volley, `ROF × D`, across the whole catalog:

| ROF | D | ROF × D | weapons |
|---|---|---|---|
| 8 | 1 | **8** | Mini Gun, Double MG |
| 6 | 1 | **6** | Rivet Gun |
| 4 | 2 | **8** | Autocannon, Missile Barrage, Flamethrower |
| 3 | 2 | **6** | Mortar, Chainsaw, Circular Saw |
| 2 | 3 | **6** | Arc Gun, Sword, Claw, Pressure Claw, Talon |
| 1 | 3–5 | **3–5** | all eight heavies |

Everything in the game has raw output 6–8 **except the ROF-1 weapons, at 3–5**.
`game-state.js:41` says `d` exists to differentiate the ROF-1 weapons; it never
could, because D5 × 1 = 5 while D2 × 4 = 8.

This is F2-C's territory (raise D on the ROF-1 weapons), and the data says it is
not the "whack-a-mole" the findings doc called it — it is one systematic gap in
one column. **It is deliberately not this design.** The gap is arguably intended:
heavies trade output for reliability (STR 10–11 wounds ~90% where STR 3 wounds
~40%). Recorded here so the option stays visible and is chosen, not forgotten.

## Decisions

| decision | choice | rejected |
|---|---|---|
| how we validate | extend the sweep to report **SP/heat** | turn-level harness (right answer, much bigger — still queued as findings step 5); ship on judgment (unmeasured) |
| the lever | **price ROF in heat** (F2-B) | F2-C raise D (papers the symptom, leaves ROF free); both (over-corrects) |
| the shape | **deterministic band**, `fire heat = 1 + floor(ROF/3)` | universalise heat-on-1s |
| cold kinds | **exempt**, explicitly in code | give tanks/walkers heat (redesigns what "cold kind" means); price them in another currency (new mechanic, no evidence they need it) |

**Why not universalise heat-on-1s.** It was attractive: `heatOnOnes` already
exists at `combat.js:216`, expected heat would scale continuously as `ROF/6`, and
Full Auto's and Extended Belt's catch ("each die that rolls a 1 adds 1 heat")
would become *emergent* — +2 ROF is +2 dice is more 1s — deleting three special
cases instead of adding a rule.

It was rejected because it **guts Charged Shot**. Full Auto self-prices because it
adds dice; Charged Shot is +2 **STR** — same dice — so universalising turns its
only catch into nothing and makes it free upside. That is a fire-mode redesign
this change has no business doing.

The deterministic band also earns its keep on its own terms: the cost is known
*before* you commit, against a capacity of 5 and cooling of 1. "Can I afford this
burst?" is a decision a player can reason about; a 1-in-6 surcharge per die is a
gamble. **This is the whole reason the display work below is load-bearing rather
than polish.**

## The rule

Lives in `rules.js` beside `HEAT_CAPACITY` and `ACTIONS`.

```js
// §6 — rate of fire runs the barrel hot. A volley's heat scales with the rounds
// it puts downrange, so ROF trades against the heat economy instead of being
// pure upside. See docs/superpowers/specs/2026-07-15-rof-heat-design.md.
export const ROF_HEAT_PER = 3;
export function rofHeat(rof) { return Math.floor((Number(rof) || 0) / ROF_HEAT_PER); }
```

The resulting ladder, on top of `ACTIONS.fire.heat = 1`:

| ROF | weapons | fire heat |
|---|---|---|
| 8 | Mini Gun, Double MG | **3** |
| 6 | Rivet Gun | **3** |
| 4 | Autocannon, Missile Barrage, Flamethrower | **2** |
| 3 | Mortar, Chainsaw, Circular Saw | **2** |
| 2 | Arc Gun, Sword, Claw, Pressure Claw, Talon | **1** |
| 1 | all eight heavies | **1** |

It reads the **effective** ROF, so every +ROF upgrade self-prices with no extra
rule: Rapid Feed, Extended Belt, Swarm Warheads and the Full Auto fire mode all
push their weapon up a band. Extended Belt's Mini Gun reaches ROF 10 → 3 → **4
heat**.

It **stacks with the existing second-shot surcharge** (`game-state.js:2361`, "a
second or later ranged shot in the same activation runs the barrel hot"). A Mini
Gun firing twice in one activation pays `1 + 2 + 1 = 4` heat against a capacity of
5. Sustained high-ROF fire becoming expensive is the point; this is also the
interaction most likely to prove too harsh.

The fiction is already in the rulebook — `rules.md:132` says a repeat shot "runs
the barrel hot". This is the same idea applied to rate rather than repetition, and
should use the same language.

### Cold kinds are exempt — and it must be explicit

Tanks and Walkers are heatless (`unit-kinds.js`, `hasHeat: false`;
`battle-view.js:25` gates Sprint on it because they have no heat to burn).

**The exemption cannot be left implicit.** `bumpHeat` (`game-state.js:2087`)
writes `rig.engine.heat` unconditionally, and cold kinds *do* have engine parts —
so charging them would silently accumulate a value `heatMeter` deliberately
reports as 0. That is "charged but invisible", not "exempt", and it is dead state
waiting to become a bug the first time someone reads `engine.heat` directly. No
unit weapon carries any heat source today, so this rule would be the first.

So the charge site checks explicitly:

```js
const cold = !UNIT_KINDS[attacker.kind || "rig"].hasHeat;
```

This means ROF 6 on a Tank (Coaxial MG) stays free while ROF 6 on a Rig costs 3.
**Accepted, and thematic** — a tank is the stable gun platform. It is coherent
because support units draw from a separate weapon list (`UNIT_WEAPONS`, zero
overlap with rig weapons), carry role modules rather than upgrades, and answer a
different design question. The sweep that found F2 was rigs-vs-rigs only.

## Wiring

| # | file | change |
|---|---|---|
| 1 | `rules.js` | `ROF_HEAT_PER`, `rofHeat` |
| 2 | `combat.js:4-8` | import `UNIT_KINDS` for the `hasHeat` check |
| 3 | `combat.js:723` | add `(cold ? 0 : rofHeat(profile.rof))` to the weapon-heat sum |
| 4 | `battle-view.js:42-51` | show the cost + a note |
| 5 | `rules.md` §5/§6 | document the rule |
| 6 | `scripts/balance/weapon-sweep.mjs` | record `bumpHeat` instead of stubbing it |
| 7 | `scripts/balance/report.mjs` | an SP/heat column |

**Edit 3** folds into the sum that already exists, where the effective profile is
in scope:

```js
const heat = (hasPerk(profile, "Hot") ? 1 : 0) + th.fireModeHeat
           + (profile.upgradeEffect?.heat || 0)
           + (cold ? 0 : rofHeat(profile.rof));
```

**Edit 4 is not polish.** The band was chosen over heat-on-1s *because* the cost
is knowable in advance; if the action console doesn't show it, that rationale is
void. `battle-view.js` already carries the precedent verbatim —
`note = "Second shot — +1 heat"`, commented "surcharge rule, not obvious from the
total". A ROF surcharge is exactly as non-obvious. It needs the effective profile,
so `battle-view.js` calls `effectiveWeaponProfile` and then the same `rofHeat` the
charge site calls.

**Edit 5 is non-negotiable.** `rules.md` is a runtime input, not documentation:
`server/config.js:6` → `server/prompt.js:147-159` bakes it verbatim into the rules
bot's system prompt as "the single source of truth", instructed to say so
explicitly rather than guess when the rulebook doesn't cover something. Ship
without it and the bot tells players ROF is free while the engine charges 3. The
Overmatch work shipped exactly this defect and a reviewer caught it.

## Testing

**Correctness — unit tests, exact.** `rofHeat` is pure.

- `rules.test.js` — band boundaries (1→0, 2→0, 3→1, 4→1, 6→2, 8→2); Extended
  Belt's ROF 10 → 3; junk → 0.
- `combat.test.js` — `resolveAttack` charges the right total; it reads the
  **effective** ROF (Swarm Warheads self-prices); a **cold kind is charged zero**.
  Mutation-test that last one by removing the guard — this spec's first draft
  asserted the exemption was automatic and it was not.
- `battle-view.test.js` — the fire/aimed tile shows the ROF cost and its note.

**The anti-drift test, and the most important one here:** what
`availableActions` *displays* equals what `resolveAttack` *charges*, table-driven
across every weapon in the catalog. Two call sites reading one function is the
`woundRaw` pattern from Overmatch, but nothing proves they agree until a test
does. If the console says 3 and the engine charges 4, this design has built a
liar. Table-driven so a new weapon cannot quietly desync them.

**Balance — the sweep, extended.** `weapon-sweep.mjs:36` currently stubs
`bumpHeat() {}`. It becomes a recorder, keyed on identity — `combat.js:722` wires
`spendHeat` to `ctx.bumpHeat(target, n)` for defensive reactions, so attacker heat
and target heat must not be conflated. It records the **full action cost**
(`ACTIONS.fire.heat` + weapon heat), because `resolveAttack` only charges the
weapon half. The sweep models one attack, so the second-shot surcharge never
fires; the report header should say so.

```bash
TRIALS=3000 node scripts/balance/weapon-sweep.mjs > full.json 2>progress.txt   # ~12 min
DATA=full.json node scripts/balance/report.mjs
```

### The projected outcome, and why the rate is a hypothesis

Today's committed 3000-trial SP/attack, divided by the heat this design charges:

| weapon | SP/attack | heat | SP/heat |
|---|---|---|---|
| Siege Maul | 4.08 | 1 | **4.08** |
| Flamethrower | 6.53 | 2 | 3.27 |
| Autocannon | 6.06 | 2 | 3.03 |
| Wrecking Ball | 3.01 | 1 | 3.01 |
| Missile Barrage | 5.96 | 2 | 2.98 |
| Anchor | 2.56 | 1 | 2.56 |
| Double MG | 4.64 | 3 | 1.55 |
| Rivet Gun | 3.64 | 3 | 1.21 |
| Mini Gun | 4.37 | 4 | **1.09** |

**This does not narrow the gap — it inverts it.** Siege Maul goes from mid-table
to first, Mini Gun from fourth to last, and the spread stays ~3.7× pointing the
other way. That is F2 mirrored, which is what F1's option D was rejected for.

So: **`ROF_HEAT_PER = 3` is a starting hypothesis, not a settled number.** `/4` is
the fallback (Mini Gun 3 not 4, Rivet Gun 2 not 3 — gentler, less inversion). The
first sweep decides. This projection is arithmetic on committed data, not a
simulation: trust its direction, not its magnitude.

### Acceptance

**The bar is "the two rankings disagree less", not "SP/heat is flat".** SP/heat
prices heat as if it were the only constraint; a rig also has 3 action slots, so
the truth sits between SP/attack and SP/heat and only a turn-level sim can say
where. Optimising SP/heat to 1.0 would be tuning against a metric we know is
partial.

Concretely: **if a weapon is top-3 on one metric and bottom-3 on the other, the
rate is wrong.** Today Mini Gun would be 4th on SP/attack and last on SP/heat —
that is the signal to try `/4`.

| question | instrument | bar |
|---|---|---|
| is the number right? | unit tests | exact, must pass |
| does the console tell the truth? | the anti-drift test | exact, must pass |
| did ROF stop being free? | sweep @ 3000 | high-ROF SP/heat drops materially |
| did it over-correct? | sweep @ 3000 | no weapon top-3 on one metric, bottom-3 on the other |

## Out of scope

- **F2-C** (raise D on the ROF-1 weapons) — the `ROF × D` gap above is real and
  now documented. A separate decision, deliberately not bundled.
- **Turn-level harness** (findings step 5) — the instrument that could actually
  settle the SP/attack-vs-SP/heat question, and value the ~20 upgrades no
  single-shot metric can see.
- **Giving cold kinds heat** — would make the tax uniform; redesigns Tank/Walker
  identity.
- **Charged Shot's catch** — untouched here, and the reason heat-on-1s was
  rejected.
- **F4-C, F5-C** — unchanged by this work.
