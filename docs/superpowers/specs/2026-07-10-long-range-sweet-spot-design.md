# Long-Range Sweet Spot & Point-Blank Falloff

**Date:** 2026-07-10
**Status:** Design approved, pending spec review

## Goal

Make melee relatively more efficient by **nerfing long-range weapons at close
distance** — no direct melee buff. Long-range weapons gain a per-weapon *sweet
spot* (peak accuracy band) with accuracy falloff on either side, and a harsh
**point-blank** penalty so a ranged unit caught up close mostly misses.

Melee weapons are unchanged in effect.

## Current model (baseline)

- Weapon profile: `{ rof, str, acc: [near, far], rng: [near, far] }`.
- Distance → band (`AttackWizard.bandFor`): `≤rng[0]` → `near`, `≤rng[1]` →
  `far`, else `out`.
- `computeModifiedAim` (combat.js) reads `acc[opts.range === "far" ? 1 : 0]`.
- `opts.range === "out"` → shot fails; there is **no** close-range penalty.
- Melee weapons: `rng: [2, 2]`, no reload, `melee: true` structural flag.

## New model

### Four range bands

Distance → band from a **three-entry** `rng: [pb, near, far]` (ascending):

| Band | Distance | Fires? |
|------|----------|--------|
| `point-blank` | ≤ `rng[0]` | yes — harsh acc penalty |
| `near` | ≤ `rng[1]` | yes |
| `far` | ≤ `rng[2]` | yes |
| `out` | > `rng[2]` | no (as today) |

`point-blank` fires (unlike `out`); it is just brutally inaccurate for
distance weapons.

### Three-entry accuracy

`acc` grows `[near, far]` → **`[pointBlank, near, far]`**, indexed by band:
`point-blank`→0, `near`→1, `far`→2. A weapon's *sweet spot* is the band holding
its max `acc`; the other entries are the falloff.

### combat.js change

`computeModifiedAim` maps band → index:

```js
const RANGE_INDEX = { "point-blank": 0, near: 1, far: 2 };
const weaponAcc = profile.acc[RANGE_INDEX[opts.range] ?? 1] || 0;
```

`opts.range === "out"` still fails early (unchanged). No other combat math
changes — STR, ROF, arc, impacts all stay.

### Melee weapons

Melee only ever fires at reach, so falloff must not touch it. Pad every melee
`acc` to three **equal** entries (= old `acc[0]`) and `rng` to `[2, 2, 2]`
(reach = `rng[0]`). Melee attacks continue to pass `range: "near"` (index 1) —
with equal entries the index is irrelevant, so behavior is identical. Example:
Flamethrower `[1, 0]` → `[1, 1, 1]` (the old unused far entry is dropped; no
live change, since melee never read index 1).

Range upgrades that map over `rng` (Extended Barrel, Couched Reach) map over all
three entries. Couched Reach `+1` turns melee `[2,2,2]` → `[3,3,3]`. Extended
Barrel `+4` shifts `pb`/`near`/`far` together — acceptable and consistent.

## Weapon tuning tables (starting values)

Bold `acc` entry = sweet spot. These are starting points; tune freely later.

### Long-range (`WEAPONS.longRange`)

| Weapon | rng `[pb,near,far]` | acc `[pb,near,far]` | identity |
|--------|--------------------|---------------------|----------|
| Mini Gun | `[4, 9, 18]` | `[-2, **2**, -1]` | short-range hoser |
| Double MG | `[4, 9, 18]` | `[-2, **1**, 0]` | near/mid |
| Autocannon | `[6, 12, 24]` | `[-3, **1**, -1]` | mid |
| Arc Gun | `[7, 15, 30]` | `[-3, 0, **1**]` | long |
| Mortar | `[8, 15, 30]` | `[-4, -1, **1**]` | indirect, dead up close |
| Sniper Cannon | `[8, 12, 24]` | `[-4, -1, **1**]` | pure far (fixes odd current profile) |
| Siege Maul | `[4, 8, 16]` | `[-2, **1**, -1]` | short heavy |
| Missile Barrage | `[8, 15, 30]` | `[-4, -1, **1**]` | long |

### Unit weapons (`UNIT_WEAPONS`, flat-pick)

