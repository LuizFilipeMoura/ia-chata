# Suggested Equipment per Chassis — Design

**Date:** 2026-07-12
**Status:** Approved, pending implementation plan

## Problem

The Commission Wizard's Equipment step lists all five equipment families as
equal, undifferentiated choices. A new player has no steer on which equipment
complements the chassis they just picked. We want each rig chassis to carry
1–2 **suggested** equipment picks, surfaced and visually highlighted in the
wizard, with the top pick auto-selected when the chassis is chosen.

Suggestions are advisory-plus-preselect: the player can still choose any
equipment; the highlight and preselect only nudge.

## Scope

- Rig chassis only. Tanks and Walkers have no equipment slot and are not in
  `CHASSIS`, so they are unaffected.
- UI + content only. No change to combat rules or `rules.md` (a suggestion is
  not a game rule; it is authoring/presentation).

## Data model

Suggestions live in `content/chassis.json`, the existing server-authored,
hot-reloaded catalogue that already carries `description` / `focus` /
`balance` / `personality`. New per-chassis field:

```json
"suggestedEquipment": [
  { "id": "radiator-array", "reason": "The Crossbow runs hot — vent between bolts." },
  { "id": "servo-actuators", "reason": "Reposition to hold the sweet spot." }
]
```

- `id` must be a known `EQUIPMENT` key
  (`ablative-plating`, `radiator-array`, `servo-actuators`, `overclock-core`,
  `field-repair-suite`).
- `reason` is a short string shown in the UI.
- 1–2 entries per chassis; order matters (index 0 is the auto-preselect pick).

## Server — `server/chassis.js`

The store currently merges only the string `CONTENT_FIELDS`. `suggestedEquipment`
is an array, so it needs its own merge branch:

- Add `suggestedEquipment: []` to `defaults()` for every chassis.
- Import `EQUIPMENT` from `../shared/game-state.js` for validation.
- When merging a disk row: if `row.suggestedEquipment` is an array, keep only
  entries that are objects with a known `EQUIPMENT` id; coerce `reason` to a
  string (`""` when absent); **cap the result at 2**. A non-array or missing
  value falls back to the base (empty array). This mirrors the store's existing
  defensive posture (unknown chassis ids and malformed content are dropped, never
  trusted).
- No endpoint change — `/api/chassis` already serializes the full merged entry,
  so `suggestedEquipment` flows to the client for free.

## Client — `client/src/v2/overlays/CommissionWizard.tsx`

1. Extend the `ChassisContent` type and the `/api/chassis` fetch mapping to carry
   `suggestedEquipment: { id: string; reason: string }[]` (default `[]`).
2. **Auto-preselect** the top pick:
   - In `selectChassis(id)`, if the fetched content for `id` has a suggestion,
     also `patch({ equipment: suggestion[0].id })`.
   - When the content fetch resolves, apply the top suggestion for the
     currently-selected chassis (covers the initial default chassis, whose
     content is not yet loaded at mount). This may override a manual pick if the
     player had already changed equipment — an accepted tradeoff; in practice
     content loads before the player reaches the Equipment step.
3. **Highlight** in the Equipment step (step 2): build a lookup of
   `suggestedEquipment` for `state.chassis`. For each equipment button whose id
   is suggested:
   - add an `is-suggested` class (visually distinct from `is-sel`; a card may be
     both suggested and selected),
   - render a "◈ Suggested" badge chip,
   - render the `reason` line beneath the active-effect text.

## Styling — `client/src/v2/styles/forge.css`

- `.v2-fc-equip.is-suggested` — accent border / glow distinct from `.is-sel`.
- `.v2-fc-equip-suggest` — the badge chip + reason line styling, consistent with
  existing eyebrow/badge treatments in the wizard.

## Content — `content/chassis.json`

Author 1–2 suggestions for all 11 rig chassis, chosen from each chassis's
`focus` / `balance` flavour and gameplay. Working first pass (final wording set
during implementation):

| Chassis | Suggested | Rationale |
|---|---|---|
| light-claw-autocannon | ablative-plating; field-repair-suite | Duels heavies up close — wants to survive the trade. |
| light-missile-flamethrower | radiator-array | Flamethrower + volleys build heat fast. |
| light-saw-minigun | servo-actuators; radiator-array | Must stay latched on a target; sustained fire heats. |
| light-wreckingball-double | servo-actuators | Flanker — mobility is its whole game. |
| light-sword-arc | radiator-array; servo-actuators | Arc gun cooks; fencer needs footwork. |
| light-harpoon-anchor | servo-actuators; ablative-plating | Close the gap, then refuse to let go. |
| light-rivet-pressureclaw | ablative-plating; field-repair-suite | Short-range grinder that must stay close and alive. |
| medium-lance-mortar | servo-actuators; radiator-array | Reposition between the shelling and the charge. |
| medium-shield-siege | ablative-plating; field-repair-suite | Immovable objective-holder — stack durability. |
| medium-sniper-chainsaw | overclock-core; radiator-array | Wants extra actions to shoot-then-close in one turn. |
| medium-crossbow-talon | radiator-array; servo-actuators | Runs hot; must hold the sweet spot then pounce. |

## Tests

`server/chassis.test.js`:
- `suggestedEquipment` from disk merges onto the matching chassis.
- Entries with unknown equipment ids are dropped.
- Result is capped at 2 entries.
- `reason` is coerced to a string; a non-array value falls back to `[]`.

Client rendering is thin (class + badge + reason) and covered by manual
verification in the running wizard; no new client test required unless the
existing wizard suite makes one cheap.

## Files touched

- `server/chassis.js`
- `server/chassis.test.js`
- `client/src/v2/overlays/CommissionWizard.tsx`
- `client/src/v2/styles/forge.css`
- `content/chassis.json`
