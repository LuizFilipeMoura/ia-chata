# V2 Frontend — Phase B Design (Commission Wizard / Forge)

**Date:** 2026-07-11
**Status:** Approved (pre-approved by user for all 4 phases)
**Depends on:** Phase A (shell, squadron, `.v2-root` isolation, viewModels). Same architecture.

## Goal

Replace Phase A's **interim** delegation to the V1 commission wizard with a native V2
"Forge" wizard, styled per the mockup, wired to the same `add` command and the same
shared data. Full parity with V1 `UnitWizard`: Rig / Tank / Walker kinds, chassis picker,
per-weapon upgrade paths with the one-Prototype-per-rig rule, equipment, and confirm.

## Architecture

- New overlay `client/src/v2/overlays/CommissionWizard.tsx`, opened from the Yard's
  "Commission New Rig" button (and the now-enabled **Forge** channel button). It is a
  modal sheet inside `.v2-root` — same overlay pattern as `RigTerminal`. (The mockup draws
  Forge as a full channel screen; we render it as a modal sheet to match V1's portal model
  and Phase A's overlay infrastructure. Visuals still follow mockup lines 224–308.)
- V2Terminal owns `commissionOpen` state (replaces the interim `useWizard().openCommission()`).
  Squadron gets an `onCommission` prop. The Shell's channel nav enables **Forge**, which
  toggles the same overlay.
- Reuses 100% of shared data + the `add` command — no game logic. Same fields V1 sends
  (verified from `client/src/components/wizards/UnitWizard.tsx`):
  - Rig: `add { name, kind:"rig", chassis, class, owner, lr, melee, longRangeUpgrade, meleeUpgrade, equipment }`
  - Tank/Walker: `add { name, kind, owner, unit }`
- Shared imports (from `/shared/game-state.js`): `WEAPONS, EQUIPMENT, canAddRigForSide,
  WEAPON_UPGRADES, RIG_DEFAULTS, HEAT_CAPACITY, UNIT_WEAPONS, CHASSIS, upgradeNature`.
  `UNIT_KINDS` from `/shared/unit-kinds.js`. Chassis codenames + weapon glyphs + nature
  labels are display maps ported from V1's wizard.
- Chassis flavor text is fetched from `/api/chassis` (optional; falls back to built-ins) —
  ported from V1.

## Components / files

```
client/src/v2/
  overlays/CommissionWizard.tsx     the wizard (kind → chassis/upgrade bay → equipment → confirm; tank/walker: kind → weapon → confirm)
  lib/commissionData.ts             ported display maps (CHASSIS_NAME, WEAPON_GLYPH, NATURE_LABEL) + firstUpgradeId helper
  styles/forge.css                  scoped Forge styling (step rail, kind cards, chassis grid, upgrade bay, equipment grid, confirm)
  V2Terminal.tsx                    MODIFY — own commissionOpen; render wizard
  screens/Squadron.tsx              MODIFY — add-card calls onCommission (not V1 openCommission)
  components/Shell.tsx              MODIFY — enable Forge channel, accept onForge handler
```

## Behavior / data flow

Wizard local state mirrors V1 `WizardState`: `{ step, kind, cls, owner, chassis, longRange,
melee, longRangeUpgrade, meleeUpgrade, equipment, unit }`. Initialized from `CHASSIS[0]`.

- **Step 0 (Kind):** three cards RIG/TANK/WALKER; selecting sets `kind` and resets step.
  Steps: rig → `[Kind, Chassis, Equipment, Confirm]`; tank/walker → `[Kind, Weapon, Confirm]`.
- **Step 1 rig (Chassis):** grid of 8 `CHASSIS` cards (emblem, codename, weapon combo, stats
  from `RIG_DEFAULTS`/`HEAT_CAPACITY`). Selecting a chassis locks weight class + both weapons
  and resets each weapon to its first upgrade (`firstUpgradeId`, always Field nature). The
  selected card unfolds an **upgrade bay**: each weapon shows its 3-node path (Field/Tuned/
  Prototype, ranks I/II/III) via `WEAPON_UPGRADES[name]`. A Prototype node on one weapon is
  **locked** when the other weapon already has a Prototype selected (`upgradeNature(...)==="prototype"`).
- **Step 1 tank/walker (Weapon):** grid of `UNIT_WEAPONS`; select sets `unit`.
- **Step 2 rig (Equipment):** grid of `EQUIPMENT`; select sets `equipment`.
- **Step 2 tank/walker (Confirm):** name + weapon summary.
- **Step 3 rig (Confirm):** name + weapons/upgrades + equipment + optional personality flavor.
- **Nav:** Back / Next; final step is **Commission** (disabled → "Roster full" when
  `!canAddRigForSide`). Submit sends `add` then closes.
- Name: rig → `CHASSIS_NAME[chassis]` (fallback class); tank/walker → the weapon name.

## Testing

- Kind switch changes the step rail (rig has Equipment step; tank does not).
- Selecting a chassis updates the shown weapon pair and reveals the upgrade bay.
- One-Prototype lock: selecting Prototype on weapon A disables weapon B's Prototype node.
- Submit (rig) dispatches `add` with the exact rig field set; submit (tank) dispatches the
  `{name, kind, owner, unit}` set. Use a mocked `useCommands`.
- Roster-full disables Commission.
- CSS isolation guard already covers `forge.css` (Phase A test globs `styles/*.css`).

## Non-goals

- No change to the shared wizard data or `add` command semantics.
- Real channel-screen routing for Forge (kept as an overlay); full channel navigation is a
  later concern if needed.
