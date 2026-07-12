# Design — new medium chassis: Crossbow · Talon ("Shrike")

**Date:** 2026-07-12
**Status:** approved, ready for implementation plan

Add one prebuilt **medium** chassis to `CHASSIS`, with two new globally-unique weapons
(1 long-range, 1 melee) and three Field/Tuned/Prototype upgrades apiece (6 upgrades total).
Follows the "Adding a new chassis" procedure in [AGENTS.md](../../AGENTS.md).

Flavor name **Shrike** (the butcher bird — impales prey on a thorn, then tears it). The
code `label` is `Crossbow · Talon`; "Shrike" lives in `content/chassis.json`
(`description`/`personality`), not the label.

## Chassis — `medium-crossbow-talon` — Pin & dismantle

**Weapons:** Crossbow (long-range) · Talon (melee) · **Class:** medium
**Focus:** a **raptor hunter** — crack one enemy *location* at range with a surgical bolt,
lock in with the talon, and gut that same location. The kit is a **lockdown / location-
assassination** loop, not an attrition brawler. The talon is deliberately weak on fresh
armour, so the Rig must play the hunt: soften a location first, then finish it.

**SP:** `{ hull: 12, arms: 11, legs: 12, engine: 9 }` — a mobile, medium-fragile hunter
(legs-forward; roughly the sniper-chainsaw durability tier).

### Differentiation from `medium-sniper-chainsaw` (IMPORTANT)

The existing medium sniper-chainsaw is *also* a "precise long-range + wounded finisher"
kit, so this chassis must not read as a reskin. The split is deliberate:

| | Sniper · Chainsaw | Crossbow · Talon |
|---|---|---|
| Long-range identity | Alpha-strike **burst**; Cold Bore rewards **target freshness** | **Range-discipline** marksman (highest Peak on the board, steep falloff); rewards holding the band + **pins** the target |
| Melee identity | Multi-hit **flurry** (ROF 3, Rend); Bloodletter keys off *any* missing SP | **Single-location surgery**; Exploit Wound / Evisceration key off the *specific struck location's* SP |
| Loop | Snipe fresh → saw wounded (burst then shred) | Pin a location → guarantee the melee follow-up → force-Critical that one location |

The crossbow's **Pinning Bolt** (guaranteed immobilise) is the mechanical wedge the sniper
has no answer to — it *locks the prey down* so the melee half always lands. The talon works
**per location**, where the chainsaw works per *rig*. No mirror overlap.

### Crossbow (long-range)

Stats: `{ rof: 1, str: 10, sweet: 18, peak: 3, dropoff: 0.25, minRange: 0, maxRange: 24 }`
— a single-bolt marksman weapon: the **sharpest Peak ACC in the table (+3)** but a **steep
falloff (−0.25/in)** and a shorter reach than the Sniper (24″ vs 28″) at lower STR (10 vs 12).
It is lethal *only* in a narrow band around the sweet spot; sloppy in your face and at range.

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Fletched Bolts | Gains **Precision** — Aimed Shots ignore the −2 aim penalty. Always pick your location; the core marksman pick. | `Aimed shots ignore the aim penalty` | ✅ built (Precision perk; `{ perks: ["Precision"] }`) |
| **Tuned** | Steady Aim | **+3 STR** when the measured firing distance is **within 2″ of the sweet spot** (16–20″). Rewards range discipline; nothing when you're off the band. | `+3 STR when firing from the sweet spot (±2″)` | 🔧 new — thread the measured `distance` into `computeStr`; new `steadyAim` branch reading `profile.sweet`. `{ steadyAim: true }` |
| **Prototype** | Pinning Bolt | A **damaging** bolt **immobilises** the target until this Rig's next activation (it may still pivot) — **guaranteed, no D12 roll** (stronger than the Impale perk, which is why it's a Prototype). Sets up the talon rush. **Downside:** **+2 self-heat** per pinning shot; only one target may be pinned at a time (a new pin releases the old). | `Pin a rig in place until your next turn — runs +2 heat` | 🔧 new — reuse the Impale immobilise path (`target.immobilised = true`), fired unconditionally on a damaging hit; add +2 self-heat and a single-target `pinnedBy` guard. Non-spatial. `{ pinningBolt: true }` |

