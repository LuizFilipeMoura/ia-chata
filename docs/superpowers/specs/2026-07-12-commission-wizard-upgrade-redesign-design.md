# Commission Wizard — Split Steps & Risk×Reward Upgrade UI

**Date:** 2026-07-12
**Status:** Design — approved for planning
**Area:** `client/src/v2/overlays/CommissionWizard.tsx`, `client/src/v2/styles/forge.css`, `client/src/v2/lib/commissionData.ts`

## Problem

The rig branch of the Commission Wizard does two jobs on one screen: choosing a chassis **and** tuning both weapons' upgrade tracks, all in a single scroll. The screen has no visual hierarchy, drowns in tiny uppercase "eyebrow" micro-text, uses undecoded glyphs, and hazard-stripes every Prototype node so the card reads as permanently alarmed. The three upgrade tiers — a genuine risk×reward ladder — are rendered as three near-identical nodes that don't communicate that climbing tiers trades safety for payoff.

## Goals

1. **Split chassis selection from upgrade tuning** into two distinct wizard steps. Choosing a frame and tuning its upgrades are separate jobs and should be separate pages.
2. **Rebuild the upgrade UI as a single reusable component** that reads clearly and surfaces the risk×reward of each tier — used for both weapon tracks and the equipment track.
3. Keep all existing game rules intact: fixed weapons/class per chassis, one upgrade per weapon/equipment, **one Prototype per rig** across all three tracks.

## Non-Goals

- No change to tank/walker flow (`Kind → Loadout → Confirm` stays as-is).
- No change to the underlying commission command or server contract.
- No change to which upgrades exist or their effects. This is UI + one optional additive data field.

## Step Flow Change

Rig steps change from 4 to 5:

| Old | New |
|-----|-----|
| Kind | Kind |
| Chassis *(pick + inline upgrade bay for both weapons)* | **Chassis** *(pick frame only)* |
| Equipment *(pick + inline upgrade path)* | **Weapons** *(tune long-range + melee — two upgrade ladders)* |
| Confirm | **Equipment** *(pick equipment + tune its ladder)* |
|  | Confirm |

`stepsFor("rig")` returns `["Kind", "Chassis", "Weapons", "Equipment", "Confirm"]`. Tank/walker unchanged.

