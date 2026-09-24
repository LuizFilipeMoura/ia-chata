# Design, two new light chassis: Tether & Attrition

**Date:** 2026-07-11
**Status:** approved, ready for implementation plan

Add two prebuilt light chassis to `PREBUILT_RIGS`, each with two new globally-unique
weapons and three Field/Tuned/Prototype upgrades apiece. Four new weapons total
(2 long-range, 2 melee), twelve new upgrades. Follows the "Adding a new chassis"
procedure in [AGENTS.md](../../AGENTS.md).

Both chassis are **light**. SP is per-chassis (~2× the light class default of
Hull 6 / Arms 5 / Legs 5 / Engine 4).

## Chassis A, `light-harpoon-anchor`: Tether/control

**Weapons:** Harpoon (long-range) · Anchor (melee) · **Class:** light
**Focus:** control. Spear a rig at range, chain it down in melee, deny escape.
A light bruiser that wins by pinning one target and refusing to let it leave.

**SP:** `{ hull: 12, arms: 11, legs: 11, engine: 8 }`

### Harpoon (long-range)

Stats: `{ rof: 1, str: 12, sweet: 14, peak: 2, dropoff: 0.28, minRange: 0, maxRange: 22 }`: a heavy single-shot line-thrower; punchy at close-to-mid range, falls off past the sweet spot.

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Barbed Head | Gains **Impale** (D12 ≥ 8 immobilises). | `Gains Impale` | ✅ built (`{ perks: ["Impale"] }`) |
| **Tuned** | Taut Cable | **+3 STR** vs a target that is **immobilised or engaged** (already pinned down). | `+3 STR vs pinned/engaged targets` | 🔧 new, one conditional branch in `computeStr`, mirrors `vsDisrupted`. `{ vsPinned: true }` |
| **Prototype** | Harpoon Winch | On a damaging hit, emit a player instruction: reel the target **up to 4″ toward you** (move the mini). The pull **roots you for the rest of the activation** and runs **+2 heat**; **3-round cooldown**, during which the harpoon fires normally with no reel. | `Spear and reel a rig 4″ toward you, roots you, runs hot` | 🔧 new, clone of `towChain` (spatial: fling→reel; same heat/root/cooldown sim). `{ harpoonWinch: true }` |

### Anchor (melee)

Stats: `{ rof: 1, str: 12, acc: [0, 0], rng: [2, 2], melee: true }`: one heavy hooking blow.

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Fluked Head | **+3 STR** (12 → 15). | `+3 STR` | ✅ built (`{ str: 3 }`) |
| **Tuned** | Dead Weight | A damaging hit means the struck target **cannot Disengage its next activation**: it's pinned under the anchor for a turn. | `Struck target can't Disengage next activation` | 🔧 new, flag `noDisengageNextActivation`, set on damaging melee hit, gates the `disengage` action, cleared at activation end (like `noPrepNextActivation`). Non-spatial. `{ deadWeight: true }` |
| **Prototype** | Ground Anchor | A damaging hit while locked drives the anchor in (`anchoredBy` = attacker). The target **can still Disengage, but tearing off the anchor costs it one free Anchor strike** (the Anchor's live STR) as it leaves. Clears when the engagement ends by any means (Disengage, destruction, immobilise). | `Anchor a rig in the lock; leaving you costs it a free Anchor hit` | 🔧 new, mirrors the Lance `skewer` plumbing (`skeweredBy` + `resolveSkewerStrike`), generalised so the free strike uses the Anchor's STR, not a hardcoded 11. `{ groundAnchor: true }` |

## Chassis B, `light-rivet-pressureclaw`: Attrition (all non-spatial)

**Weapons:** Rivet Gun (long-range) · Pressure Claw (melee) · **Class:** light
**Focus:** industrial attrition / armour-strip brawler. Stitch pins into a rig at
short range, then crush its locations open in melee. Grinds a target down location
by location. **No spatial mechanics, every effect is state-tracked.**

**SP:** `{ hull: 13, arms: 11, legs: 10, engine: 9 }`

### Rivet Gun (long-range)

Stats: `{ rof: 6, str: 4, sweet: 6, peak: 2, dropoff: 0.40, minRange: 0, maxRange: 14 }`: a rapid, low-STR, very short-range industrial fastener gun (shortest max range in the table).

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Rapid Feed | **+2 ROF** (6 → 8). | `+2 ROF` | ✅ built (`{ rof: 2 }`) |
| **Tuned** | Staple Burst | **4+ hits** in one attack → target loses **1 action** next activation. | `4+ hits pins the target (−1 action)` | ✅ built (`{ pinOnHits: 4 }`) |
| **Prototype** | Rivet Lock | Consecutive damaging volleys **on the same location** stack rivets there; switching target or location resets the stack. At **3 rivets** the location is **seized**: its SP **can't be repaired**, and if a **weapon** sits at that location that weapon **can't fire** for a round. Attacker runs **+1 heat** every attack while the lock is active. | `Rivet a location shut, no repairs, jams a weapon there` | 🔧 new, per-location stack counters (mirrors `suppressLock`'s stacking) + a per-location repair lock (mirrors `hullRepairLock`) + a weapon-jam flag. Fully non-spatial. `{ rivetLock: true }` |

### Pressure Claw (melee)

Stats: `{ rof: 2, str: 9, acc: [1, 1], rng: [2, 2], melee: true }`: a hydraulic crushing claw.

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Hardened Jaws | Gains **Armour Piercing**. | `Gains Armour Piercing` | ✅ built (`{ perks: ["Armour Piercing"] }`) |
| **Tuned** | Crush Grip | On a damaging hit: **−1 max SP** to the struck location (permanent grind). | `On damaging hit: −1 max SP to struck location` | ✅ built (`{ onDamage: "sunder" }`) |
| **Prototype** | Hydraulic Vice | A damaging hit **clamps the struck location's armour open**: +2 impact from **anyone** until it expires (2-round crack window). | `Pry a location's armour open (+2 impact from anyone)` | ✅ built (`{ breachGrip: true }`) |