### Talon (melee)

Stats: `{ rof: 2, str: 7, acc: [1, 1], rng: [2, 2], melee: true }` — two raking strikes.
**Lower STR than the Claw (7 vs 8)** — it pays for the finisher payoff and is weak on fresh
armour by design.

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Honed Talons | **+2 STR** (7 → 9), always on. The safe default that keeps the talon functional solo. | `+2 STR` | ✅ trivial (`{ str: 2 }`) |
| **Tuned** | Exploit Wound | **+3 STR** vs a **struck location already below max SP** (any prior damage there). The signature finisher — the crossbow cracks the location, the talon tears it open. | `+3 STR vs an already-damaged location` | 🔧 new — thread the struck `loc` into `computeStr`; new `vsWoundedLoc` branch comparing `target.sp[loc] < target.spMax[loc]`. `{ vsWoundedLoc: true }` |
| **Prototype** | Evisceration | A hit on a location **at or below half its max SP** is forced to **Critical (−3 SP)** — every hit, regardless of the impact roll. **Downside:** **−1 STR** against a **fully-undamaged** struck location (the talon needs a wound to grip). Forces the hunt loop; punishing solo. | `Gut a half-dead location — every hit is Critical (but weak on fresh armour)` | 🔧 new — in `rollImpacts`, if `target.sp[loc] <= target.spMax[loc] / 2` override the tier to critical (mirrors the `opts.penetrate` forced-severe path); the −1 STR downside is a `computeStr` branch on the same threaded `loc`. `{ eviscerate: true }` |

## New engine mechanics (TDD each)

Three genuinely new effects; two share one small plumbing change.

1. **Plumbing — thread `distance` and struck `loc` into `computeStr` / `rollImpacts`.**
   Today neither is available at STR-compute time (distance is used only for ACC in
   `weaponAccAt`/`computeModifiedAim`; the struck location is rolled in `rollImpacts` but not
   passed down to `computeStr`). Since the defender rolls **one** hit location per attack
   (§7), the struck `loc` is fixed for the whole attack and can be resolved before impacts.
   Pass both into `computeStr(attacker, profile, opts)` via `opts` so the three branches below
   can read them. Reference points from the combat map:
   - `shared/combat.js:134` — `computeStr(attacker, profile, opts)` signature (add `distance`, `loc`).
   - `shared/combat.js:29–40` — `weaponAccAt` / `computeModifiedAim` already have the distance.
   - `shared/combat.js:349` — `rollImpacts` call site (thread the values in).

2. **`steadyAim`** (Steady Aim, Crossbow Tuned) — in `computeStr`, `+3` when
   `Math.abs(distance - profile.sweet) <= 2`. Trivial once distance is threaded. Mirrors the
   shape of the existing `coldBore` / `vsPinned` conditional branches (`shared/combat.js:143–164`).

3. **`vsWoundedLoc`** (Exploit Wound, Talon Tuned) — in `computeStr`, `+3` when
   `target.sp[loc] < target.spMax[loc]`. Needs the threaded `loc`. Same branch shape.

4. **`eviscerate`** (Evisceration, Talon Prototype) — two parts:
   - **Forced Critical:** in `rollImpacts`, if the upgrade is active and
     `target.sp[loc] <= target.spMax[loc] / 2`, force the severity to `{ sp: 3, tier: "critical" }`
     regardless of the impact roll. Mirrors the `opts.penetrate` forced-severe override at
     `shared/combat.js:264` and the `impactSeverity` return shape at `shared/rules.js:83–89`.
   - **Downside `−1` STR:** in `computeStr`, `−1` when `target.sp[loc] === target.spMax[loc]`
     (struck location fully undamaged). Same threaded `loc`.

