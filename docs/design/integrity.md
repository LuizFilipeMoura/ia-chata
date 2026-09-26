# Integrity (whole-rig pool)

## Problem

Hit locations are rolled, so damage spreads across Hull / Arms / Legs / Engine.
Before Integrity a Rig only died when a Hull or Engine took a point past 0, or
when every location hit 0. Damage sprayed into Arms and Legs mostly never added
up to a kill, and players felt no progress from a good attack.

## Rule (rules.md §8a)

- One pool per rig, `rig.integrity` / `rig.integrityMax`.
- Every SP a location loses drains 1 Integrity (wounds, overflow, cook-off,
  burning, blasts, overheat). A point past 0 on Hull or Engine drains **2**
  (replaces the old instant kill).
- Integrity 0 → destroyed (normal §9 blast + §11 kill VP).
- Repair / Field Weld / Nanites never restore it. Emergency Patch restores 1.
- Kneecapper floors it at 1 (cripples, never kills).
- Tiers: **Bloodied** ≤ half, **Critical** ≤ ceil(max / 4). `integrityTier(rig)`
  in `shared/game-state.js` is the single source for every client.

Locations keep their job: they decide **what breaks** (weapon loss, immobilised,
action loss). Integrity decides **when it dies**.

## Values

`INTEGRITY_RATIO`: light 0.5, medium 0.65 (tank 0.65, walker 0.5). Lights pay
for their speed with a thinner pool. Chassis carry an explicit `integrity` so it
is a separate balance knob from SP:

| Chassis | Class | Total SP | Integrity |
|---|---|---|---|
| Zebra | light | 38 | 19 |
| Blue | light | 40 | 20 |
| Pumpkin | light | 41 | 21 |
| Turquoise | light | 42 | 21 |
| Green | light | 43 | 22 |
| Gold | light | 44 | 22 |
| Purple | light | 44 | 22 |
| Red | medium | 43 | 28 |
| Silver | medium | 44 | 29 |
| Copper | medium | 48 | 31 |
| Black | medium | 52 | 34 |

Extra max SP (Ablative Plating, campaign mods, Commander multiplier) scales the
authored value by `liveTotalMax / chassisTotal`. Campaign carried damage starts
the pool short by every missing SP (min 1).

## Engine status

Built: pool, drain, 2× past-0 core, death, repair rules, Kneecapper floor,
Emergency Patch +1, `set <rig> integrity N` correction, tier log lines (ride on
the causing resolution, else a standalone `integrity` resolution), Bloodied /
Critical chip, bot fragility reads the pool.

## Ideas parked

- Tuned triggers keyed off tiers (Cold Bore → pool full, Bloodletter → pool
  below max, Evisceration → Bloodied).
- "Frame damage" Prototype that hits the pool directly.
- Per-rig tuning: tough-limbs/low-pool snipers vs fragile-limbs/high-pool brawlers.
