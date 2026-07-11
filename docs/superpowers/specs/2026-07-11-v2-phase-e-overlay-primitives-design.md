# V2 Phase E — Overlay Primitives (Drawer + Roll Console + V2 provider stack)

**Date:** 2026-07-11 · **Status:** Approved · **Depends on:** A–D. See the native overview.

## Goal

Build the two foundational V2 overlay primitives every battle flow needs — a bottom-sheet **Drawer**
and the **RollConsole** dice theater — plus the **V2 provider stack** that hosts them, so later
phases (F–H) render native V2 overlays instead of the V1 `DrawerProvider`/`RollProvider`.

## Replaces

`client/src/components/overlays/Drawer.tsx` + `state/DrawerContext.tsx`;
`client/src/components/overlays/RollConsole.tsx` + `state/RollContext.tsx` — for V2 only. V1 keeps its own.

## Architecture / components

```
client/src/v2/
  state/V2Providers.tsx        RoomProvider → V2GlossaryTipProvider(stub until J) → UiProvider →
                               V2DrawerProvider → V2RollProvider → V2BattleActionsProvider(F) →
                               V2WizardProvider(G) → children. (E delivers Drawer+Roll; F/G/J fill the rest.)
  state/V2DrawerContext.tsx    useV2Drawer() → { openDrawer(config), closeDrawer() }; portals one V2Drawer
  state/V2RollContext.tsx      useV2Roll() → { playResolution, promptDice(specs,title), closeRoll }; portals V2RollConsole
  overlays/Drawer.tsx          V2 bottom-sheet (title w/ tone ember/oil/cool, body render fn, action buttons, dismissable)
  overlays/RollConsole.tsx     V2 dice theater (imperative handle: playResolution, promptDice)
  styles/overlay.css           .v2-root-scoped drawer + roll console styles
```

- **V2Drawer** mirrors V1 `Drawer` behavior (config: `{ title, tone?, dismissable?, render, actions? }`;
  enter/leave 250ms; scrim click when dismissable; portal to body wrapped in `.v2-root`). `DrawerConfig`
  type re-declared in `V2DrawerContext`.
- **V2RollConsole** mirrors V1 `RollConsole` (V1 file is the behavior source, 416 lines): animated
  d6/d12 flicker→settle, reaction-token flip reveal (Evasive/Return/Brace), damage-equation breakdown
  (actor/weapon/target, operator terms, total, severity tier direct/severe/critical, SP→location),
  effect lines, and the **manual-dice entry form** backing `promptDice`. Exposes a
  `RollConsoleHandle` (`playResolution`, `promptDice`) via `useImperativeHandle`.
- **`main.tsx`** switches to `<V2Providers>` for the V2 branch (per the overview). `V2App` no longer
  relies on the V1 `AppProviders` overlay providers. V1 branch unchanged.

## Behavior

- Any V2 caller: `useV2Drawer().openDrawer({...})` shows the sheet; `promptDice` returns a Promise of
  the entered/auto-rolled dice, exactly like V1 `useRoll().promptDice`.
- `playResolution(resolution)` animates a server `Resolution` (reused `Resolution` type + the same
  breakdown fields V1 renders).

## Testing

- V2Drawer: opens with title/body; action button click fires its handler; scrim closes when dismissable,
  not otherwise.
- V2RollConsole: `promptDice([{key,label,sides}])` renders inputs and resolves with entered values on
  submit; `playResolution` renders a breakdown's total + tier.
- V2Providers: a component under it can call `useV2Drawer`/`useV2Roll` without throwing.

## Done when

V2 mounts its own Drawer + Roll console; no V2 code imports V1 `Drawer`/`RollConsole`/`DrawerContext`/
`RollContext`. (Battle flows still wire to these in Phase F.)
