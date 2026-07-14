# Seed Preset Rosters — Design

**Date:** 2026-07-14
**Status:** Approved, ready for planning

## Problem

The V2 "Seed Test Battle" flow builds exactly one roster: 3 rigs + 3 support
units (tanks/walkers) per side, from `SEED_ROSTER` + `SEED_SUPPORT`. A tester who
wants a rigs-only board, more rigs, or a randomized loadout has no path — they
must hand-commission every unit. We want a small preset menu so a seed can launch
into one of three known compositions.

## Presets

Exactly three, chosen from the Join-screen seed panel:

| id | rigs / side | support / side | rig loadout |
|----|-------------|----------------|-------------|
| `support` (default) | 3 | 3 tanks/walkers | curated `SEED_ROSTER` (fixed chassis + prototypes) |
| `rigs4` | 4 | none | curated `SEED_ROSTER_4V4` (fixed chassis + prototypes) |
| `random4` | 4 | none | random chassis + random prototype slot, re-rolled each launch |

- `support` is exactly today's default seed — unchanged output.
- `rigs4` curated roster = the 6 existing `SEED_ROSTER` entries plus one new
  distinct chassis per side:
  - Side A adds `medium-crossbow-talon` (prototype `longRange`).
  - Side B adds `light-wreckingball-double` (prototype `melee`).
  - Keeps the all-distinct-chassis / no-mirror-matchup invariant (AGENTS.md).
- `random4` builds 4 rigs per side, each with a chassis drawn from `CHASSIS` and
  a random prototype slot (`longRange` or `melee`), using the server's seedable
  RNG (`options.random`) so tests are deterministic and real launches vary.

All three clear the seed verb's existing `≥3 rigs/side` start gate.

## Architecture — server preset keyword (Approach A)

The `seed` verb (`shared/game-state.js`) already accepts an explicit
`attrs.roster` used verbatim, else falls back to `SEED_ROSTER + SEED_SUPPORT`.
We add a `attrs.preset` selector *above* that fallback:

- `preset === "rigs4"` → roster = `SEED_ROSTER_4V4`
- `preset === "random4"` → roster = `randomSeedRoster(options.random)`
- `preset === "support"`, unknown, or omitted → today's default
  (`SEED_ROSTER + SEED_SUPPORT`)
- An explicit `attrs.roster` still wins over `preset` (back-compat; existing
  tests pass `roster` directly).

Rationale: preset rosters are game-content and belong beside `SEED_ROSTER`;
server-side is the only place `random4` can use the seedable RNG and be tested.
The wire payload stays tiny: `{ first, preset }`.

### New shared exports (`shared/game-state.js`)

- `SEED_ROSTER_4V4` — the 8-entry curated 4v4 array (same entry shape as
  `SEED_ROSTER`: `{ name, owner, chassis, prototype }`).
- `randomSeedRoster(random)` — returns an 8-entry array (4 per side) of random
  rig entries. Names follow the existing `A1..A4` / `B1..B4` convention. Uses the
  passed `random` (falls back to `Math.random` when absent, matching other
  helpers) to pick a chassis from `CHASSIS` and to pick the prototype slot.

### Roster-entry shape (unchanged)

Each rig entry stays `{ name, owner, chassis, prototype }`. The existing seed
loop resolves `chassis` via `resolveChassis` and applies the `prototype` upgrade
to the named slot — no new fields, no new branch in the per-entry loop.

## UI — one-panel seed picker

`client/src/v2/screens/Join.tsx`: the current two-step seed picker (button →
"Who acts first?") becomes a single panel shown when `seeding` is true:

1. **Preset row** — 3 toggle buttons (`Full spread` / `4v4 rigs` /
   `4v4 random`), one selected at a time; default `support`. Selected state
   mirrors the existing `is-sel` side-button pattern.
2. **Who acts first? row** — existing two buttons (`Your turn` / `Enemies turn`).
   These now *launch* rather than each being a terminal action.
3. **Launch** happens on clicking a who-acts-first button, passing the selected
   preset. Cancel returns to the collapsed state.

Local state: add `const [preset, setPreset] = useState<SeedPreset>("support")`.
`onSeed` signature grows to `onSeed(first, preset)`.

### Wiring

- `client/src/v2/screens/Join.tsx` — `Props.onSeed?: (first, preset) => void`.
- `client/src/v2/V2App.tsx` — `onSeed` gains `preset`, forwards it in the seed
  command attrs: `{ verb: "seed", attrs: { first, preset } }`.
- `client/src/v2/hooks/useSeedBattle.ts` — `(first, preset)` → `send("seed", {
  first, preset })`. (This hook is a secondary caller; keep it in sync.)

A shared `SeedPreset` type (`"support" | "rigs4" | "random4"`) defined where the
seed UI lives (Join or a small local module) and reused by `V2App`.

## Error handling

- Unknown/omitted `preset` degrades to the default roster (no throw) — matches
  how `first` already normalizes.
- No new failure modes: the start gate, field lock, and `startGameSeeded` path
  are unchanged.

## Testing

**`shared/game-state.test.js`:**
- `preset: "support"` (and omitted) → 3 rigs + 3 support per side, game started.
- `preset: "rigs4"` → 4 rigs, 0 support per side; chassis all distinct.
- `preset: "random4"` with a seeded/stub `random` → 4 rigs, 0 support per side,
  deterministic given the stub; all entries are rigs.
- Explicit `attrs.roster` still overrides `preset`.

**Client:**
- `Join.test.tsx` — selecting a preset then a who-acts-first button calls
  `onSeed(first, preset)`.
- `useSeedBattle.test.tsx` — forwards `preset` in the command attrs.

## Out of scope (YAGNI)

- Arbitrary N-per-side / support toggles — not requested.
- Randomized equipment/weapon-upgrades in `random4` (only chassis + prototype
  slot randomize; matches the "random rig prototypes" ask).
- Persisting the last-used preset.
