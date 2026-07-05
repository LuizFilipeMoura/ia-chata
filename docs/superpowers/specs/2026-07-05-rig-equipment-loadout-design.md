# Rig Equipment & Weapon Upgrades — Design

Date: 2026-07-05

Extends:
- [2026-07-05-activation-combat-resolution-design.md](2026-07-05-activation-combat-resolution-design.md)
- [2026-07-04-phase2-weapons-agentic-gather-design.md](2026-07-04-phase2-weapons-agentic-gather-design.md)

## Goal

Add a pre-battle **customization layer** so two Rigs with the same weight class and
weapons can still play differently. Customization happens at Rig creation and has
two independent parts:

1. **Rig equipment** — every Rig has **one** equipment slot. The chosen equipment
   gives an always-on passive plus a reusable active ability.
2. **Weapon upgrades** — every weapon carries **two fixed signature upgrades** that
   define its character. These *replace* the old idea of innate weapon "perks."

This is a design of the *content and rules* only. Implementation (data model, UI,
command protocol, where the catalogues live) is deliberately **out of scope** here
and picked up in a later plan.

## Core shape

- A Rig makes exactly **one** build decision: which equipment fills its single slot.
- A weapon makes **no** build decision for now — its two upgrades are fixed and
  *are* its identity. (A future "pick 2 from a 3–4 menu" version drops in cleanly if
  we ever want weapon builds; see Future extensions.)
- So the agonizing lives in the equipment slot; weapons are pure flavor.

### Two design principles that governed every call

1. **No effect can be a no-op.** Any equipment or upgrade must always do something on
   a legal target/weapon. (This is why the two weapon-boosting equipment were cut —
   see below — and why weapons ship perk-free with upgrades bolted on rather than
   hard-coding a perk that a weapon might already have.)
2. **Proximity-based multi-target is dead at this scale.** With at most 6 Rigs on the
   table (`MAX_RIGS_TOTAL`), "also hit a 2nd target within X inches" almost never
   triggers. Effects must hit **one target** harder/differently, or hook the
   **activation / state** system — never rely on enemies clustering.

## Part 1 — Rig equipment (5 pieces)

One equipment per Rig. Each is a **passive** (always on) + a **1-slot active**.

### Active-ability constraint model

Actives are leashed by the systems the game already has, not a new resource:

