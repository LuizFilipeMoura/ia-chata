# Penetration rework — compress STR, delete Overmatch

**Date:** 2026-07-16
**Status:** approved, not implemented. **Handoff spec — written for an engineer with no prior context.**
**Supersedes:** F1-A in `2026-07-15-weapon-balance-findings.md`, and the whole of
`2026-07-15-str-overflow-design.md` (which shipped on 2026-07-15 and this reverts).

---

## Read this first: you are undoing yesterday's work, on purpose

On 2026-07-15 this repo shipped a rule called **Overmatch**: STR past the wound
roll's clamp converts to bonus damage. It works, it is tested, it is documented,
and it revived three mechanics that measured *literally zero*.

**This spec deletes it.** Not because it is broken — because it was the wrong
answer to a real problem, and the right answer is simpler and fixes more. Read
"Why Overmatch goes" before you touch anything, because you will be removing
working, well-tested code and you need to know why.

---

## The system, in one screen

A rig attack resolves in four steps (`shared/combat.js`, `resolveAttack`):

1. **To-hit** — roll `ROF × D6`, each hits on `≥ modified Aim` (base 4; ACC, cover,
   and **distance** move it — accuracy peaks at the weapon's sweet spot).
2. **Location** — one **D12**, read off the **target's** kind. Rig: 1–4 hull,
   5–7 arms, 8–10 legs, 11–12 engine. Rolled **once per attack**, not per hit.
3. **Wound (= penetration)** — one **D10 per landed hit**, against
   `woundTarget = clamp(2, 10, 6 + T − effStr)` (`shared/rules.js`).
4. **Damage** — per wound: `sp = D + Rend + Evisceration + Overmatch`.

**This is the World of Tanks model already.** Step 3 is a penetration roll; `D` is
alpha. That framing is the key to everything below.

**Everything moves `effStr`, never a total** (`combat.js:532`):

```js
const effStr = str + bonus + braced + hardened + reactive + shieldBlunt + cracked + sideRearDock;
```

Arc, weight class, +STR upgrades, Brace, Harden, shields, plating — fifteen-odd
contributions land in one sum that meets one clamped roll. That is deliberate: the
model this replaced had 69 matchups that could never deal damage at any roll.

### The two clamps that generate every problem in this document

```js
WOUND_DIE      = 10   // floor: a natural 10 always wounds  → 10%
WOUND_TN_FLOOR = 2    // ceiling: wound on 2+               → 90%
```

`P(wound)` is boxed into **[10%, 90%]**, permanently. **Do not remove the clamp** —
it is what guarantees no matchup is hopeless, and removing it reintroduces the 69
dead combos. Every proposal below works *within* it.

---

## The problem

`woundTarget` saturates. Rig toughness is only T3–T5, so **any STR ≥ T+4 pins the
roll at the 90% ceiling and every further point of STR is discarded.**

Six weapons live there permanently:

| weapon | slot | ROF | STR | D | ROF × D |
|---|---|---|---|---|---|
| Siege Maul | longRange | 1 | **11** | 5 | 5 |
| Sniper Cannon | longRange | 1 | **10** | 4 | 4 |
| Harpoon | longRange | 1 | **10** | 3 | 3 |
| Wrecking Ball | melee | 1 | **10** | 5 | 5 |
| Anchor | melee | 1 | **10** | 4 | 4 |
| Lance | melee | 1 | **9** | 4 | 4 |

**44% of all STR×T matchups are pinned at the ceiling.** For the six, three separate
mechanics do nothing at all: the arc bonus (rear/front ratio measured **×1.00**),
`WEIGHT_STR_MOD` (light↔medium delta **Δ0.00**), and six +STR upgrades (**+0.00**
each). Flanking a Wrecking Ball rig was worth *nothing*. Haymaker was worth
*nothing*.

Note the last column. **Those same six weapons are the only ones with `ROF × D`
below 6** — everything else in the catalog is 6–8, they are 3–5. That is a separate
open finding (F2-C) and this change closes it too. See "One change, three problems".

---

## Why Overmatch goes

Overmatch (shipped 2026-07-15) converts the wasted STR into damage:
`min(2, floor((2 − (6 + T − effStr)) / 3))`. It revived all three dead levers, and
it is measurably correct.

It is still the wrong answer, for three reasons:

**1. It is a patch on the clamp, not a mechanic.** `rules.js` has a private helper
`woundRaw` precisely because `woundTarget` and `strOvermatchD` compute *the same
expression* — one clamps it, the other measures how far past the clamp it went. We
are computing `6 + T − effStr` twice and using both halves. That is a rule and its
apology.

**2. It couples STR to D, which WoT deliberately keeps orthogonal.** In WoT, pen and
alpha are independent axes: a gun is frightening because of its *alpha*, not because
it over-penetrates. Overmatch makes STR feed D — and since expected damage is
`ROF × P(hit) × P(wound) × D`, and **ROF multiplies D**, feeding D hands the benefit
disproportionately to high-ROF weapons. That is the likeliest reason the follow-up
measurement showed the heaviest weapons *still* losing to a rivet gun.

**3. It leaves the dead band in place — it just pays rent on it.** 44% of matchups
still saturate. Overmatch makes saturation *pay*; it does not make it *rare*.

### And it leaves a whole upgrade currency dead

Three upgrades sell **reliability** — the ability to wound more often:

| upgrade | sells | measured uplift vs its field tier |
|---|---|---|
| `penetrator-rounds` | skip the wound roll | **−2.77** |
| `ap-shells` | reroll a failed wound | **−1.47** |
| `shaped-charges` | Armour Piercing (reroll) | **−0.70** |

Against a 90% ceiling, perfect reliability can only ever buy **10%**. These upgrades
charge real catches for a currency the game will not let them sell. **Overmatch made
this worse**: it made +STR field upgrades attractive, pushing STR up, dropping
reliability's ceiling from 20% to 10%.

---

## The decision: compress STR into 3–8, delete Overmatch

**Accept that excess penetration is wasted. That is WoT's answer and it is correct.**
Then make excess *rare* by tuning pen near the armour it faces, and put the fiction
where it belongs — in **D**.

> **The Siege Maul is not frightening because it penetrates better. It is
> frightening because it hits for 5.**

The findings doc rejected this (as **F1-C**) on the grounds that "a Siege Maul
reading STR 8 next to an Autocannon's 7 undersells it." That is a fiction argument
and it is wrong: in WoT terms the Siege Maul is **pen 8 / alpha 8** and the
Autocannon **pen 7 / alpha 2**. Same penetration, completely different guns.

### What the residual saturation is *for*

Compressing to 3–8 leaves **17%** of matchups at the ceiling — and that is a
**feature, deliberately kept**:

> **A big gun with excess pen is reliable head-on.** It wounds on 2+ from the front
> and does not *need* to flank. That is its identity. The arc bonus is for the guns
> that do need it.

This is the one thing that must survive into the rulebook. The old doc's option
F1-D ("accept saturation, make it the identity") was rejected for hiding dead
mechanics across *a quarter of the arsenal*. At 17%, concentrated on the biggest
guns, deliberately documented, it stops being a bug and becomes a design.

### Measured, before you start

| | today (STR 3–11) | STR 3–8 |
|---|---|---|
| `P(wound)` lever | 3.0× | 3.0× — unchanged |
| **matchups pinned at the ceiling** | **44%** | **17%** |
| new rules required | +1 (Overmatch) | **0** |
| reliability upgrades | dead (10% ceiling) | **sellable — 83% of matchups have headroom** |

## One change, three problems

1. **F1** (dead levers) — the dead band drops 44% → 17%, without a new rule.
2. **F2-C** (`ROF × D` gap) — the six offenders are the *only* weapons below 6.
   Paying their STR back in D lifts them into the 6–8 band the rest of the catalog
   occupies. `game-state.js:41` claims `d` exists to differentiate the ROF-1
   weapons; it never could, because D5 × 1 = 5 against D2 × 4 = 8. This finally
   makes that claim true.
3. **The reliability currency** — Penetrator, AP Shells and Shaped Charges become
   viable *without being touched*, because there is finally headroom below 90%.

---

## What to do

### 1. Compress the six offenders, pay back in D

| weapon | STR | D | ROF × D now | target |
|---|---|---|---|---|
| Siege Maul | 11 → **8** | 5 → ? | 5 | 6–8 |
| Sniper Cannon | 10 → **7–8** | 4 → ? | 4 | 6–8 |
| Harpoon | 10 → **7–8** | 3 → ? | 3 | 6–8 |
| Wrecking Ball | 10 → **8** | 5 → ? | 5 | 6–8 |
| Anchor | 10 → **7–8** | 4 → ? | 4 | 6–8 |
| Lance | 9 → **7** | 4 → ? | 4 | 6–8 |

**The D column is yours to design; the spec deliberately does not fix it.** The
constraints:

- Land `ROF × D` in the **6–8** band the rest of the catalog occupies.
- **Do not flatten them into each other.** They are ROF 1, so D *is* their whole
  identity — Siege Maul and Harpoon must not both read D7. Keep the existing
  ordering (Siege Maul and Wrecking Ball are the heavy hitters; Harpoon is the
  reach weapon).
- Higher STR should mean *reliable head-on*; higher D should mean *hits hard*. A
  weapon should not be top of both.
- `D` also feeds Rend and Evisceration (both `+1 D`), so check the ceiling on
  weapons carrying those.

### 2. Delete Overmatch — every trace

| file | what to remove |
|---|---|
| `shared/rules.js` | `strOvermatchD`, `OVERMATCH_PER_D`, `OVERMATCH_MAX_D`. **Keep `woundRaw` and `WOUND_TN_FLOOR`** only if `woundTarget` still reads better for it — otherwise inline them back. |
| `shared/combat.js` | the `overmatch` rider in `rollWounds` (compute, the `sp` sum, the `overmatch: 0` on the negated path, the rider push) and the `"Overmatch"` ledger term |
| `shared/glossary.js` | the `overmatch` entry |
| `rules.md` | the **Overmatch** paragraph in §7 and its mention in step 8's rider list |
| `shared/rules.test.js`, `shared/combat.test.js` | the Overmatch tests |

**`rules.md` is a runtime input, not documentation.** `server/config.js` →
`server/prompt.js` bakes it verbatim into the in-game rules bot's system prompt as
"the single source of truth", instructed to refuse rather than guess. If you delete
the rule from the engine and leave it in `rules.md`, the bot will teach players a
rule that no longer exists. Grep `rules.md` for **every** magnitude you touch.

**Keep:** Rend, Evisceration, the clamp, `effStr`, the ledger, the D12 location roll.
None of them are in scope.

#### Two other specs reference Overmatch — fix them or they lie

Deleting a rule leaves dangling references in *forward-looking* docs (unlike the
historical ones, which correctly describe the period they cover):

| doc | what breaks |
|---|---|
| `2026-07-15-opponent-brain-design.md` | its deferred damage term says *"`D` is the weapon's damage dice **plus `strOvermatchD(effStr, toughness)`**"*. That function will not exist. It points **forward** at unbuilt work — whoever implements the bot will grep it and find nothing. |
| same doc | also cites *"F2-B — price ROF in heat is the live next step"* and reasons from it. **F2-B is shelved** (`2026-07-15-rof-heat-design.md`) — taxing ROF measured *worse* than doing nothing (spread 3.0× → 3.9×). That reasoning is stale independently of this spec. |

Leave the *historical* docs alone — `2026-07-15-str-overflow-design.md`,
`2026-07-15-weapon-balance-findings.md` and the plans are the record of why this
was done, and rewriting them destroys the reasoning trail. Mark the str-overflow
spec **SUPERSEDED by this document** at its head; do not gut it.

### 3. Re-measure — both harnesses, and the second one matters most

```bash
# the single-shot sweep — arc, distance, the stat table
TRIALS=3000 node scripts/balance/weapon-sweep.mjs > full.json 2>progress.txt   # ~12 min
DATA=full.json node scripts/balance/report.mjs

# the duel harness — 10 real rounds, state carried
TRIALS=500 node scripts/balance/duel-sim.mjs > duel.json 2>duel-progress.txt   # ~4 min
DATA=duel.json node scripts/balance/duel-report.mjs
```

Baselines to diff against, both committed:
`scripts/balance/report-2026-07-15-overflow.txt` (32.3M attacks) and
`scripts/balance/duel-2026-07-15.txt` (500 trials).

## What success looks like

| question | instrument | bar |
|---|---|---|
| dead band shrank? | sweep | arc ratio, `WEIGHT_STR_MOD` delta and +STR uplift stay **alive** for the six — they were revived by Overmatch and must survive its deletion |
| the heavies climbed? | duel | they are ROF 1; `SP/round` should rise with the D payback |
| **reliability revived?** | duel | `penetrator-rounds` (−2.77), `ap-shells` (−1.47), `shaped-charges` (−0.70) should move **toward zero or positive**. This is the sharpest single test of the whole thesis. |
| `ROF × D` gap closed? | the stat table | the six are the only weapons under 6 today |
| nothing else broke | `npm test` | 811 node / 293 vitest at time of writing |

**The critical one is reliability.** The claim is that compressing STR gives those
three upgrades headroom to sell. If they do *not* improve, the thesis is wrong and
you should stop and say so rather than tune around it.

---

## Traps. Every one of these has already bitten someone on this codebase

1. **Field is the floor.** `normalizeWeaponUpgrade` (`game-state.js`) returns
   `upgrades[0].id` for a null id — **`makeRig` cannot build an un-upgraded rig.**
   Every legal Wrecking Ball carries Haymaker (+3 STR) and swings at effStr 13, not
   10. Any worked example you write from base STR is wrong. This silently ruined a
   sweep's first run and invalidated two test fixtures.
2. **The duel must run `arc: "side"`, never `"front"`.** `arcBonus` returns **`null`**
   for Raking Fire outside side/rear (`combat.js:401`) — a hard zero **by rule**, not
   a failed roll. Mini Gun and Double MG carry the perk. At front they run ten full
   rounds dealing **literally 0**. Nothing lies; the output is a rule wearing a bad
   roll's costume. **The tell: ask whether a zero is a measurement or a rule.**
3. **`availableActions` is a UI model, not a legality oracle.** Six places where
   `enabled` disagrees with what the engine does are catalogued in
   `2026-07-15-duel-harness-design.md`. When mirroring an engine refusal, **copy its
   predicate, not its gist** — both plausible fixes for one of them were wrong, and
   both failed *silently* rather than crashing.
4. **The duel's numbers are censored three ways** — arm-loss, early-wreck (SP total
   saturates against the control's pool), and horizon (`†` rows: `rounds` is a floor,
   `SP/round` a ceiling). Read the report's own caveat block; it is printed first for
   a reason.
