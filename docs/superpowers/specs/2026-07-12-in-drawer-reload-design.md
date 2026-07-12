# In-Drawer Reload — design

Date: 2026-07-12
Branch: frontend/v2-redesign

## Problem

When a Rig's ranged weapon is spent, the V2 Fire drawer lets the player select the
spent long-range weapon and then dead-ends: the primary CTA turns into a disabled
**"Reload first"** button that does nothing. Reload is only actually performed from a
separate tile in the console's Attack group. The drawer tells you what's wrong but
gives you no way to fix it in place.

We want the Fire drawer to own reloading: disable the spent weapon in the picker, and
offer a live **Reload** button that arms the weapon so the player can fire again
without leaving the drawer.

## Decisions (agreed)

1. **Reload flow:** tapping Reload in the drawer reloads *and stays open*, re-arming the
   long-range weapon so the player can immediately fire it if they still have an action.
2. **Single reload path (true drawer-only):** the standalone Reload tile in the console
   Attack group is removed. The Fire drawer is the only place reload is surfaced. To keep
   this reachable for units with no melee fallback, the Fire tile stays enabled whenever
   the ranged weapon is spent-but-reloadable (it opens a drawer that offers Reload).
3. **Heat honesty:** the post-reload shot runs hot (+1 heat). This is already the game's
   behavior (`reload` does not reset `turn.longRangeShots`, and being spent always implies
   you fired this activation). No rule change — the drawer just surfaces the existing +1.

## Spent-signal unification (prerequisite)

`shared/game-state.js` uses `loaded.longRange` as the universal "ranged is spent" flag:
firing any ranged weapon — including a flat-pick cold-kind "unit" weapon, which resolves
under `slot === "longRange"` — sets `loaded.longRange = false`, and the fire gate reads the
same field. The `reload` verb sets `loaded.longRange = true`.

`shared/battle-view.js` `availableActions`, however, reads `loaded.unit === false` for
flat-pick kinds — a field nothing ever writes. Result: cold kinds never register as spent
in the console, yet their real second shot is silently blocked server-side, and their
reload tile never lights. Pre-existing bug.

**Fix:** unify the spent check to `loaded.longRange === false` for all kinds. Drop the
`loaded.unit` branch in `battle-view.js` and the `loaded.unit` branch in the drawer's spent
computation. No code writes `loaded.unit`, so this only removes a dead, wrong read. Cold
kinds now correctly register as spent and can reload.

## Behavior

Scope: `mode === "fire"`, non-react. (`aimed` never opens while spent; react uses a
separate path.)

**Spent state (`liveRig.loaded.longRange === false`):**

- **Weapon picker:** the long-range chip renders disabled + greyed with a `Spent · reload`
  sub-label; it can't be selected. The drawer keeps auto-opening on the melee weapon (existing
  behavior), so a melee strike stays fully usable.
- **Reload affordance:**
  - If a live weapon is selectable (melee present): a reload banner sits under the Weapon
    field — *"Ranged weapon spent — Reload is mandatory before it can fire again. Reloaded
    shot runs hot: +1 heat."* — with a `⟳ Reload` button. The bottom CTA stays the melee Fire.
  - If no live weapon (no/destroyed melee, or flat-pick with only the spent ranged weapon):
    the big ember CTA itself becomes `⟳ Reload` (no competing banner button).
  - The Reload button/CTA is disabled with a `Need 1 action` note when no actions remain.

**Tapping Reload:**

- Dispatch `sendCommand("action", { name: rig.name, action: "reload" })`.
- Optimistically flip local `justReloaded = true` for instant feedback; the authoritative
  server echo (via live-rig derivation below) confirms it.
- Re-enable the long-range chip and **auto-select it** (`patch({ weapon: "longRange" })`),
  which re-seeds the range slider to the weapon's sweet spot via the existing weapon-change
  effect. Banner disappears; bottom CTA becomes the long-range Fire (or `Need 1 action · N
  left` if out of budget).

## Reactivity

The drawer currently reads a `rig` prop snapshot taken at open time, so a reload echo
wouldn't show. Derive the live rig from room state:

```
const liveRig = rigs.find((r) => r.id === rig.id) ?? rig;
```

Use `liveRig.loaded` for the spent check. Combined with the optimistic `justReloaded`
flag, the drawer reflects the reload instantly and stays consistent with the server:

```
const spent = liveRig.loaded?.longRange === false && !justReloaded;
```

## Console changes (true drawer-only)

- `shared/battle-view.js`:
  - Remove `"reload"` from `ACTION_ORDER` so `availableActions` no longer emits it.
  - Unify `rangedSpent` to `rig.loaded?.longRange === false` (drop the flat-pick `loaded.unit`
    branch).
  - In the fire/aimed gating: when `rangedSpent`, keep `fire` enabled (it opens the reload
    drawer) and disable only `aimed`.
- `client/src/v2/battle/ActionConsole.tsx`: drop `"reload"` from the Attack group's `keys`
  and its `ACTION_GLYPH` entry. With `reload` gone from `availableActions` and `aimed`
  disabled while spent, the Attack group collapses to a solo `fire` tile that taps straight
  into the drawer.

The `reload` verb in `game-state.js` and `ACTIONS.reload` in `rules.js` stay — the drawer
dispatches the action directly.

## Components / units

- **`Field`** (in `AttackWizard.tsx`): extend with an optional `optDisabled?: (opt) => boolean`
  predicate. A disabled option renders as a non-interactive greyed chip. Single, focused
  change to an existing presentational unit.
- **`AttackWizard`**: live-rig derivation, `justReloaded` state, the reload banner/CTA,
  weapon-picker disabling, and CTA adaptation. Reload dispatch reuses the existing
  `sendCommand` path.

## Files

- `shared/battle-view.js` — spent-signal unification; drop `reload` from `ACTION_ORDER`;
  keep `fire` enabled while spent.
- `shared/battle-view.test.js` — reload no longer listed; fire enabled when spent; flat-pick
  spent now registers.
- `client/src/v2/battle/ActionConsole.tsx` — remove reload from Attack group + glyph map.
- `client/src/v2/battle/ActionConsole.test.tsx` — drop reload-tile assertions if present.
- `client/src/v2/overlays/AttackWizard.tsx` — `Field` `optDisabled`; live rig; `justReloaded`;
  reload banner/CTA; picker disabling; spent check on `loaded.longRange`.
- `client/src/v2/overlays/AttackWizard.test.tsx` — spent → long-range chip disabled + banner;
  tap Reload → dispatches `reload`, long-range armed + auto-selected; no-melee → CTA is Reload;
  no actions → reload disabled.
- `client/src/v2/styles/wizards.css` — disabled weapon chip + reload banner/button (ember tone).

## Testing

- Rig, long-range spent, melee present: long-range chip disabled with `Spent · reload`;
  reload banner shown; bottom CTA is melee Fire.
- Tap Reload → dispatches `action: reload`; after echo/optimistic flip, long-range chip
  enabled and selected, banner gone, CTA is long-range Fire.
- Rig, long-range spent, no melee: big CTA is `⟳ Reload`; after reload it flips to Fire.
- No actions left while spent: reload disabled with `Need 1 action`.
- `battle-view`: flat-pick spent registers as `rangedSpent`; `fire` stays enabled while
  spent; `aimed` disabled; `reload` absent from the action list.

## Out of scope

- Reload for the react / Return-Fire path (separate flow; untouched).
- Aimed-shot reload entry (must reload via the Fire drawer first, then re-open Aimed).
