# Penetration rework — compress the band to 3–7, delete Overmatch

**Date:** 2026-07-16
**Status:** approved, not implemented. **Handoff spec — written for an engineer with no prior context.**
**Depends on:** `2026-07-16-stat-rename-design.md` — this document is written in
that vocabulary (**Accuracy / Penetration / Damage**, formerly ACC / STR / D).
Land the rename first.
**Supersedes:** F1-A in `2026-07-15-weapon-balance-findings.md`, and the whole of
`2026-07-15-str-overflow-design.md` (which shipped on 2026-07-15 and this reverts).

---

## Read this first: you are undoing yesterday's work, on purpose

On 2026-07-15 this repo shipped a rule called **Overmatch**: Penetration past the
wound roll's clamp converts to bonus Damage. It works, it is tested, it is
documented, and it revived three mechanics that measured *literally zero*.

**This spec deletes it.** Not because it is broken — because it was the wrong
answer to a real problem. Read "Why Overmatch goes" before you touch anything,
because you will be removing working, well-tested code and you need to know why.

**This document replaces an earlier version of itself.** The 2026-07-16 draft was
approved and then measured, and three of its load-bearing claims were false. They
are documented in "What the first draft got wrong" — not to flagellate, but
because the same three mistakes are available to you right now.

---

## The system, in one screen

A rig attack resolves in four steps (`shared/combat.js`, `resolveAttack`):