- **Cost to fire:** one **action slot** (out of the activation's 5, `−2` if Hull at 0)
  **plus** the listed **heat**. Spending a slot on an ability is a slot not shooting;
  the heat feeds the End-Activation overheat check.
- **Availability:** **unlimited** — no charges, no cooldowns. The 5-slot budget and
  the overheat table are the only limiters. This keeps every active competing directly
  with firing and keeps the whole tier consistent.

### The catalogue

| Family | Equipment | Passive (always on) | Active — *costs 1 slot* |
|---|---|---|---|
| **Armor** | **Ablative Plating** | +1 max SP to Hull | **Harden** (+1 heat): until this Rig's next activation, all impact rolls against it are at −1 |
| **Cooling** | **Radiator Array** | Cools **3** heat in Recovery instead of 2 | **Purge** (−2 heat): vent on demand |
| **Mobility** | **Servo Actuators** | Sprint costs 1 heat instead of 2 | **Jump Jets** (+2 heat): move up to **base Speed**, ignoring terrain, enemy Rigs, and all leg-damage / Speed-halved penalties |
| **Power** | **Overclock Core** | The first time this Rig's Engine reaches 0 SP, it does **not** skip its next activation | **Overclock** (+3 heat): +2 actions this activation (net +1 after the slot) |
| **Utility** | **Field Repair Suite** | The **Repair action** restores +1 additional SP | **Emergency Patch** (+2 heat): guaranteed repair 2 SP to one location, no D12 roll |

All five run on Rig stats that already exist (SP/max, heat capacity, action budget,
Recovery cooldown, movement) — **no dependency on weapon profiles**.

### Balance reasoning (why the numbers are what they are)

- **Radiator Array** originally granted **+1 Heat Capacity** as its passive plus a
  **Purge −3** active. That was two independent heat levers, and the capacity bump
  *permanently halved* overheat danger every turn — it let a Rig opt out of the game's
  central tension. Fixes: passive downgraded to a milder Recovery cooldown (redline
  untouched), and Purge cut to **−2** so a genuinely hot turn still faces the misfire
  table — the gear makes you *resilient* to heat, not *immune*.
- **Jump Jets** uses **base** Speed, not current Speed, and ignores leg penalties —
  because jets bypass the legs, and it makes the Mobility piece *mobility insurance*
  (a leg-shot Rig can still relocate). It grants no extra distance beyond a healthy
  Move, so there is no teleporting; the cost is a slot + heat every use.
- **Emergency Patch** costs **+2 heat** (it was 0). Free guaranteed healing was
  strictly better than the Repair action and let a tank out-heal fire forever. Heat
  puts it inside the same leash as every other active; chain-patching now risks an
  overheat check. The Repair-action passive (+1 SP) applies to the **Repair action
  only**, so it does not compound the active into a guaranteed 3 SP.
- **Overclock** is intentionally **uncapped** — heat *is* the whole gamble, and it is
  the most fun lever in the set. If playtests show early-round (cool) abuse, the first
  dial is a steeper heat curve or a per-activation cap.

### Two families that were cut

**Munitions Feed** (+STR to a weapon) and **Targeting Computer** (+Aim) were dropped.
They overlapped the weapon-upgrade layer (Part 2) and courted no-op risk (e.g. "+AP"
on a weapon that already had AP). Weapon customization now lives entirely in weapon
upgrades, leaving equipment as the home for **Rig-wide effects and the active-ability
layer**.

## Part 2 — Weapon upgrades

Every weapon = **base ACC / ROF / STR** + **two fixed signature upgrades**. Upgrades
are:

- **Passive only.** All active-ability drama stays on the Rig's single equipment slot;
  weapon upgrades never add actions. (Otherwise a Rig with 2 weapons would carry up to
  5 actives — far past the "keep it simple" bar.)
- **Category-legal.** Ranged upgrades on ranged weapons, melee on melee.
- **Fixed.** No per-weapon choice for now — the two upgrades *are* the weapon.

### Perks became the toolkit

The perk vocabulary from the combat-resolution design is now the **shared mechanical
toolkit**; each weapon's named upgrades are flavored, tuned applications of it. The
engine only ever knows a handful of effects — the flavor is the wrapper. So "APDS
Rounds" and "Keen Edge" can both simply *be* AP/Rend under the hood.

**Toolkit effects reused** (already in the combat spec): AP, Rend, Precision, +STR,
+ROF (dice showing 1 add heat), Incendiary (+target heat), Shock (Speed-halved),
Impale (immobilise on a strong hit), Staggering (push/pivot), ignore-cover,
no-far-penalty.

**New mechanics introduced** (each on exactly one or two weapons, all single-target):

- **Reach** — strike a target up to 1" further away / charge bonus (Lance).
- **Scatter** — a hit also deals 1 damage to a second *random location on the same
  target* (Mortar's Cluster Shells).
- **Systems Overload** — a hit gives the target **1 fewer action on its next
  activation** (does not stack) (Arc Gun).
- **Sunder** — a hit reduces the struck location's **max SP by 1**, permanently; it
  cannot be repaired back past that (Circular Saw).
- **Reroll-a-miss** — minor; reroll one missed attack die (Double MG).

**Cleave was removed** (it had been on Arc Gun and Circular Saw) per the
proximity-is-dead principle.

### The 12 weapons

#### Ranged

| Weapon | Signature upgrades | Identity |
|---|---|---|
| **Mini Gun** | **Extended Belt** (+2 ROF; dice showing a 1 add heat) · **Suppressive Fire** (Shock: Speed-halved) | Volume + pin |
| **Double MG** | **Tracer Rounds** (Incendiary: +1 target heat/hit) · **Gyro Mount** (reroll one missed die) | Steady burn |
| **Autocannon** | **AP Shells** (AP) · **Depleted Core** (+STR) | Armor-cracker |
| **Arc Gun** | **Systems Overload** (−1 action next activation) · **Ion Burn** (Incendiary: +1 target heat/hit) | Disrupt + cook |
| **Mortar** | **Airburst Fuze** (ignore cover) · **Cluster Shells** (a hit also chips a 2nd random location) | Artillery — can't hide, can't turtle one part |
| **Sniper Cannon** | **Match Barrel** (no far-range penalty) · **Marksman Optics** (Precision: Aimed Shot loses −2) | Reach + called shots |

#### Melee

| Weapon | Signature upgrades | Identity |
|---|---|---|
| **Sword** | **Duelist's Balance** (Precision) · **Keen Edge** (Rend) | Accurate deep cuts |
| **Circular Saw** | **Tempered Teeth** (AP) · **Sunder** (−1 max SP to the struck location) | Anti-armor grinder |
| **Chainsaw** | **High-Rev Motor** (+STR, but +1 heat per strike) · **Ripper Teeth** (Rend) | Brutal grind that self-cooks |
| **Claw** | **Vice Grip** (Impale: strong hit → immobilise) · **Rending Talons** (Rend) | Grab + shred |
| **Lance** | **Couched Reach** (Reach) · **Spearpoint** (Impale) | Reach + pin |
| **Wrecking Ball** | **Haymaker** (+STR, big) · **Wrecking Momentum** (Staggering: knock back / pivot) | Raw power + knockback |

### Overlap notes (intentional)

- **Rend ×3** (Sword, Chainsaw, Claw) — the "cutters." **+STR ×3** (Autocannon,
  Chainsaw, Wrecking Ball) — the "heavy hitters." These are family signatures, not
  accidents; each weapon's *pair* is a unique combination.
- **Chainsaw's self-heat** (+1 per strike) is the only upgrade that costs the wielder —
  kept deliberately as flavor (the saw revs and cooks your engine). Tunable if it reads
  as too punishing.
- **Arc Gun** carries one disruption (Systems Overload) + one offensive/pressure effect
  (Ion Burn) so it is not *only* control. Alternative if it ever needs hard damage: swap
  Ion Burn → AP (loses the heat-synergy and the distinct identity).

## Readiness / phasing

- **Rig equipment (all 5)** is buildable on today's stats — no weapon-profile
  dependency. It could ship first.
- **Weapon upgrades** depend on two things existing: (a) weapon **base stats**
  (ACC/ROF/STR per weapon), and (b) the **attack-resolution engine** that reads the
  toolkit effects (mid-build in the combat-resolution design). Until those land, the
  upgrade catalogue is authored data waiting to be wired in.

## Non-goals / parked

- **Implementation** — data model, catalogue location, UI, command/tag protocol, and
  Gemma prompt changes are all out of scope for this design.
- **Per-weapon upgrade choice** — fixed 2 for now; the menu/pick-2 version is a future
  extension, not built.
- **Heavy / Colossal weapons** — the tracker only supports Light/Medium; their weapons
  (and any Reach/area rules they'd need) are not in scope.
- **Points-buy or slot-scaling economies** — a Rig has exactly one equipment slot; a
  weapon has exactly two upgrade slots. No budgets.

## Future extensions (noted, not built)

- **Weapon builds:** promote each weapon's fixed 2 to a **3–4 signature menu, pick 2**,
  optionally with 1–2 truly universal upgrades so menus aren't 100% bespoke.
- **Overclock cap / heat curve** if the uncapped active over-performs early-round.
- **Second equipment slot** for heavier classes if/when Heavy/Colossal arrive.

## Open tuning questions (deferred to playtest)

1. Keep Chainsaw's self-heat, or make it feel more optional?
2. Circular Saw **Sunder** (−1 max SP, new mechanic) vs the lower-surface **Whirling
   Cut** (an extra impact roll, reuses ROF math)?
3. Is **Rend ×3 / +STR ×3** too samey in play, or acceptable as family signatures?
