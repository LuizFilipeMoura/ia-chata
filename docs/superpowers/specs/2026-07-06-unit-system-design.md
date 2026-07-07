# Generic Unit System — Tanks & Walkers — Design

Date: 2026-07-06

Extends:
- [2026-07-05-activation-combat-resolution-design.md](2026-07-05-activation-combat-resolution-design.md)
- [2026-07-04-rig-condition-tracker-design.md](2026-07-04-rig-condition-tracker-design.md)
- [2026-07-05-rig-equipment-loadout-design.md](2026-07-05-rig-equipment-loadout-design.md)

## Goal

Today the game has exactly one unit: the **Rig** — a single model with four fixed
components (Hull / Arms / Legs / Engine), heat on the Engine. This design turns "Rig"
into one instance of a **generic unit system** so the game can field **Tanks** and
**Walkers** alongside Rigs, and can grow new machines as *data* rather than code.

This is a design of the **content and rules** only. Implementation (data model, UI,
command/tag protocol, prompt changes, where the registry lives) is deliberately **out
of scope** here and picked up in a later plan. The Blast radius section maps *where*
it lands only to bound the eventual plan.

**Multi-model infantry/squads are explicitly deferred** — their rules are fully mapped
in memory (`infantry-unit-design-deferred`) and summarized under Deferred below, but
they are **not** part of this build.

⚙ **All numeric values below are TUNING strawmen** (SP, armour rows, ROF/STR, ram STR,
speed) — placeholders to make the spec complete, to be set in playtesting.

## Core shape

- A **unit slot** is the atomic thing for balance, army size, and activation:
  **1 slot = 1 count = 1 activation**, regardless of unit kind.