1. **To-hit** — roll `ROF × D6`, each hits on `≥ modified Aim` (base 4; Accuracy,
   cover and **distance** move it — accuracy peaks at the weapon's sweet spot).
2. **Location** — one **D12**, read off the **target's** kind. Rig: 1–4 hull,
   5–7 arms, 8–10 legs, 11–12 engine. Rolled **once per attack**, not per hit.
3. **Wound (= penetration)** — one **D10 per landed hit**, against
   `woundTarget = clamp(2, 10, 6 + T − effPen)` (`shared/rules.js`).
4. **Damage** — per wound: `sp = Damage + Rend + Evisceration`.

**This is the World of Tanks model already.** Step 3 is a penetration roll; step 4
is alpha. That framing is the key to everything below.

**Everything moves `effPen`, never a total** (`combat.js:532`):

```js
const effPen = pen + bonus + braced + hardened + reactive + shieldBlunt + cracked + sideRearDock;
```

Arc, weight class, +Pen upgrades, Brace, Harden, shields, plating — fifteen-odd
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

### The board you are actually balancing against

This is the fact the first draft missed, and it drives every number here.

```js
// game-state.js:31
export const SUPPORTED_RIG_CLASSES = ["light", "medium"];
```

`makeRig` hard-gates on it, and **that is now the whole story.**

When this spec was written, `heavy` and `colossal` were *also* fully plumbed —
toughness, SP, `WEIGHT_PEN_MOD`, `AIM`, `HEAT_CAPACITY`, UI badges — while
`CHASSIS` carried only 7 light and 4 medium entries. They could not be built but
read as if they could, and **that trap caught this spec's author and its reviewer,
in opposite directions**, one giving a T3–T5 board for the wrong reason and the
other a T3–T7 board that could not be fielded.

**They were deleted on 2026-07-16** (`d8a8d3d`, `5aebc26`). The maps now carry two
classes, `toughnessOf` throws for the others, and three mutation-tested guards keep
it that way. The board below is the board, and the trap is gone rather than
documented.

So the fieldable board is:

```
rig/light     hull 4   arms 3   legs 3   engine 3
rig/medium    hull 5   arms 4   legs 4   engine 3
tank          hull 6   tracks 5 turret 5 engine 4
walker        hull 5   legs 4   mount 4  engine 3
```

**Armour is thin: T3–T6, and T3–T4 is two-thirds of it.**

---

## The problem

`woundTarget` saturates. A weapon pins the 90% ceiling against a location when
`effPen ≥ T + 4`. With T3–T6, that produces **a cliff, not a gradient**:

| effPen | pinned vs rigs | pinned vs everything fieldable |
|---|---|---|
| **≤ 6** | **0%** | **0%** |
| **7** | **50%** | **31%** |
| 8 | 88% | 69% |
| 9 | 100% | 94% |
| 10+ | 100% | 100% |

**There is no middle setting.** A weapon either never saturates (Pen ≤ 6) or
auto-wounds every light limb and engine (Pen 7). This is the single most important
fact in this document and it is why the first draft's numbers were unreachable.

Measured across the catalog **at the field floor** (see Trap 1 — base Pen is never
what fights), **47.7% of matchups are pinned today.** For the weapons that live
there, three separate mechanics do nothing at all: the arc bonus (rear/front ratio
measured **×1.00**), `WEIGHT_PEN_MOD` (light↔medium delta **Δ0.00**), and the +Pen
upgrades (**+0.00** each). Flanking a Wrecking Ball rig was worth *nothing*.
Haymaker was worth *nothing*.

### And it leaves a whole upgrade currency dead

Three upgrades sell **reliability** — the ability to wound more often:

| upgrade | sells | measured uplift vs its field tier |
|---|---|---|
| `penetrator-rounds` | skip the wound roll | **−2.77** |
| `ap-shells` | reroll a failed wound | **−1.47** |
| `shaped-charges` | Armour Piercing (reroll) | **−0.70** |

Against a 90% ceiling, perfect reliability can only ever buy **10%**. These
upgrades charge real catches for a currency the game will not let them sell.
**Overmatch made this worse**: it made +Pen field upgrades attractive, pushing Pen
up, dropping reliability's ceiling from 20% to 10%.

---

## Why Overmatch goes

Overmatch (shipped 2026-07-15) converts the wasted Penetration into Damage:
`min(2, floor((2 − (6 + T − effPen)) / 3))`. It revived all three dead levers, and
it is measurably correct.

It is still the wrong answer, for three reasons:

**1. It is a patch on the clamp, not a mechanic.** `rules.js` has a private helper
`woundRaw` precisely because `woundTarget` and `strOvermatchD` compute *the same
expression* — one clamps it, the other measures how far past the clamp it went. We
are computing `6 + T − effPen` twice and using both halves. That is a rule and its
apology.

**2. It couples Penetration to Damage, which WoT deliberately keeps orthogonal.**
In WoT, pen and alpha are independent axes: a gun is frightening because of its
*alpha*, not because it over-penetrates. Overmatch makes Penetration feed Damage —
and since expected damage is `ROF × P(hit) × P(wound) × Damage`, and **ROF
multiplies Damage**, feeding Damage hands the benefit disproportionately to
high-ROF weapons. That is the likeliest reason the follow-up measurement showed
the heaviest weapons *still* losing to a rivet gun.

**3. It leaves the dead band in place — it just pays rent on it.** Overmatch makes
saturation *pay*; it does not make it *rare*.

---

## What the first draft got wrong

All three took two minutes to check once someone ran the code instead of reading it.

**1. "Rig toughness is only T3–T5."** True of the *fieldable* game, by luck — the
toughness table ran T3–T7 at the time, and the draft's author read the table. The
reason T3–T5 was right is `SUPPORTED_RIG_CLASSES`, which the draft never mentions.
Right answer, wrong reason, and the wrong reason was load-bearing for the next
point. (The reviewer then "corrected" it to T3–T6 and was wronger. Heavy and
colossal have since been deleted, so the table now *is* the board — but the two of
them reached opposite wrong answers from the same file, which is the part worth
remembering.)

**2. The 44% → 17% headline was computed from base Penetration.** The draft's own
**Trap 1** says *"any worked example you write from base Pen is wrong"* — field is
the floor. Then it computed its headline from base Pen. Measured at the field
floor, today is **47.7%**, and the draft's proposal (compress to 3–8) reaches
**31.8%**, not 17%. Worse, **17% is unreachable inside a 3–8 band at all**: Pen 8
alone saturates 69%, so any weapon permitted to reach 8 blows the budget. The
target was right; the band was one point too generous.

**3. "The six offenders are the only weapons with `ROF × D` below 6."** False.
**Bulwark Shield** is `ROF × Damage` **3** — tied for worst in the game — and is
**0% pinned**. **Crossbow** is 4 and 50% pinned. So `ROF × D` and saturation are
**two independent problems**, and the draft's "one change, three problems" claim
does not hold. See "What stays open".

**4. The census skipped `UNIT_WEAPONS` entirely.** Tank Cannon is `Pen 10 /
Damage 5`, **100% pinned**, with no upgrade slot. Ram Spike is Pen 9. They were
never in the table.

> **The lesson is not "the author was careless."** The draft is careful, and it
> ends with the sentence *"Measure before you argue. Both harnesses exist now and
> they are cheap."* It then argued. Assume this document contains an instance of
> the same error and go looking for it.

---

## The decision: compress the band to 3–7, delete Overmatch

**Accept that excess penetration is wasted. That is WoT's answer and it is
correct.** Then make excess *rare* by tuning pen near the armour it faces, and put
the fiction where it belongs — in **Damage**.

> **The Siege Maul is not frightening because it penetrates better. It is
> frightening because it hits for 7.**

The findings doc rejected this (as **F1-C**) on the grounds that "a Siege Maul
reading STR 8 next to an Autocannon's 7 undersells it." That is a fiction argument
and it is wrong: in WoT terms the Siege Maul is **pen 7 / alpha 7** and the
Autocannon **pen 7 / alpha 2**. Same penetration, completely different guns.

### The four rules

1. **The Penetration band is 3–7.** Nothing — no base, no base-plus-always-on-bonus
   — may exceed 7. Pen 8 saturates 69% of the board on its own.
2. **Design at the field floor, not at base.** Every number in the table below is
   what the weapon reads **with its default upgrade fitted**. Base is derived by
   subtracting what the field upgrade adds. This is Trap 1 turned into a rule so it
   cannot bite a third time.
3. **The heavies pay their wasted Penetration back in Damage**, landing
   `ROF × Damage` in the **6–8** band the rest of the catalog occupies.
4. **Penetration is a weak upgrade currency here — stop selling it where it can't
   be spent.** One point of Pen is worth exactly **+10% wound chance** (one pip of
   the D10), and the cliff at 7 means you can sell at most one or two points. Most
   +Pen upgrades must sell something else.

### What the residual saturation is *for*

Capping at 7 leaves **15.6%** of matchups at the ceiling. Understand exactly what
that 15.6% *is*, because the obvious reading is wrong:

**Pen 7 is the standard band, not a heavy-gun perk.** Eleven of the catalog's 22
weapons sit at Pen 7 after this change — Siege Maul, Harpoon and Anchor, yes, but
also Mortar, Missile Barrage, Chainsaw, Claw, Pressure Claw, Arc Gun, Crossbow and
Autocannon. Every one of them auto-wounds a **T3** location, and T3 is exactly four
things: a light rig's arms, legs and engine, and a medium rig's engine. **The
flimsiest armour in the game gets reliably punched through by ordinary weapons.**
That is not a bug and it is not an identity — it is what T3 *means*.

This is the honest version of the old doc's F1-D ("accept saturation, make it the
identity"), which was rejected for hiding dead mechanics across a quarter of the
arsenal. At 15.6%, every weapon keeps a live arc bonus and live `WEIGHT_PEN_MOD`
against **69%** of the board — everything T4 and above. Saturation stops being a
place where mechanics go to die and becomes a floor under the weakest armour.

**And it is what makes the thesis true.** If Pen 7 is standard, then the Siege Maul
penetrates *exactly like a Mortar does* and differs only in Damage — 7 against 2.
That is the whole argument, stated properly:

> **The Siege Maul is not frightening because it penetrates better. It penetrates
> the same. It is frightening because it hits for 7.**

Two corollaries worth keeping:

- **Capping the band at 6 instead of 7 measures 0.0% and deletes the floor
  entirely.** 6 is a floor, not a target.
- **No weapon in the game is pinned above 31%.** Today ten are pinned above 50%.

### Measured, before you start

Measured on the **exact** design in "What to do", at the field floor:

| | today (field floor) | this spec | first draft (3–8) |
|---|---|---|---|
| **matchups pinned — all fieldable units** | **47.7%** | **15.6%** | 31.8% |
| matchups pinned — vs rigs only | 55.1% | **25.0%** | — |
| weapons pinned >50% | **10** | **0** | 6 |
| max Penetration in the game | **13** | **7** | 8 |
| new rules required | — | **0** | +1 (Overmatch) |
| reliability upgrades | dead (10% ceiling) | **sellable — 84% of matchups have headroom** | |

---

## What to do

### 1. The six — Penetration and Damage, at the field floor

All six are ROF 1, so `ROF × Damage` **is** Damage. Three ranged, three melee — and
Damage has exactly three legal values in the 6–8 band. It fits exactly:

| weapon | slot | Pen | Damage | was (Pen/D) | identity |
|---|---|---|---|---|---|
| **Siege Maul** | ranged | **7** | **7** | 11 / 5 | reliable *and* heavy; pays for it in reach (sweet 8, max 16) |
| **Sniper Cannon** | ranged | **6** | **8** | 10 / 4 | alpha at range (sweet 22, max 28); never saturates — it must roll |
| **Harpoon** | ranged | **7** | **6** | 10 / 3 | reliable, low alpha; reach + Impale |
| **Wrecking Ball** | melee | **6** | **8** | 10 / 5 | alpha king, Accuracy 0 — the wild swing |
| **Lance** | melee | **6** | **7** | 9 / 4 | the accurate charger (Accuracy +1) |
| **Anchor** | melee | **7** | **6** | 10 / 4 | reliable control / lock |

**Why this assignment and not another:**

- **No weapon is top of both axes.** Siege Maul tops Penetration and is *not* top
  of Damage; Wrecking Ball and Sniper Cannon top Damage and sit at Pen 6.
- **Nothing is dominated within its slot.** Every pair trades: Pen ↔ Damage, with
  reach (Harpoon vs Siege Maul) and Accuracy (Lance vs Wrecking Ball) as the
  tiebreakers. Siege Maul out-Damages Harpoon at equal Pen, but Harpoon reaches 22"
  to its 16" — and distance is a **5×** lever, one of the largest in the game.
- **Pen 7 vs Pen 6 is the reliability axis.** Siege Maul, Harpoon and Anchor sit in
  the standard band and auto-wound T3 (light limbs and engines). Sniper Cannon,
  Wrecking Ball and Lance sit one point below it and **never saturate anything** —
  they bought alpha instead, and they roll for every wound they get.
- **`ROF × Damage`** lands 7 / 8 / 6 / 8 / 7 / 6 — inside the catalog's 6–8 band.
  `game-state.js:41` claims `d` exists to differentiate the ROF-1 weapons; it never
  could, because D5 × 1 = 5 against D2 × 4 = 8. This finally makes that claim true.
- **Rend and Evisceration do not interact.** Both add `+1 Damage` per wound, and
  **none of the six can take either** — Rend lives on Chainsaw / Claw / Flamethrower,
  Evisceration on Talon. Verified, not assumed. The old spec's warning to "check the
  ceiling on weapons carrying those" has no target.

### 2. Everything else that breaks the band

The census the first draft never took. All measured at the field floor:

| weapon | change | why |
|---|---|---|
| **Arc Gun** | Pen 8 → **7** | 69% pinned, never in the six |
| **Crossbow** | Pen 8 → **7** | same |
| **Autocannon** | base 7 → **6**, Depleted Core +2 → **+1** (floor Pen 7) | base 7 + 2 = **Pen 9, 94% pinned by default**, at **ROF 4**. This is very likely the "heaviest weapons still lose to a rivet gun" result. |
| **Talon** | base 6 → **5**, Honed Talons +2 → **+1** (floor Pen 6) | 69% → 0% |

### 3. The field upgrades — stop selling a currency the band can't carry

Five upgrades grant always-on Penetration. **Every one of them sits on a weapon
with base Pen ≥ 6 — the exact weapons that cannot spend it.** Not one sits on a
weapon that can.

| upgrade | weapon | today | becomes | floor Pen/Dmg |
|---|---|---|---|---|
| **Reinforced Head** | Siege Maul | +2 Pen | **+1 Damage** (base 6 → 7) | 7 / 7 |
| **Haymaker** | Wrecking Ball | +3 Pen | **+1 Damage** (base 7 → 8) | 6 / 8 |
| **Fluked Head** | Anchor | +3 Pen | **Armour Piercing** | 7 / 6 |
| **Depleted Core** | Autocannon | +2 Pen | **+1 Pen** (base 6 → 7) | 7 / 2 |
| **Honed Talons** | Talon | +2 Pen | **+1 Pen** (base 5 → 6) | 6 / 3 |

Depleted Core and Honed Talons survive as Penetration because their weapons sit at
base 5–6 with **ROF ≤ 3** — low enough to spend a point, slow enough that the point
doesn't get multiplied. Depleted Core becomes a genuine choice: take it for Pen 7,
or take **AP Shells** for the reroll instead. Reliability-by-penetration versus
reliability-by-reroll, on one weapon.

> **Do not "re-shelve" the freed Penetration onto the low-Pen weapons.** It is the
> obvious move and it is wrong, twice over. Measured: putting +2 Pen on Sword /
> Circular Saw / Bulwark Shield takes each from Pen 5 (0% pinned) to Pen 7 (31%),
> adding roughly **+4 points back onto the 15.6%**. And on the machine guns it is
> actively dangerous — expected damage is `ROF × P(hit) × P(wound) × Damage`, so
> **ROF multiplies `P(wound)` too**: Mini Gun at Pen 3 → 6 goes from 40% to 70%
> wound chance against T4, **×8 ROF**. That is a 1.75× buff to a weapon already
> suspected of beating the heavies, and F2-B (the ROF economy) is **shelved and
> unsolved** — `2026-07-15-rof-heat-design.md` measured taxing ROF as *worse* than
> doing nothing (spread 3.0× → 3.9×).
>
> **The Penetration currency is not mis-shelved. It is over-supplied for the
> armour band.** If you add a +Pen upgrade anywhere, the rule is: **base Pen ≤ 6
> AND ROF ≤ 3.**

### 4. Delete Overmatch — every trace

| file | what to remove |
|---|---|
| `shared/rules.js` | `strOvermatchD`, `OVERMATCH_PER_D`, `OVERMATCH_MAX_D`. **Keep `woundRaw` and `WOUND_TN_FLOOR`** only if `woundTarget` still reads better for it — otherwise inline them back. |
| `shared/combat.js` | the `overmatch` rider in `rollWounds` (compute, the `sp` sum, the `overmatch: 0` on the negated path, the rider push) and the `"Overmatch"` ledger term at `combat.js:912` |
| `shared/glossary.js` | the `overmatch` entry |
| `rules.md` | the **Overmatch** paragraph in §7 and its mention in step 8's rider list |
| `shared/rules.test.js`, `shared/combat.test.js` | the Overmatch tests |

**`rules.md` is a runtime input, not documentation.** `server/config.js` →
`server/prompt.js` bakes it verbatim into the in-game rules bot's system prompt as
"the single source of truth", instructed to refuse rather than guess. If you delete
the rule from the engine and leave it in `rules.md`, the bot will teach players a
rule that no longer exists. **Grep `rules.md` for every magnitude you touch** — all
six weapons' Pen and Damage, and the four in §2.

**Keep:** Rend, Evisceration, the clamp, `effPen`, the ledger, the D12 location roll.
None of them are in scope.

#### One other spec references Overmatch — fix it or it lies

`2026-07-15-opponent-brain-design.md:129` says *"`D` is the weapon's damage dice
**plus `strOvermatchD(effStr, toughness)`**"*. That function will not exist, and the
doc points **forward** at unbuilt work — whoever implements the bot will grep it and
find nothing.

Commit `29952da` ("docs(bot): v1 scores hits, not damage — defer the damage term")
moved that reference into an explicitly-deferred section but **did not remove it**.
The same doc also cites *"F2-B — price ROF in heat is the live next step"* in three
places (`:87`, `:116`, `:374`) and reasons from it. **F2-B is shelved** — that
reasoning is stale independently of this spec.

Leave the *historical* docs alone — `2026-07-15-str-overflow-design.md`,
`2026-07-15-weapon-balance-findings.md` and the plans are the record of why this was
done, and rewriting them destroys the reasoning trail. The str-overflow spec is
already marked **SUPERSEDED**; do not gut it.

### 5. The drama — `combat.js` only, no client changes

A Damage-8 wound can take a light rig's engine (SP 7–9) from full to zero in one
blow. That should feel like something. **It already can, for free:** `RollConsole`
renders `entry.effects` as staggered animated lines
(`client/src/v2/overlays/RollConsole.tsx:182`) and already has a `crit` tone that
prints **`CRIT!`** under a settled die. Push a string; the client does the rest.

| trigger | effect line | frequency |
|---|---|---|
| a **single wound** takes a location from **full SP to 0** | `Wrecking Ball — engine torn open in one blow` | needs `Damage ≥ max SP`: only the Damage-8 guns, only vs light engines. Rare and earned. |
| a wound zeroes a location and **spills** (§7 overflow) into another | `Siege Maul — through and through → hull` | already fires today, and is currently **silent** |

Also set `tone: "crit"` on the wound die that destroyed the location, so the console
prints `CRIT!` on the die that did it — which is the entire reason the resolution
ledger exists.

**Two engine facts make this land correctly; do not "fix" either:**

- **Excess Damage does not evaporate** — `applyDamage` spends SP **one point at a
  time**, and each point past 0 fires `catastrophicAdditional` (§8), which spills to
  another location for mobility/weapon roles. This is *why* paying Penetration back
  into Damage is worth doing: Damage 8 is never wasted.
- **But for the hull and the engine, §8 is the kill tier — and Damage 8 reaches it
  from full health.** `catastrophicAdditional` on a `structural` or `power` part
  sets `destroyed = true` outright, and `recompute` then destroys the rig. So:

> **Damage 8 into a full engine of max SP 7 kills the rig outright, in one wound.**
> Seven points zero the engine; the **eighth** lands on a 0-SP power part and is an
> instant kill. Damage 8 into an engine of max SP **8** lands exactly on zero and
> does **not** kill.

**This is exactly one chassis: `light-sword-arc` ("Zebra"), the only engine-7 rig in
the game** (the other six lights are engine 8–9, every medium is 9–11). It needs the
D12 to roll 11–12 *and* the wound to land — roughly a **10%** window per attack that
targets it, and only from a Damage-8 weapon (Sniper Cannon, Wrecking Ball).

**An earlier draft of this section claimed the opposite** — that a one-blow location
kill could never be an instant rig kill, because §8 "only fires on a location already
at 0". That is true of a *separate* attack and false *within one call*, because
`applyDamage` loops per SP. The claim was reasoned from `catastrophicAdditional`'s
guard without reading its caller. **Same error, same document, third time.**

So the drama has three tiers, not two, and the third one is a decision rather than a
render:

| trigger | effect line |
|---|---|
| a single wound zeroes a location from full | `Wrecking Ball — engine torn open in one blow` |
| a single wound zeroes a location and **spills** into another | `Siege Maul — through and through → hull` |
| a single wound zeroes a **hull or engine from full and kills the rig** | `Wrecking Ball — Zebra gutted in a single blow` |

**Open call for the third tier.** A ~10% one-shot kill on the lightest chassis is
more than "a big hit removes a limb", which is what was approved. Three options, and
the implementer must not pick silently:

1. **Ship it.** It is one chassis, it needs the engine roll, and a doom-clock rig
   dying to a Wrecking Ball is the fiction working.
2. **Raise Zebra's engine 7 → 8.** One number in `CHASSIS`, and the one-shot window
   closes completely — Damage 8 then lands exactly on zero against every rig alive.
3. **Cap Damage at 7.** Costs Sniper Cannon and Wrecking Ball their alpha identity
   and drops `ROF × Damage` to 7. Not recommended — it undoes the payback.

**Recommend (2).** It is a single digit, it preserves every weapon number in this
spec, and it makes "Damage 8 can zero any engine but never one-shots" a clean,
teachable rule. Measure first if you disagree — the duel harness prices exactly this.

The second effect line is the sneaky-good one. Spill fires today and the console
never says so, so players cannot tell why a hull lost SP the attack never targeted.

### 6. Re-measure — both harnesses, and the second one matters most

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

---

## What success looks like

| question | instrument | bar |
|---|---|---|
| dead band shrank? | sweep | arc ratio, `WEIGHT_PEN_MOD` delta and +Pen uplift stay **alive** for the six — they were revived by Overmatch and must survive its deletion |
| the heavies climbed? | duel | they are ROF 1; `SP/round` should rise with the Damage payback |
| **reliability revived?** | duel | `penetrator-rounds` (−2.77), `ap-shells` (−1.47), `shaped-charges` (−0.70) should move **toward zero or positive**. This is the sharpest single test of the whole thesis. |
| `ROF × Damage` gap closed **for the six**? | the stat table | all six land in 6–8. Bulwark Shield and Crossbow stay out — see below. |
| Autocannon stopped saturating? | sweep | it defaulted to Pen 9 / 94% pinned at ROF 4; its arc bonus should come alive |
| nothing else broke | `npm test` | 811 node / 293 vitest at time of writing |

**The critical one is reliability.** The claim is that compressing Penetration gives
those three upgrades headroom to sell. If they do *not* improve, the thesis is wrong
and you should stop and say so rather than tune around it.

---

## What stays open — say so, don't paper over it

The first draft claimed "one change, three problems." It closes two.

- **F2-C is only closed for the six.** **Bulwark Shield** (`ROF × Damage` **3**) and
  **Crossbow** (**4**) stay below the band and are **not pinned** — they were never
  the same problem. There are *four* ROF-1 ranged weapons and only three Damage
  values in 6–8, so Crossbow cannot join without colliding with Harpoon. **Declare
  Crossbow and Bulwark Shield deliberate low-alpha utility weapons** (Precision /
  pin / shield) and scope F2-C to the six. Do not repeat the draft's mistake of
  claiming one change closes it.
- **`UNIT_WEAPONS` is knowingly out of band.** Tank Cannon (`Pen 10 / Damage 5`,
  **100% pinned vs rigs**, `ROF × D` 5), Ram Spike (Pen 9, 100%), Dozer Blade
  (Pen 8, 88%), Rocket Pod (Pen 8, 88%). They have `flatPick: true` and **no
  `WEAPON_UPGRADES` entries**, so base Pen is exactly what fights. Deferred to its
  own spec — but **deferral here is not neutral**: once rig weapons drop to Pen 6–7
  and Tank Cannon stays at 10, **the Marksman Tank becomes the most reliable gun in
  the game**, a support unit out-penetrating every rig with no upgrade slot it had
  to pay from. **Exclude `UNIT_WEAPONS` from the success bar** so nobody reads the
  gap as a regression, and file the follow-up.
- **F2-B (the ROF economy) is shelved and unsolved.** `ROF` multiplies both
  `P(wound)` and `Damage`. This spec does not fix that; it only stops making it
  worse.

---

## Traps. Every one of these has already bitten someone on this codebase

1. **Field is the floor.** `normalizeWeaponUpgrade` (`game-state.js`) returns
   `upgrades[0].id` for a null id — **`makeRig` cannot build an un-upgraded rig.**
   Every legal Wrecking Ball carries Haymaker and swings at the floor value, not the
   base. Any worked example you write from base Pen is wrong. This silently ruined a
   sweep's first run, invalidated two test fixtures, **and produced the first draft's
   headline number.** Rule 2 above exists to kill it.
2. **Heavy and colossal are gone — this trap is CLOSED, and the lesson is not.**
   They were deleted on 2026-07-16 (`d8a8d3d`, `5aebc26`): the maps carry
   `["light", "medium"]`, `toughnessOf` throws for anything else, and three
   mutation-tested guards pin it. You cannot fall into this one any more.
   **What you can still fall into is the shape of it:** this spec's author and its
   reviewer both balanced against a board that could not be fielded, because they
   read a *map* instead of the *gate*. The maps were four classes wide and
   `SUPPORTED_RIG_CLASSES` was two. **A table's keys are not evidence that the
   thing is reachable.** The same shape is live elsewhere — see trap 1 (field is
   the floor) and the `UNIT_WEAPONS` deferral.
3. **The duel must run `arc: "side"`, never `"front"`.** `arcBonus` returns **`null`**
   for Raking Fire outside side/rear (`combat.js:401`) — a hard zero **by rule**, not
   a failed roll. Mini Gun and Double MG carry the perk. At front they run ten full
   rounds dealing **literally 0**. Nothing lies; the output is a rule wearing a bad
   roll's costume. **The tell: ask whether a zero is a measurement or a rule.**
4. **`availableActions` is a UI model, not a legality oracle.** Six places where
   `enabled` disagrees with what the engine does are catalogued in
   `2026-07-15-duel-harness-design.md`. When mirroring an engine refusal, **copy its
   predicate, not its gist** — both plausible fixes for one of them were wrong, and
   both failed *silently* rather than crashing.
5. **The duel's numbers are censored three ways** — arm-loss, early-wreck (SP total
   saturates against the control's pool), and horizon (`†` rows: `rounds` is a floor,
   `SP/round` a ceiling). Read the report's own caveat block; it is printed first for
   a reason.
