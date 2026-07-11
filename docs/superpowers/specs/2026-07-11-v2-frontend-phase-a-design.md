# V2 Frontend — Phase A Design (Shell + Join + Squadron + Rig Terminal)

**Date:** 2026-07-11
**Status:** Approved design, ready for implementation plan
**Scope:** Phase A of a 4-phase V2 frontend redesign

## Background

The game "Oil & Iron" (a dieselpunk tabletop wargame companion) has an existing
V1 frontend in `client/src`. A new visual design ("Oil & Iron Terminal", the V2
design system) was produced as a Claude Design HTML/CSS/JS prototype. We are
rebuilding the frontend in that visual language.

V2 must live **alongside** V1 without colliding in HTML or CSS. It is a
**presentation-layer swap only**: it reuses 100% of V1's state, hooks, socket,
and command-dispatch layer. No game logic is rewritten.

The V2 mockup covers only a subset of the app (Join, Squadron, Commission, a Rig
Terminal overlay, an Attack overlay, a Rulebook chat, an Outcome screen). It is
missing the entire live-battle surface and much rig/commission/attack/chat depth.
Those gaps are re-implemented in the V2 design language across later phases.

### Phasing (each phase = its own spec → plan → build)

- **Phase A (this doc):** Shell + Join + Squadron + Rig Terminal, fully wired.
- **Phase B:** Commission wizard (Rig/Tank/Walker, chassis, upgrades, equipment, confirm).
- **Phase C:** Battle system — new Battle screen (field map, HUD, turn banner,
  action console), move/repair/prepare drawers, roll console, reactions, answer
  tokens, blast, VP scoring, Attack overlay, Outcome.
- **Phase D:** Chat/Quartermaster + glossary + remaining cross-cutting.

## Goals (Phase A)

1. V2 renders behind a `?v2` toggle, isolated from V1 in both JS and CSS.
2. A user can join a room, see the squadron roster (own + enemy), open a rig's
   Control Terminal, damage/repair components, adjust engine heat, remove a rig,
   toggle dice mode, and mark ready — all wired to the real server state.
3. Establish the reusable V2 patterns (shell, CSS scoping, state-to-viewmodel
   mapping, command dispatch, tests) that later phases follow.

## Non-Goals (Phase A)

- No live-battle UI (action console, Fire overlay, field map, roll console) —
  Phase C.
- No V2 commission wizard — the Yard's "Commission" action delegates to the
  **existing V1 commission wizard** (a wired portal overlay) as an interim until
  Phase B.
- No V2 chat/Quartermaster or glossary — Phase D. The Rulebook dock button is
  rendered disabled.
- No changes to V1 files beyond the single `main.tsx` toggle branch.

## Architecture

### Isolation strategy

- **New directory `client/src/v2/`** mirrors the real structure so a future port
  is a rename, not a rewrite:
  ```
  client/src/v2/
    V2App.tsx
    screens/        Join.tsx, Squadron.tsx
    overlays/       RigTerminal.tsx
    components/     Shell.tsx (+ status strip, channel nav, command dock, CRT), RigRow.tsx, CompRow.tsx, HeatGauge.tsx
    lib/            viewModels.ts (state → V2 view-model mapping)
    styles/         tokens.css, shell.css, join.css, squadron.css, rig-terminal.css
  ```
- **JS isolation:** V1 is untouched. Only `main.tsx` gains a branch.
- **CSS isolation:** every V2 rule is a descendant of `.v2-root`. Design tokens
  live on `.v2-root { ... }`, **not** `:root`, and every custom property is
  prefixed `--v2-` (e.g. `--v2-oil`, `--v2-iron-900`). No V2 rule targets bare
  `body`, `html`, or `:root`. This guarantees zero collision with V1's global
  `tokens.css` / `app.css`. V2 stylesheets are imported only from `V2App.tsx`.

### Entry + toggle

- `main.tsx`: read the current URL; if it carries a `v2` query flag, render
  `<V2App/>`, otherwise `<App/>`. Both are wrapped by the existing
  `<AppProviders/>` (unchanged), so every context (Room, Ui, Drawer, Roll,
  BattleActions, Wizard, GlossaryTip) and the room socket work identically under
  V2.
