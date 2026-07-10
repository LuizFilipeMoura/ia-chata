# Long-Range Sweet Spot & Accuracy Falloff

**Date:** 2026-07-10
**Status:** Design approved, pending spec review

## Goal

Make melee relatively more efficient by giving each **ranged** weapon a
per-weapon *sweet-spot distance* where accuracy peaks, with accuracy falling off
the farther the target sits from that distance. Long-range weapons become bad up
close; short-range weapons become bad at range. No direct melee buff — melee
wins by comparison.

Melee weapons are unchanged.

## Model

Accuracy is a continuous function of the **measured distance** (inches), not a
discrete band:

```
penalty   = round(dropoff × |distance − sweet|)
weaponAcc = peak − penalty          // feeds modified Aim exactly as today
out of range  ⇔  distance < minRange  OR  distance > maxRange
```

Per-weapon parameters (ranged only):

| Field | Meaning |
|-------|---------|
| `sweet` | peak-accuracy distance, inches |
| `peak` | accuracy modifier at the sweet spot |
| `dropoff` | accuracy lost per inch of distance from `sweet` (small = wide/forgiving, large = narrow) |
| `minRange` | below this → out (indirect dead zone; default 0) |
| `maxRange` | above this → out |

Falloff is symmetric (one `dropoff` both directions). Examples this produces:

- **Shotgun-like** — `sweet` at point-blank + high `dropoff`: deadly close, junk
  after a few inches.
- **Mortar-like** — `sweet` mid + low `dropoff` + `minRange`: dead up close,
  good across the whole middle, still usable far.
- **Sniper-like** — `sweet` far + low `dropoff`: bad up close, best at long range.

### Replaces the old band model

This removes the discrete `acc: [near, far]` / `rng: [near, far]` band pair for
**ranged** weapons — replaced by `{ sweet, peak, dropoff, minRange, maxRange }`.
The `"near"/"far"/"out"` string band is no longer how accuracy is chosen; combat
now needs the measured **distance** passed through (today only a band label is).

Melee weapons keep their existing shape (`acc`, `rng: [2,2]`, `melee: true`) and
are read exactly as today.

## combat.js

`computeModifiedAim` gains a distance-based branch:

```js
export function weaponAccAt(profile, distance) {
  if (profile.melee) return profile.acc?.[0] || 0;      // melee: scalar, unchanged
  const d = Number(distance);
  const penalty = Math.round(profile.dropoff * Math.abs(d - profile.sweet));
  return profile.peak - penalty;
}
```

`computeModifiedAim(attacker, profile, opts)` uses
`weaponAccAt(profile, opts.distance)` in place of the old
`profile.acc[opts.range === "far" ? 1 : 0]`. Everything else in the Aim math
(base Aim, cover, aimed, hull penalty) is unchanged.

Out-of-range check moves to distance:

```js
// in performAttack, replacing `if (opts.range === "out")`
if (!profile.melee) {
  const d = Number(opts.distance);
  if (!Number.isFinite(d) || d < profile.minRange || d > profile.maxRange)
    return { ok: false, reason: "range" };
}
```

`opts.distance` (inches) is threaded from the UI through the same path that
carries `arc`/`cover`/`range` today (`game-state.js` attack plumbing at the two
`arc: a.attack.arc, ...` sites). The legacy `opts.range` string may stay for
melee/back-compat but no longer drives ranged accuracy.

No changes to STR, ROF, arc bonus, impacts, heat, or reload.

## Weapon tuning tables (starting values)

Tune freely later. `minRange` 0 unless noted.

### Long-range (`WEAPONS.longRange`)

| Weapon | sweet | peak | dropoff | min | max | feel |
|--------|------:|----:|-------:|---:|---:|------|
| Mini Gun | 7 | 2 | 0.35 | 0 | 18 | deadly close, fades |
| Double MG | 9 | 1 | 0.25 | 0 | 20 | near/mid |
| Siege Maul | 8 | 1 | 0.30 | 0 | 16 | short heavy |
| Autocannon | 12 | 1 | 0.22 | 0 | 26 | mid workhorse |
| Arc Gun | 20 | 1 | 0.18 | 0 | 32 | long |
| Sniper Cannon | 22 | 2 | 0.15 | 0 | 28 | low dropoff, sweet far |
| Mortar | 18 | 1 | 0.15 | 6 | 34 | dead close, good mid–far |
| Missile Barrage | 20 | 1 | 0.15 | 6 | 34 | dead close, long |

### Unit weapons (`UNIT_WEAPONS`, flat-pick)

| Weapon | sweet | peak | dropoff | min | max |
|--------|------:|----:|-------:|---:|---:|
| Tank Cannon | 18 | 2 | 0.16 | 0 | 28 |
| Autocannon Mount | 12 | 1 | 0.22 | 0 | 26 |
| Coaxial MG | 8 | 2 | 0.35 | 0 | 18 |
| Rocket Pod | 20 | 1 | 0.16 | 4 | 34 |
| Dozer Blade (melee) | — | — | — | — | — | reach 2, unchanged |
| Ram Spike (melee) | — | — | — | — | — | reach 2, unchanged |