5. **`pinningBolt`** (Pinning Bolt, Crossbow Prototype) — on a **damaging** Crossbow hit set
   `target.immobilised = true` (reuse the Impale immobilise flag/path near
   `shared/combat.js:490`), add **+2 self-heat** to the attacker, and record a single-target
   `pinnedBy` so a new pin releases any prior one. Clears on the pinner's next activation like
   the existing Impale immobilise. Fully non-spatial — no new action, hooks the attack path.

No new `ACTIONS` are needed — all five effects hook the existing attack / STR / impact paths.

## Wiring checklist (from AGENTS.md)

- `WEAPONS.longRange` += **Crossbow**; `WEAPONS.melee` += **Talon** (`shared/game-state.js`).
- Bump the `Object.keys(WEAPONS.longRange).length` and `...melee...` asserts in
  `shared/game-state.test.js` by **1** each (read the current numbers in the test).
- `WEAPON_UPGRADES` += 6 entries (3 natures for Crossbow, 3 for Talon); the "exactly one of
  each nature" test at `shared/game-state.test.js:190–196` enforces the shape.
- `CHASSIS` += `{ id: "medium-crossbow-talon", label: "Crossbow · Talon", class: "medium",
  longRange: "Crossbow", melee: "Talon", sp: { hull: 12, arms: 11, legs: 12, engine: 9 } }`.
- `content/chassis.json` += the id with `label` + `description`/`focus`/`balance`/`personality`
  (the **Shrike** flavor lives here).
- Implement the effects in `shared/combat.js` (§ New engine mechanics); add a `rigModifiers`
  status chip in `shared/battle-view.js` for the **Pinning Bolt** pin (immobilised-by-pin) if
  the existing Impale/immobilise chip doesn't already cover it.
- Document the new rules in `rules.md` §12 (weapon tables: Crossbow in Long Range, Talon in
  Melee; add both to the §12 upgrade table) and §13/glossary if the mechanics warrant a line
  (Steady Aim, Pinning Bolt, Exploit Wound, Evisceration). Keep `rules.md` in sync with any
  `rules.js` change (AGENTS.md git-workflow note).
- Author `docs/design/medium-crossbow-talon.md` following the existing eight.
- Run `node --test` + `npx vitest run` + `npx tsc --noEmit`.

## Equipment note

Prebuilt chassis **do not** ship with equipment — `CHASSIS` entries carry only
`{ id, label, class, longRange, melee, sp }`; equipment is a separate per-Rig pick at
commission (`makeRig(..., equipment)`). So this chassis ships equipment-less. The recommended
pilot loadout — call it out in the design doc, **not** the registry — is **Servo Actuators**
(Mobility): Jump Jets to pounce the gap after the bolt pins, ignoring terrain/leg-damage.

## Recommended showcase build (design-doc prose only, not enforced)

- **Crossbow** → **Steady Aim** (Tuned) — control your range, +3 STR in the band.
- **Talon** → **Evisceration** (Prototype) — the Rig's one Prototype (legal, §3 max one).
- **Equipment** → **Servo Actuators** — Jump Jets pounce.

Hunt loop: hold the 18″ band → aimed Crossbow bolt cracks a chosen location → Jump Jets in,
engage → Talon guts the cracked location (≤ half SP → Evisceration forces Critical).

Alt build: **Crossbow → Pinning Bolt** (Prototype) + **Talon → Exploit Wound** (Tuned) — pin
at range, walk in, tear the wound. Also legal (one Prototype). Can't run both Prototypes.

## Decided values (all tunable)

- Crossbow: ROF 1, STR 10, sweet 18″, peak +3, dropoff 0.25, range 0–24″.
- Talon: ROF 2, STR 7, ACC +1, reach 2″.
- Steady Aim: +3 STR within 2″ of the sweet spot (16–20″).
- Pinning Bolt: guaranteed immobilise until next activation on a damaging hit; +2 self-heat;
  one pin at a time.
- Honed Talons: +2 STR. Exploit Wound: +3 STR vs a struck location below max SP.
- Evisceration: struck location ≤ half max SP → forced Critical (−3 SP) per hit; −1 STR vs a
  fully-undamaged struck location.
- SP: 12 / 11 / 12 / 9.