- `v2/V2App.tsx` mirrors `App.tsx`'s session logic and **reuses** `useRoomState`,
  `useRoomDispatch`, `useRoomSocket`, `useViewportHeight`, and the same
  `/api/game/:room/join` POST flow:
  - no session → `<V2Join/>`
  - session → `<V2Terminal>` (the shell hosting the Yard).
  - Dev TestHarness is intentionally not ported (stays V1-only).

### Reuse boundary

V2 reuses, unchanged: `state/` (all contexts, reducer, types), `hooks/`, `lib/`
(including `shared/battle-view.js` `rigModifiers`, heat meter, `spColor`-style
helpers, command senders), and the server command layer. V2 provides only
presentation and view-model mapping.

## Components

### Shell (`v2/components/Shell.tsx` + parts)

Wraps children in `<div class="v2-root">` and lays out:

- **Status strip (header):** brand mark + "OIL & IRON / RIG CONTROL TERMINAL",
  a LINK·LOCAL status lamp, and the room code from `session`.
- **Channel nav:** channels Enlist / Yard / Forge / Rules / Verdict. Only **Yard**
  is active and selectable in Phase A. Forge / Rules / Verdict render in a
  disabled "stand by" state (no navigation). No Battle channel yet.
- **Command dock (footer):**
  - **Leave** — wired: confirm dialog, then `localStorage.clear()` + `clearSession`
    (same behavior as V1 FabDock leave).
  - **Revert** — wired: shown only when `game.canUndo`; sends the `undo` command.
  - **Rulebook** — rendered disabled (Phase D).
  - Settings ⚙ button — visual only in Phase A.
- **CRT / ambient overlays:** fixed, `pointer-events:none`, `aria-hidden`. All
  animations gated by `@media (prefers-reduced-motion:reduce)`.

Screen switching in Phase A is trivial (only the Yard exists as content); the
channel-nav component is built to accept an active-channel prop so Phase B/C can
add real destinations.

### Join (`v2/screens/Join.tsx`)

Mockup join card, wired to the real join flow:

- Inputs: **Battle Room Code**, **Commander Designation**.
- **Declare Allegiance** picker: Side A (Friendly) / Side B (Hostile). Selection
  is a *request*; the server's returned `data.side` wins and is stored in session.
- Primary CTA "Enter The Yard" → POST `/api/game/:room/join` with `{name, side}`;
  on success store session + apply initial server state; on failure show the
  error line (e.g. "Room is full.").
- Live status line ("ALL SYSTEMS NOMINAL — READY TO ENLIST" vs guidance when
  fields are incomplete). CTA disabled until room + side are chosen.

### Squadron / Yard (`v2/screens/Squadron.tsx`)

- **Header:** "THE YARD", `N / 3 COMMISSIONED` (from roster count and the real
  per-side cap), and **tonnage** computed from the real roster's weight classes.
- **Your Squadron** section: one `RigRow` per own rig, own-first ordering.
- **Hostile Forces** section: enemy rigs, read-only hostile styling.
- **Commission add card:** interim — opens the existing V1 commission wizard via
  `WizardContext.openCommission`. Honors the same roster-full / per-side caps
  (renders locked "Ready up" state when full), matching V1's `RigAddScreen`.
- **Ready bar:** ready-status text per side, a dice **AUTO / MANUAL** toggle
  (`setdice`), and a **READY** button. Same gating as V1 `BattleSetup` (requires
  3 rigs and, for the owner, a locked field). All wired to existing commands.

### RigRow (`v2/components/RigRow.tsx`)

View of one rig in the roster: side stripe, class glyph + short code, name,
ACTIVE badge (when applicable), loadout summary, four component mini-bars
(H/A/L/E) using real `sp/max` and the mockup's `spColor` thresholds, and a
status dot/label. Cold kinds (tank/walker) show a kind label instead of a heat
chip and a single flat weapon. Clicking opens the Rig Terminal overlay for that
rig (via `UiState` expanded/active-rig or a local overlay state — implementation
detail resolved in the plan).

### Rig Terminal overlay (`v2/overlays/RigTerminal.tsx`)