5. **The duel prices a prototype's cost, not its benefit.** `greedySafe` makes no
   choices, so Fire Control Lock, Enfilade, Barrage and the spatial effects read 0.00
   because they *cannot be exercised*, not because they are worthless.
6. **`git add <file>` stages the whole file.** `package.json` and `package-lock.json`
   carry an in-progress dependency upgrade belonging to the user. Do not sweep them
   in. An earlier task did, and it had to be undone.
7. **Do not use `sed -i`** on this repo — it rewrites CRLF and leaves files dirty with
   an empty `git diff`.
8. **Another agent commits to this branch.** Never `git add -A`; never trust `HEAD~1`.

## The meta-lesson, which is why this spec is so specific

Every design decision in this area that was *reasoned about* turned out wrong, and
every one took minutes to check once code existed. The arc (front zeroed two
weapons — documented in the findings doc the spec was written *from*). The metric
(SP@10 saturates at the wreck). The censoring (called "censored", then "clean";
actually clean in the middle and censored at both ends). And Overmatch itself.

**Measure before you argue. Both harnesses exist now and they are cheap.**

## Out of scope

- **The clamp.** Load-bearing. Do not touch.
- **The wound roll itself.** Deleting it was considered and rejected: it is a 2.3×
  lever across real matchups — weaker than ROF (8×) or distance (5×), but not
  nothing.
- **The D12 location roll**, Rend, Evisceration.
- **The metronome prototypes.** `penetrator-rounds` ("every 3rd volley") and
  `enfilade` ("every 3rd aimed shot") are counters, not decisions — a separate fun
  problem. This spec may make them *viable*; it will not make them *interesting*.
- **Bot-vs-bot** (`2026-07-15-opponent-brain-design.md`) — still the only way to
  price choice-dependent prototypes.