Sanity: Sniper at 2" → `2 − round(0.15·20) = −1`; at 22" → `+2`. Mortar under 6"
→ out; at 18" → `+1`; at 34" → `−1`. Mini Gun at 2" → `2 − round(0.35·5) = 0`;
at 18" → `−2`.

### Melee (`WEAPONS.melee`) — unchanged

`Sword … Flamethrower` keep `acc`, `rng: [2,2]`, `melee: true` exactly as they
are today. No falloff, no new fields.

## Weapon upgrades (`WEAPON_UPGRADES`) reconciliation

Existing effects that touched the old band fields get remapped:

- **Extended Barrel** (was "+4 to both range bands") → `maxRange += 4`,
  `sweet += 2` (pushes reach and ideal window outward). Tag reworded.
- **Match Barrel** (was "no far-range penalty") → `dropoff × 0.5` (tighter,
  more forgiving falloff). Tag reworded.
- **Couched Reach** (melee `+1` reach) → melee `rng += 1`, unchanged.
- STR/ROF/heat upgrades (Depleted Core, Extended Belt, Haymaker, etc.) — no
  change; they never touched acc/range.

`normalizeWeaponProfile` in game-state.js copies the new fields
(`sweet/peak/dropoff/minRange/maxRange`) and applies these effects.

## AttackWizard UI

### Distance drives everything

The slider (`state.inches`, 0…`maxRange`+headroom) is the single source of truth.
Remove `bandFor`/`acc[]` band derivation. On each inch value compute
`weaponAccAt(profile, inches)` and whether it's in range (`minRange…maxRange`).

### Slider opens at the sweet spot

Initialize `inches` to the weapon's `sweet` on open, and re-seed to `sweet`
whenever the selected weapon changes (longRange ⇄ melee → melee seeds to reach).

### Dropoff / efficiency readout

Beside the slider show the live accuracy at the selected distance:

- penalty 0 → badge **"Sweet spot +{peak}"**.
- in range, penalty > 0 → **"{acc:+d} · falloff"** (e.g. `−3 · falloff`).
- `< minRange` → **"Too close — out of range"**; `> maxRange` → existing
  out-of-range warning. Go button disabled in both.

A small efficiency bar (acc relative to `peak`) reinforces the falloff visually.
Colour via slider `data-band`, now derived from the acc tier
(`sweet` / `good` / `poor` / `out`) rather than distance bands; add the new
variants in `battle.css`.

Ranged weapon summary (`weaponDesc`) shows `Sweet {sweet}" · {min}–{max}"`
instead of `RNG near–far`. Melee summary (`Reach 2"`) unchanged.

## Touched files

- `shared/game-state.js` — WEAPONS + UNIT_WEAPONS ranged entries reshaped to
  `{ rof, str, sweet, peak, dropoff, minRange, maxRange }`; melee entries
  unchanged; upgrade-effect remap in `normalizeWeaponProfile`; upgrade tags.
- `shared/combat.js` — `weaponAccAt`, `computeModifiedAim` distance branch,
  distance-based out-of-range check; thread `opts.distance`.
- `client/src/components/wizards/AttackWizard.tsx` — distance-driven acc,
  sweet-spot init, efficiency readout, ranged summary text.
- `client/src/styles/battle.css` — acc-tier `data-band` variants.
- `client/shared.d.ts` — ranged weapon type gains the new fields.
- `shared/glossary.js` — RNG def rewritten (sweet spot + falloff).
- Tests: `shared/combat.test.js`, `shared/game-state.test.js`,
  `client/src/components/wizards/AttackWizard.test.tsx`.

## Testing

- **combat.test.js**: `weaponAccAt` returns `peak` at `sweet`, drops by
  `round(dropoff·Δ)` away from it, symmetric; distance `<minRange` or
  `>maxRange` fails the attack; melee accuracy is distance-independent.
- **game-state.test.js**: every ranged WEAPONS/UNIT_WEAPONS entry has
  `sweet/peak/dropoff/minRange/maxRange` with `minRange ≤ sweet ≤ maxRange`;
  melee entries keep the old shape; Extended Barrel raises `maxRange`, Match
  Barrel lowers `dropoff`.
- **AttackWizard.test.tsx**: slider initializes at `sweet`; readout shows
  "Sweet spot" at `sweet` and a negative delta off it; go button disables below
  `minRange` and above `maxRange`.

## Out of scope

- Any melee stat buff (STR/ROF/acc/reach/action cost).
- Changing STR, impact, arc, heat, or reload math.
- Asymmetric falloff, new range upgrades, per-weapon custom curves.