| Weapon | rng | acc | identity |
|--------|-----|-----|----------|
| Tank Cannon | `[6, 12, 24]` | `[-3, 0, **1**]` | long main gun |
| Autocannon Mount | `[6, 12, 24]` | `[-3, **1**, -1]` | mid |
| Coaxial MG | `[4, 9, 18]` | `[-2, **2**, -1]` | short hoser |
| Rocket Pod | `[7, 15, 30]` | `[-3, 0, **1**]` | long |
| Dozer Blade (melee) | `[2, 2, 2]` | `[0, 0, 0]` | unchanged |
| Ram Spike (melee) | `[2, 2, 2]` | `[1, 1, 1]` | unchanged |

### Melee (`WEAPONS.melee`) — pad only, no effect change

`rng` → `[2, 2, 2]`; `acc` → three copies of old `acc[0]`:
Sword `[0,0,0]`, Circular Saw `[0,0,0]`, Chainsaw `[0,0,0]`, Claw `[1,1,1]`,
Lance `[1,1,1]`, Wrecking Ball `[0,0,0]`, Bulwark Shield `[0,0,0]`,
Flamethrower `[1,1,1]`.

## AttackWizard UI

### 4-band derivation

```js
const [rngPb, rngNear, rngFar] = profile.rng;   // ranged
const bandFor = (inches) =>
  inches <= rngPb   ? "point-blank" :
  inches <= rngNear ? "near" :
  inches <= rngFar  ? "far" : "out";
```

Ranged effective-range readout shows all three: `PB ≤{pb}" · Near ≤{near}" ·
Far ≤{far}" · beyond {far}" out`. Melee readout unchanged (`Reach rng[0]"`).
`weaponDesc` for ranged shows `RNG {near}–{far}"` (i.e. `rng[1]`–`rng[2]`).

### Slider starts at sweet spot

On open, initialize `inches` (and `range`) to the weapon's sweet-spot band:

- sweet index = `argmax(acc)` (ties → prefer the farther band).
- representative distance = midpoint of that band, e.g. sweet=`far` →
  `round((rngNear + rngFar) / 2)`; sweet=`near` → `round((rngPb + rngNear)/2)`;
  sweet=`point-blank` → `round(rngPb / 2)`.

Recompute when the selected weapon changes (switching longRange ⇄ melee resets
to that weapon's sweet spot; melee → its reach).

### Dropoff / efficiency readout

Beside the band label, show accuracy relative to the sweet spot:

- At the sweet-spot band: badge **"sweet spot"**.
- Otherwise: show the delta, e.g. **"−3 acc"** (current `acc[band]` minus
  sweet `acc`), with band name — e.g. `point-blank · −6 acc`.
- `out`: existing "out of range — this shot will fail" warning.

Colour cue via `data-band`: reuse slider `data-band` styling, add a
`point-blank` variant (harsh/ember tone) in `battle.css`.

## Touched files

- `shared/game-state.js` — WEAPONS + UNIT_WEAPONS `rng`/`acc` data (3 entries).
- `shared/combat.js` — `computeModifiedAim` band→index map; `RANGE_INDEX`.
- `client/src/components/wizards/AttackWizard.tsx` — 4-band `bandFor`, sweet-spot
  init, dropoff readout, ranged 3-band display.
- `client/src/styles/battle.css` — `data-band="point-blank"` styling.
- `shared/glossary.js` — RNG def text (near/far → pb/near/far, mention falloff).
- Tests: `shared/combat.test.js`, `shared/game-state.test.js`,
  `client/src/components/wizards/AttackWizard.test.tsx`.

## Testing

- **combat.test.js**: `point-blank` band selects `acc[0]` and applies its
  (negative) modifier; `far` selects `acc[2]`; `out` still fails; melee acc
  unchanged across bands.
- **game-state.test.js**: every WEAPONS/UNIT_WEAPONS entry has `rng.length===3`
  and `acc.length===3`, ascending `rng`; range upgrades map all three entries;
  melee weapons keep uniform acc.
- **AttackWizard.test.tsx**: slider initializes at sweet-spot distance per
  weapon; dragging to point-blank shows the negative delta badge; band label
  matches `bandFor` thresholds.

## Out of scope

- Any melee stat buff (STR/ROF/acc/reach/action cost).
- Changing STR, impact, arc, heat, or reload math.
- New range upgrades.