## New engine mechanics (TDD each)

Four genuinely new effects; the rest reuse wired effects.

1. **`vsPinned`** (Taut Cable), trivial. Conditional +3 STR in `computeStr` when
   `opts.target.immobilised || opts.target.engagedWith != null`.
2. **`deadWeight`** (Dead Weight), new boolean flag `noDisengageNextActivation`.
   Set on a damaging Anchor melee hit; checked in the `disengage` action branch
   (return false / no-op); cleared at activation end alongside `noPrepNextActivation`.
   New state field defaulted in `ensureRigShape` + both rig factories.
3. **`groundAnchor`** (Ground Anchor), generalise the existing Skewer path.
   `maybeSkewer`-style marker set on a damaging melee hit while the lock holds;
   on Disengage the marked target eats one free strike from the anchorer using the
   Anchor's live effective STR (not the hardcoded 11). Either reuse `skeweredBy`
   with a strike that reads the weapon's STR, or add a parallel `anchoredBy`.
   Decide in the plan; prefer generalising `resolveSkewerStrike` to take the
   attacker's real melee STR so both prototypes share it.
4. **`rivetLock`** (Rivet Lock), per-location stack counters on the attacker
   (`rivetTarget`, `rivetLoc`, `rivetStacks`; reset on target/location switch,
   like `suppressLock`'s `suppressTarget`/`suppressStacks`). At 3 stacks: set a
   per-location repair lock on the target (generalise `hullRepairLock` to any
   location, or add `repairLock[loc]`) and a weapon-jam flag consumed by the fire
   gate for a weapon at that location. `runRecovery` ticks/clears the locks.
   +1 self-heat per attack while active. Fully non-spatial.

## Wiring checklist (from AGENTS.md, both chassis)

- `WEAPONS.longRange` += Harpoon, Rivet Gun; `WEAPONS.melee` += Anchor, Pressure Claw.
- Bump the `Object.keys(WEAPONS.longRange).length === 8` and `...melee...=== 8`
  asserts in `shared/game-state.test.js` to **10** each.
- `WEAPON_UPGRADES` += 4 entries (3 natures each; the "exactly one of each nature"
  test enforces it).
- `PREBUILT_RIGS` += the two entries above.
- `content/prebuilts.json` += both ids with `label` + `description`/`focus`/`balance`/`personality`.
- Implement the 4 new effects in `shared/combat.js` / `shared/game-state.js`; add
  status chips in `rigModifiers` (`shared/battle-view.js`) for any new tracked
  status (dead-weight pin, ground-anchor mark, rivet-seize, rivet-jam); no new
  `ACTIONS` needed (all four hook existing attack/disengage/repair/fire paths).
- Document the four new rules in `rules.md` and the glossary if the existing
  ones are listed there.
- Author `docs/design/light-harpoon-anchor.md` and
  `docs/design/light-rivet-pressureclaw.md` following the existing eight.
- Run `node --test` + `npx vitest run` + `npx tsc --noEmit`.

## Decided values (all tunable)

- Harpoon: ROF 1, STR 12, sweet 14″, max 22″. Anchor: STR 12.
- Taut Cable: +3 STR vs immobilised/engaged.
- Harpoon Winch: 4″ reel (instruction), +2 heat, root rest of activation, 3-round cooldown.
- Dead Weight: struck target blocked from Disengage for its next activation.
- Ground Anchor: free Anchor strike (Anchor's live STR) when the pinned target Disengages.
- Rivet Gun: ROF 6, STR 4, sweet 6″, max 14″. Pressure Claw: STR 9.
- Rivet Lock: 3 rivets on one location → repair-locked + weapon at that location jammed one round; +1 self-heat/attack while active.
- Crush Grip: −1 max SP struck location (sunder). Hydraulic Vice: +2 impact crack (breachGrip).
- SP, A: 12/11/11/8. B: 13/11/10/9.