- **Balance is matched composition only** — both sides mirror their unit types
  (extends today's "same number of Rigs per weight class", rules §3). **There is no
  points economy** (the removed Alpha "Oil" currency stays removed). Matched counts are
  what keep strict-alternation activation fair, so **the activation loop is unchanged**.
- Every unit, whatever its kind, is still *"a thing with a budget of actions that ends
  its activation"* — which is all the activation engine already assumes.

### Two design tiers that emerged

- **Rig = the deep tactical layer:** heat/overheat, facing/arcs, two weapon slots +
  upgrades, weight-class STR scaling, preparations, 3 actions. **Unchanged.**
- **Tank & Walker = the simple layer:** single-model war machines with facing/arcs and
  full facing-movement *like* a Rig, but **cold** (no heat), **one flat-profile weapon**,
  **no equipment**, **no preparations**, and a **smaller action budget**.

## The component-role refactor (the load-bearing change)

Every catastrophic-damage effect today branches on a component *name*
(`if loc === "arms"…`). This design re-keys those effects on a **role**, so any unit's
parts map onto shared behavior:

| Role | 0 SP effect | Additional damage |
|---|---|---|
| `structural` (Hull-like) | −2 max actions, −1 Aim | Unit destroyed |
| `power` (Engine-like) | Lose next activation | Unit destroyed |
| `mobility` (Legs-like) | Move penalty (−3", no backpedal, pivots cost double) | Immobilised for the game |
| `weapon` (Arms-like) | The mounted weapon is destroyed; munitions cook off (1 to a `structural` + 1 to a `power` part) | +3 to a `structural` part; weapon gone for the game |

Role mappings:
- **Rig** — hull→`structural`, arms→`weapon`, legs→`mobility`, engine→`power`. **Behavior
  is byte-for-byte unchanged**; the existing `shared/*.test.js` suites are the regression
  net for this refactor.
- **Tank** — hull→`structural`, turret→`weapon`, tracks→`mobility`, engine→`power`.

Because a Tank keeps **four** parts, the D12 hit-location table keeps its shape — only
the labels change (`1–4 Hull, 5–7 Tracks, 8–10 Turret, 11–12 Engine`). Units with a
different part count would need their own hit table; none in this build do.

## The unit-type registry

Each unit kind is one registry entry describing:

| Field | Meaning |
|---|---|
| `parts` | Ordered list of `{ name, role, sp }` |
| `hitLocation` | D12 → part-name table |
| `armour` | Impact-severity thresholds per part (the IMPACT rows) |
| `hasHeat` | Runs the heat/overheat system? |
| `hasArcs` | Has a facing → attackers get side/rear STR bonuses, facing-movement applies |
| `actionBudget` | Base actions per activation |
| `weaponMode` | `"rig-catalog"` (slots + upgrades + weight scaling) or `"flat-pick"` (one weapon from the shared list) |
| `reloads` | Ranged weapon spent-until-reloaded rule applies? |
| `hasEquipment` | Equipment slot? |
| `reactions` | May hold preparations / receive Answer tokens? |
| `ramStr` | STR used when it Rams (rules §5) |
| `destruction` | Rule for "unit dead": `single-model` (Hull or Engine destroyed, or all parts 0) or `all-members` (infantry only, deferred) |

Adding a new Walker later is **only a new registry entry** — no engine changes.

## The kinds

### Rig (refactored, unchanged behavior)

`weaponMode: rig-catalog`, `hasHeat: true`, `hasArcs: true`, `actionBudget: 3`,
`reloads: true`, `hasEquipment: true`, `reactions: true`, `destruction: single-model`.
All existing stats (RIG_DEFAULTS, HEAT_CAPACITY, IMPACT, weapons, equipment, upgrades)
carry over untouched.

### Tank

`hasHeat: false`, `hasArcs: true`, `actionBudget: 2`, `weaponMode: flat-pick`,
`reloads: true`, `hasEquipment: false`, `reactions: false`,
`destruction: single-model`, `ramStr: 9` ⚙.

Parts + strawman SP ⚙:

| Part | Role | SP |
|---|:--:|:--:|
| Hull | structural | 8 |
| Tracks | mobility | 7 |
| Turret | weapon | 6 |
| Engine | power | 6 |

Strawman armour (IMPACT thresholds, direct / severe / critical) ⚙ — roughly Heavy-Rig grade:

| Part | Direct | Severe | Critical |
|---|:--:|:--:|:--:|
| Hull | 13–14 | 15–16 | 17+ |
| Tracks | 14–15 | 16 | 17+ |
| Turret | 12–13 | 14–15 | 16+ |
| Engine | 8–10 | 11–12 | 13+ |

Other strawman ⚙: Speed 3"; hit table `1–4 Hull / 5–7 Tracks / 8–10 Turret / 11–12
Engine`. Turret at 0 SP jams the tank's only gun → it can still **Ram** until repaired
(meaningful, not a death sentence).

### Walker

A legged war machine in the simple tier — `hasHeat: false`, `hasArcs: true`,
`weaponMode: flat-pick`, `hasEquipment: false`, `reactions: false`,
`destruction: single-model`. Everything else is registry data; a Walker is faster and
lighter than a Tank. One strawman entry to prove the shape ⚙ ("Sentinel"):

| Part | Role | SP |
|---|:--:|:--:|
| Hull | structural | 6 |
| Legs | mobility | 6 |
| Weapon Mount | weapon | 5 |
| Engine | power | 5 |

Strawman ⚙: `actionBudget: 3`, `ramStr: 8`, Speed 4"; armour ≈ Medium-Rig grade; hit
table `1–4 Hull / 5–7 Legs / 8–10 Mount / 11–12 Engine`.

## Weapons — two domains

**Rig catalogue** — unchanged: Long Range + Melee slots, two fixed upgrades per weapon,
weight-class STR scaling (rules §12). **Rigs only.**

**Unit-weapon list** — one shared **flat** list for Tanks / Walkers / (later) Squads.
A unit picks **exactly one** weapon from it — ranged *or* melee. Key differences from
the Rig catalogue:
- **Flat STR** — no weight-class modifier; the listed STR is what it hits for on any
  chassis.
- **No slots, no upgrades** — perks are innate to the list entry.
- Same profile shape (ROF / STR / ACC / RNG / perks) so combat resolution never cares
  which domain a weapon came from.

Strawman list ⚙ (near/far ACC; RNG near/far in inches):

| Weapon | Type | ROF | STR | ACC | RNG | Perks |
|---|---|:--:|:--:|:--:|:--:|---|
| Tank Cannon | ranged | 1 | 12 | 0 / −1 | 12 / 24 | — |
| Autocannon Mount | ranged | 3 | 8 | 0 / −1 | 12 / 24 | Full Auto |
| Coaxial MG | ranged | 6 | 5 | +1 / −1 | 9 / 18 | Full Auto, Raking Fire |
| Rocket Pod | ranged | 2 | 10 | 0 / 0 | 15 / 30 | Charged Shot |
| Dozer Blade | melee | 1 | 10 | 0 | 1.5 | Melee |
| Ram Spike | melee | 1 | 11 | +1 | 1.5 | Melee, Impale |

A unit that picks a ranged weapon uses **Ram** (rules §5, via its `ramStr`) for close
combat; a unit that picks a melee weapon fights in melee directly.

## Heat is now Rig-exclusive

With Tanks and Walkers cold (and Squads later too), heat/overheat is a **Rig-only**
system. For any `hasHeat: false` unit: actions generate no heat, `endActivation` skips
the overheat roll, `Shut Down` is inert, and the heat gauge is hidden. Cold units are
throttled instead by their **smaller action budget** — the tank's 2 actions replace
heat as the "how hard can I push" ceiling.

## Arcs, facing & movement

Facing/arcs belong to **single-model** units. Rigs, Tanks, and Walkers all have arcs —
attacks into their side arc get +2 STR, rear +4 STR (rules §7), and they use the full
facing-movement rules (forward / backpedal / side-step / pivot with the >90° penalty).
This is the `hasArcs: true` path; nothing changes for them.

Arc handling is made **configurable** (`hasArcs`) purely so the deferred infantry kind
(no single facing) can turn it off. In this build every unit has arcs on.

**Raking Fire** (machine guns: no front damage, +4 side / +8 rear) keys off arcs and so
works normally against Rigs, Tanks, and Walkers.

## Reactions & activation

- **Preparations and Answer tokens stay Rig-only** (`reactions: false` for the simple
  tier). Two of the four preps are wired to the Rig layer (Brace is arc-based, Raise
  Shield is Bulwark gear), so they don't belong on cold, simple units. Tanks and Walkers
  don't prepare — they act.
- **Activation is unchanged.** Units alternate one at a time in initiative order; each
  spends its own `actionBudget`; matched composition keeps the alternation fair. The
  only per-unit differences the loop sees are the action count and the skipped overheat
  step for cold units.

## Blast radius (to bound the later plan — not built here)

Where the four-component / heat assumption is hardcoded today and will need to read from
the registry / branch on role:
- `LOCS` arrays (`shared/game-state.js`, `client/src/state/rules.js`, `client/src/lib/rigView.ts`, `client/src/components/rig/RigItem.tsx`).
- `IMPACT` + `hitLocation` D12 table (`shared/rules.js`).
- Catastrophic cascades `catastrophicOnZero` / `catastrophicAdditional` (`shared/game-state.js`, ~line 530) → re-key on role.
- Overheat + heat paths (`applyOverheat`, `heatMeter`, `endActivation`) → guard on `hasHeat`.
- `makeRig` → a general `makeUnit` that reads a registry entry.
- Action budget at activation (`shared/game-state.js` ~line 1049) → per-unit `actionBudget`.
- Weapon resolution STR scaling (`effectiveWeaponProfile`, `shared/combat.js`) → skip weight-class modifier for `flat-pick` weapons.
- LLM tracker protocol + stat block (`server/prompt.js`) → teach unit kinds.
- UI: component rows already render generically from a parts list (`CompRow.tsx`); need part-name icons for Tracks/Turret/Mount, a heat-gauge guard, and a build-wizard branch for the flat-pick single-weapon, no-equipment path.
- `shared/battle-view.js` modifier strings → derive from roles, not hardcoded names.

## Scope / non-goals

- **Infantry / multi-model squads** — deferred (see Deferred below). Not built.
- **Points-buy** — dropped for good; balance is matched composition.
- **Implementation** — data model, registry location, UI, tag protocol, prompt edits are
  the later plan's job, not this design's.
- **Equipment / upgrades for the simple tier** — Tanks and Walkers have neither; both are
  Rig-layer features.

## Deferred — infantry (mapped, not built)

Summary of the banked design (full detail in memory `infantry-unit-design-deferred`):
a squad is **one slot / one count / one activation** holding **multiple minis**. In the
data model it's a unit whose **parts are its member models** (wounds instead of SP; a
member at 0 is removed), reusing the same per-hit combat loop. Variable member count;
cold; **no arcs, no facing-movement**; each member fires the **same shared gun**
independently with **no reload** (firepower = living members × ROF, so attrition scales
it); melee allowed; `destruction: all-members`. Raking Fire deals normal damage vs
arc-less infantry. The `hasArcs` / `destruction` / multi-mini flags in this design are
the seams it plugs into.

## Open tuning questions (deferred to playtest)

1. All strawman numbers — Tank/Walker SP and armour rows, the flat-weapon profiles, ram
   STR, speeds.
2. Is a Tank's **2 actions** the right throttle against a Rig's 3 (+ heat risk), or does
   it need 1 / a different lever?
3. Contents of the flat unit-weapon list — how many entries, and the ranged/melee mix.
4. Do **Tanks/Walkers keep the reload rule** (`reloads: true` strawman), or should cold
   single-gun machines fire freely like infantry will?
5. Whether Walkers want any distinguishing quirk beyond "faster, lighter Tank," or stay
   pure data.
6. The `structural` 0-SP penalty (−2 max actions) is proportionally brutal on a
   2-action Tank — it drops to **0 actions** and can't Repair its way out (death-spiral).
   Options: make the penalty a role-relative value, floor cold units at 1 action, or
   accept it. Needs a call before build.