- **Chassis** step: the roster of chassis cards, no upgrade bay unfolding inside the selected slot. Selecting a chassis still locks class + both weapons and resets each track to its first (Standard) upgrade. The card keeps its stat rail and description; the "◈ SEL" affordance is strengthened.
- **Weapons** step: header names the chassis; below it, two `UpgradeLadder` components stacked — one per weapon, each with its weapon stat line.
- **Equipment** step: the equipment card grid stays. The selected card reveals one `UpgradeLadder` for that equipment (replacing today's inline three-node `upgradePath`). "Suggested" tagging on cards is preserved.

## The `UpgradeLadder` component

A single component renders one upgrade track (weapon or equipment) as **a volatility slider driving a Payoff | Catch detail panel** (brainstorm direction: C-slider + B-columns).

### Props

```ts
interface UpgradeLadderProps {
  title: string;              // "Autocannon" or equipment label
  subtitle?: string;          // weapon stat line e.g. "ROF 4 · STR 8 · 0–26\""
  glyph?: string;             // weaponGlyph(name) — optional leading icon
  tiers: UpgradeTier[];       // exactly the 3 entries (field / tuned / prototype), in order
  selected: string | null;    // selected upgrade id
  onSelect: (id: string) => void;
  lockPrototype: boolean;     // true when this rig's one Prototype is spent on another track
}
```

`UpgradeTier` is the existing upgrade shape (`{ id, nature, name, tag, effect, catch? }`).

### Layout

1. **Segmented tier slider** — three segments `I / II / III` with sublabels `Standard / Machined / Prototype`, bracketed by a `◂ safe … volatile ▸` scale. The selected segment is filled with its nature color (I green `#4a9d5b`, II amber `#c8862a`, III red `#b5442f`). Clicking a segment selects that tier's upgrade. The Prototype segment, when `lockPrototype` is true and it is not the current selection, renders disabled/greyed with a `🔒 spent` sublabel and a tooltip: "A rig may run at most one Prototype upgrade."
2. **Detail panel** for the selected tier, left-bordered in the tier color:
   - **Title row**: upgrade name; Prototype adds a `1 per rig` gate badge.
   - **Two columns**: **Payoff** (green heading, reward pip meter) | **Catch** (amber heading, risk pip meter). Tiers I/II with no downside show "None — dependable." in the Catch column.

### Reward / risk pips (nature-derived, no new data)

| Tier | Reward pips | Risk pips |
|------|-------------|-----------|
| I · field | 1 | 0 |
| II · tuned | 2 | 1 |
| III · prototype | 3 | 2 |

### Payoff / Catch text

The upgrade `tag` is a single string; many Prototype tags embed the downside after a delimiter (`;`, ` — `, "runs you/it hot", "cooldown"). To render clean Payoff vs Catch:

- Add an **optional authored `catch?: string`** field to upgrade entries in `WEAPON_UPGRADES` / `EQUIPMENT_UPGRADES`. When present, Payoff = `tag`, Catch = `catch`.
- When absent: Payoff = the part of `tag` before the first ` — ` or `;`; Catch = the remainder if there is one, else "None — dependable." (tiers I/II) or a generic "Runs hot / gated." fallback the author can override for III.

Authoring the `catch` field for the ~20 Prototype rows (and any Tuned rows with a real cost, e.g. Extended Belt "dice showing 1 add heat") is a bounded data pass, done in the implementation plan. The parse fallback means the component is correct before every row is authored.

This field is **additive and optional** — it does not affect `effect`, serialization, or the commission command.

## Gate logic (unchanged rules, relocated)

The "one Prototype per rig" constraint already spans long-range, melee, and equipment via `upgradeNature` / `equipmentUpgradeNature`. Each `UpgradeLadder`'s `lockPrototype` prop is computed exactly as today, just from the new step layout:

- **Weapons step**, long-range ladder: locked when melee **or** equipment runs a Prototype.
- **Weapons step**, melee ladder: locked when long-range **or** equipment runs a Prototype.
- **Equipment step**, equipment ladder: locked when either weapon runs a Prototype.

Because selecting a Prototype on one ladder must lock the others, both weapon ladders on the Weapons step read from shared wizard state and re-evaluate on every change (already the case).

## Files

- `client/src/v2/overlays/CommissionWizard.tsx` — new `stepsFor("rig")`; move upgrade tuning out of the Chassis step; add Weapons step; swap the Equipment step's inline `upgradePath` for `UpgradeLadder`; delete `upgradeBay` / `upgradePath` inline helpers.
- `client/src/v2/overlays/UpgradeLadder.tsx` *(new)* — the component above.
- `client/src/v2/lib/commissionData.ts` — pip mapping + tag→{payoff,catch} parse helper; keep `natureLabel`.
- `client/src/v2/styles/forge.css` — new `.v2-ul-*` styles for slider + panel; remove the now-dead `.v2-fc-bay`, `.v2-fc-path`, `.v2-fc-node*`, hazard-stripe rules.
- `shared/game-state.js` — optional `catch` field on upgrade rows (data-only, additive).

## Testing

- Existing template/commission tests must still pass unchanged.
- Add a wizard test: rig flow now has 5 steps in the right order; Back/Next traverse them; Confirm still emits the same `add` command payload (chassis, both weapon upgrades, equipment + upgrade).
- Gate test: selecting a Prototype on the long-range ladder disables the Prototype segment on the melee ladder and on the equipment ladder, and vice-versa; deselecting frees them.
- Component test: `UpgradeLadder` renders the correct pip counts per nature and shows the authored `catch` when present, the parsed remainder otherwise.
```
