# Rig Terminal — Loadout View

## Problem

Opening a rig's control terminal shows structure points, heat, and the action
console, but nothing about the rig's armament. The subheader prints weapon
*names* only (`light · Autocannon · Claw`) and stops. A player mid-battle cannot
check which weapon upgrades or equipment a rig carries, nor recall a weapon's
stats — the data was chosen at commission time in the Forge and then goes
invisible.

The data already exists in shared code: `buildLoadout()` resolves upgrade
name/tag and equipment passive/active, and `effectiveWeaponProfile(slot, name,
rig)` in `shared/game-state.js` computes upgrade-applied weapon stats. Nothing
renders it.

## Goal

Add a **Loadout** view to the rig terminal showing, per weapon: base stats with
any upgrade bonus marked, the chosen upgrade (name/nature/description), and the
rig's equipment (passive + active). Visible for both own and enemy rigs.

## Decisions

- **Placement:** a `Status` ⇄ `Loadout` toggle at the top of the terminal body,
  default `Status`. Loadout is a separate view, not always-on — the terminal
  stays action-first.
- **Stat basis:** show **base** numbers; where the chosen upgrade modifies a
  stat, render the bonus as a green `+N` mark beside it. The upgrade
  name/nature/tag line below carries provenance and any non-numeric effect.
- **Enemy rigs:** symmetric — enemy (B-side) terminals show loadout too. No fog
  of war.
- **Scope:** full card (weapon stats + upgrades + equipment). Flat-pick kinds
  (tank/walker) carry one weapon, no upgrade, no equipment.

## Design

### 1. View-model — `client/src/lib/loadout.ts`

Enrich the loadout so each weapon carries display-ready stats and deltas. Source
base numbers from the weapon tables (`WEAPONS`, `UNIT_WEAPONS`) and deltas from
the chosen upgrade's `effect`; reuse `effectiveWeaponProfile` for the merged
perk list and the resolved upgrade object.

New per-weapon shape:

```ts
interface LoadoutWeapon {
  slot: "longRange" | "melee" | "unit";
  name: string;
  glyph: string;                 // weaponGlyph(name)
  melee: boolean;
  rof:   { base: number; delta: number };   // delta 0 when unaffected
  str:   { base: number; delta: number };
  range: { text: string; delta: number };   // ranged: `0–26"`; melee: `RNG 2"`
  perks: string[];               // base perks
  addedPerks: string[];          // perks added by the upgrade (rendered green)
  upgrade: { name: string; nature: string; tag: string } | null;  // null = flat-pick
}
```

Deltas:
- `rof.delta = effect.rof ?? 0`, `str.delta = effect.str ?? 0`.
- `range.delta = effect.range ?? 0`. Ranged range text uses base
  `minRange–maxRange"`; melee uses `RNG rng[n]"`. The delta drives the green
  mark on the range term.
- `addedPerks = effectiveProfile.perks minus base.perks`.

Equipment entry is unchanged from today (`family`, `label`, `passive`,
`activeLabel`, `activeHeat`, `activeText`). Flat-pick / non-rig kinds →
`equipment: null`.

Keep `Loadout.flat`, `unit`, `lr`, `melee`, `equipment` structure so existing
callers (the terminal subheader `loadoutText`) keep working.

### 2. Card component — `client/src/v2/components/LoadoutView.tsx`

New presentational component. Props: the enriched `Loadout` (and whatever it
needs for kind/cold). Renders:

- One block per weapon: `{glyph} {name}` heading, then a stat row of terms
  `ROF {base}`, `STR {base}`, `{range.text}` — each base number followed by a
  green `+{delta}` mark when its delta is non-zero. Base + added perks listed
  (added perks green). Below: `⬡ {upgrade.name} · {upgrade.nature}` with
  `{upgrade.tag}` muted beneath. No upgrade line when `upgrade` is null.
- Equipment block (rigs only): `🛠 {label} · {family}`, `Passive — {passive}`,
  `Active — {activeLabel} ({+/-heat} heat): {activeText}`.

Pure render off the view-model; no commands, no state.

### 3. Terminal integration — `client/src/v2/overlays/RigTerminal.tsx`

- Header (glyph, name, subheader, status chip) and the mods row stay pinned
  above the toggle — identity and overall status remain glanceable in both
  views.
- Add `useState<"status" | "loadout">("status")`. A segmented toggle sits below
  the mods.
- Body switches on the toggle:
  - `status` → existing stack: comp rows + heat gauge + `ActionConsole` +
    activation control (unchanged).
  - `loadout` → `<LoadoutView>` built from `buildLoadout(rig)`.
- Active-rig terminals still open on `status`, so the action console is front by
  default. Toggling to Loadout intentionally hides SP/heat/actions (status chip
  in the header remains).

### 4. Styling — `client/src/v2/styles/rig-terminal.css`

Add classes for the toggle and the card, matching the terminal's stamped-iron
aesthetic and V2 tokens. Green delta mark (`.v2-rt-delta` or similar) uses a
success/positive token. No new image assets.

### 5. Tests

`client/src/v2/overlays/RigTerminal.test.tsx`:
- Default view is Status (comp rows present); clicking `Loadout` switches.
- Loadout view shows weapon base stats, a green `+N` delta on an upgraded stat,
  the upgrade name, and equipment passive + active text.
- Flat-pick kind (tank/walker) shows a single weapon block, no upgrade line, no
  equipment block.
- Enemy (B-side) rig still renders the loadout.
- Toggling back to Status restores the action console / comp rows.

View-model test (co-located with loadout, e.g. `client/src/lib/loadout.test.ts`
or the existing seed test file):
- Enriched `buildLoadout` reports correct base/delta for an upgraded weapon and
  zero deltas for a weapon whose upgrade has no numeric effect.

## Display note

When an upgrade's entire effect is the numeric delta (e.g. *Depleted Core: +2
STR*), the green `+2` and the tag line are mildly redundant. The tag line is
kept regardless — it is the authored description and is the only carrier for
non-numeric upgrades (e.g. *Extended Belt: dice showing 1 add heat*).

## Out of scope

- Editing loadout from the terminal (loadout is fixed at commission).
- Any change to the Forge / commission wizard.
- Fog-of-war hiding of enemy loadout.