Modal overlay (scrim + centered sheet), matching the mockup's Rig Control
Terminal, for the selected rig:

- **Header:** class glyph, name, weight class / kind, loadout, ACTIVE badge +
  status token (nominal/worn/damaged/…).
- **Loadout detail:** long-range + melee weapons with upgrade names and glossary
  tags, or a single flat weapon for cold kinds; equipment passive + active with
  heat cost.
- **Status-effect chips:** rendered from the real `rigModifiers` set
  (anchor/rivet/crack/burn/jam/etc.).
- **Component rows (`v2/components/CompRow.tsx`):** label, SP bar (color by
  threshold, "CATASTROPHIC"/"DESTROYED" text), **− Damage** / **+ Repair**
  buttons wired to the real `damage` / `repair` commands, with a floating ∓N
  delta flash (red on hit, green on heal) as in V1.
- **Engine heat gauge (`v2/components/HeatGauge.tsx`):** real heat vs cap, zone
  coloring, redline/over states; **STOKE** and **VENT** wired to the existing
  heat commands. Hidden entirely for cold kinds.
- **Remove Rig:** wired remove command.
- **Activate CTA:** present, but honors the real `canActivateNow` gate — shows
  "Wait for your turn" outside your activation. The **action console and Fire
  overlay are deferred to Phase C** and are not rendered in Phase A.
- Close via scrim click / ✕ / Escape.

## Data flow

1. Server pushes authoritative state over the socket → `RoomStateContext`
   (unchanged).
2. `v2/lib/viewModels.ts` maps `RoomState` (`rigs`, `game`, `field`, `ownerSide`,
   `session`) into V2 view-models (roster rows, terminal props, ready-bar state,
   tonnage, commissioned count).
3. V2 components render view-models; user actions call the same command senders
   V1 uses (`join`, `add`, `damage`, `repair`, heat stoke/vent, `remove`,
   `setdice`, `ready`, `undo`, leave/clearSession).
4. Server responds → new state pushed → re-render. No optimistic local game
   state beyond existing V1 patterns (e.g. delta-flash animations).

## Error handling

- **Join failures:** surfaced on the Join error line; session not set.
- **Stale state:** handled by the existing version-guarded `applyServerState`
  reducer (unchanged).
- **Gated actions:** disabled with an inline reason (e.g. Ready needs 3 rigs +
  locked field; Activate needs your activation turn), mirroring V1 gating so the
  server is never sent an invalid command from a disabled control.
- **Reduced motion:** all decorative animation disabled via media query.

## Testing

TDD per component, using V1's existing vitest + testing-library setup:

- **Shell:** renders channel nav with only Yard active; Leave triggers confirm →
  clearSession + localStorage wipe; Revert visible only when `canUndo` and sends
  `undo`.
- **Join:** CTA disabled until room + side chosen; submit calls the join POST
  with `{name, side}`; error line renders on failure; server-returned side is the
  one stored.
- **Squadron:** renders own vs enemy sections from mock state; commissioned count
  and tonnage computed from roster; add-card opens the V1 wizard and shows the
  locked state at cap; Ready gating matches state; dice toggle sends `setdice`.
- **RigRow / CompRow / HeatGauge:** bars reflect `sp/max`; damage/repair buttons
  dispatch the right command with delta flash; heat gauge hidden for cold kinds;
  stoke/vent dispatch heat commands.
- **RigTerminal:** opens for the tapped rig; status chips reflect `rigModifiers`;
  Activate honors `canActivateNow`; remove dispatches the remove command.
- **CSS isolation guard:** a test/lint check asserting no V2 stylesheet contains a
  bare `:root`, `html`, or `body` selector (all rules under `.v2-root`).

## Open implementation details (resolved during planning)

- Exact command-sender names/signatures for heat stoke/vent, remove, ready,
  setdice (read from V1's `BattleActionsContext` / command layer during TDD).
- Tonnage and weight-class → tonnage mapping (read from V1's roster/shared logic).
- Rig-terminal open/close state channel (local vs `UiStateContext.activeRigId`).
- The `?v2` flag parsing detail (query param vs hash) — pick one in the plan.