6. **The duel prices a prototype's cost, not its benefit.** `greedySafe` makes no
   choices, so Fire Control Lock, Enfilade, Barrage and the spatial effects read 0.00
   because they *cannot be exercised*, not because they are worthless.
7. **`git add <file>` stages the whole file.** `package.json`, `package-lock.json` and
   `client/shared.d.ts` carry an in-progress dependency upgrade belonging to the user.
   Do not sweep them in. An earlier task did, and it had to be undone.
8. **Do not use `sed -i`** on this repo — it rewrites CRLF and leaves files dirty with
   an empty `git diff`.
9. **Another agent commits to this branch.** Never `git add -A`; never trust `HEAD~1`.
   HEAD moved twice while this spec was being written.

## The meta-lesson, which is why this spec is so specific

Every design decision in this area that was *reasoned about* turned out wrong, and
every one took minutes to check once code existed. The arc (front zeroed two
weapons). The metric (SP@10 saturates at the wreck). The censoring (called
"censored", then "clean"; actually clean in the middle and censored at both ends).
Overmatch itself. And then **the first draft of this document**, which closed with
"measure before you argue" and then argued its way to three false claims.

**Measure before you argue. Both harnesses exist now and they are cheap.**

## Out of scope

- **The clamp.** Load-bearing. Do not touch.
- **The wound roll itself.** Deleting it was considered and rejected: it is a 2.3×
  lever across real matchups — weaker than ROF (8×) or distance (5×), but not
  nothing.
- **Toughness.** Widening the armour band would also cure saturation, and it is a
  bigger, riskier change that touches every unit kind. If the Damage payback
  under-delivers, this is the next lever to consider — not the clamp.
- **The D12 location roll**, Rend, Evisceration.
- **The metronome prototypes.** `penetrator-rounds` ("every 3rd volley") and
  `enfilade` ("every 3rd aimed shot") are counters, not decisions — a separate fun
  problem. This spec may make them *viable*; it will not make them *interesting*.
- **Bot-vs-bot** (`2026-07-15-opponent-brain-design.md`) — still the only way to
  price choice-dependent prototypes.
