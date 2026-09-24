# Rig Control Terminal, Design Reconciliation Spec

**Date:** 2026-07-05
**Author:** Luiz (with Claude)
**Status:** Draft, awaiting review

## Purpose

A refreshed design handoff (`Rig Control Terminal.dc.html`) was imported. The design
is already implemented in the live React app (`client/src/`), but the live UI has
**drifted** from the design in a number of places, and it has also **evolved past** it
(multiplayer, a real rules engine, AI chat, an expanded glossary). This spec captures
a **reconciliation pass**: bring the live UI back in line with the design's visuals,
layout, and interaction wherever it has drifted, **without** regressing the evolved
capabilities.

The design is the **visual source of truth**. The live app is the **behavioral source
of truth** for anything the rules engine / multiplayer owns.

## Guardrails (agreed with user)

1. **Full pass**: fix both structural drift (Tier 1) and copy/icon/token nits (Tier 2).
2. **Keep live rulebook copy**: only fix copy that is a *regression* (a missing line, a
   wrong/incomplete label). Do **not** revert wording that the app deliberately made
   more rules-accurate (range readouts, action notes, move-drawer prose, field/option
   descriptions).
3. **Keep the evolved glossary**: 48 rulebook terms, case-sensitive multi-word
   highlighting, subtle hover highlight, anchored tooltip. Only **add** the missing
   full "browse-all" Glossary dialog and wire up the ⓘ trigger buttons.
4. **Keep heat +/- gating**: manual heat controls stay disabled once a battle starts
   (heat is engine-driven then). Do not restore the prototype's always-manual heat.
5. **Restore the outcome `↻ New Battle` button**, wired to a **real** server reset, not
   the prototype's local demo reset.
6. Do not rip out multiplayer, the rules engine, AI chat, a11y additions, or the
   richer live animations. Additive server changes are acceptable; rewrites are not.

## Out of scope (explicitly NOT changing)

- Multiplayer / server-authoritative state / websockets / AI chat dock.
- The 48-term rulebook glossary content and its highlight styling (kept as-is per
  guardrail 3).
- Rules-engine behaviors: heat gating, engine-wrecked heat lock, reduced-action chip,
  rig-modifier chips, manual dice-entry / auto-resolve toggle.
- Accessibility additions (roles, focus rings, keyboard handlers).
- The live app's extra animations (active-rig glow pulse, heat bump/cool, hover states).
- Glossary *content* gaps (`Cover`, `Blast`, standalone `Arc`), these are a rulebook
  content question, not UI drift. Noted for the maintainer; not fixed here.

---

## Workstreams

Each workstream is independently implementable and testable. File paths are the
primary edit targets; exact line numbers will be re-confirmed at implementation time.

### WS-1 · Rig card Loadout panel  *(Tier 1, client-only)*

**Drift:** the rig-card body shows a flat one-line weapon summary
(`RigItem.tsx`) instead of the design's bordered **Loadout** panel.

**Target design:** `Rig Control Terminal.dc.html` lines 116–143. Three blocks inside a
`1px solid #232a34` / `#0a0c0f` rounded panel:
- 🎯 **Long Range**: `Long Range` mono label, weapon name (bold .86rem), then
  `Upgrade · {upName}, {upTag}` in oil (`#ffbf6a`).
- 🗡️ **Melee**: same shape.
- 🛠 **Equipment · {family}** (dashed top divider), label, `Passive · {passive}`
  (dim), `Active · {activeLabel} ({±heat} heat), {activeText}` (teal `#7fd0c4`).
- Every description line runs through `glossify` (reuse `GlossaryText`).

**Data:** resolve from `shared/game-state.js`: `WEAPON_UPGRADES[weapon].find(id)` →
`{name, tag}`, `EQUIPMENT[id]` → `{family, label, passive, active:{label, heat, text}}`.
The Rig already carries `weapons`, `weaponUpgrades`, `equipment`. The commission wizard
already imports these catalogs, so add a small shared helper (e.g.
`client/src/lib/loadout.ts`) `buildLoadout(rig)` and unit-test it.

**Files:** `client/src/components/rig/RigItem.tsx`, new `client/src/lib/loadout.ts`
(+ test), `client/src/styles/rig-sheet.css`.

**Note:** rig data may lack an upgrade/equipment (AI-added or minimal rigs). Panel must
degrade gracefully, show only the blocks that resolve; fall back to the current flat
line when no structured loadout exists.

### WS-2 · Timed Move / Sprint drawer countdown  *(Tier 1, client-only)*

**Drift:** the signature big `5s → READY` countdown is gone; live shows a thin oil
progress bar (`BattleActionsContext.tsx` `MoveBody`).

**Target design:** lines 396–405 + `buildMoveView` 854–877.
- Big centered mono number (`2.1rem`), oil while counting, **green + "READY"** with green
  glow when done.
- Track `8px`, fill flips oil→green gradient on done.
- Two-state instruction line (turns green on done); a mono **cost note** line
  (`Costs 2 actions · +1 heat` / `Costs 1 action · no heat`).
- **Sprint = 8s, Move = 5s** (currently both 5s → fix `MOVE_HOLD_MS` to be per-kind).

**Keep (guardrail 2):** the live rules-accurate call text (distance in inches, etc.) and
confirm-button label, only ADD the missing structural elements above.

**Files:** `client/src/state/BattleActionsContext.tsx`, `client/src/styles/battle.css`.

### WS-3 · Coach banner (TurnBanner)  *(Tier 1 + Tier 2, client-only)*

**Target design:** lines 34–53 + `currentFocus` 1199–1230 + banner styling 1241–1271.

Fixes:
- **Floating card, not full-width bar:** wrap the inner card at `min(448px,100%)`,
  `border-radius:14px`, full `1px` border with a `2px` bottom, tone drop-shadow, and a
  `52px` top offset via a `pointer-events:none` centering wrapper.
- **"Your-move" glow pulses**: add `oi-glowpulse 2.2s ease-in-out infinite` to
  `body.my-turn-glow::after`.
- **Missing "End [rig]'s turn" coach state**: when the active rig has 0 actions left,
  `computeFocus` returns `{tone:act, icon:✔, primary:"End {name}'s turn",
  secondary:"No actions left, pass to the next Rig.", cta:"End turn"}`.
- **Restore secondary lines:** `Choose your next action` → add
  `· Fire, Move or Reload` tail; `Roll initiative` → add
  `Round {n}, decide who moves first.`
- Token nits: flash `brightness 1.35→1.4`, duration `.3s→.32s`; guide/act icon glow to
  solid tone color at `5px`.
- **Keep** the extra `Resolve blast` state (evolution).

**Files:** `client/src/components/TurnBanner.tsx`, `client/src/lib/computeFocus.ts`
(+ update `computeFocus.test.ts`), `client/src/styles/battle.css`,
`client/src/styles/tokens.css`.

### WS-4 · Commission wizard → bottom-sheet  *(Tier 1 + Tier 2, client-only)*

**Drift:** `RigWizard` is a centered fade-in modal; the design (and the live *attack*
sheet) is a bottom-docked sheet.

**Target design:** lines 266–348 + `buildCommissionView` 889–929.
- Bottom-sheet: `place-items:end center`, full-width, top-only `16px` radius, slide-up
  (`oi-sheet .3s`), **drag handle** (34×4 `#3a424e`), **backdrop blur(2px)**.
- Move **step dots** to their own full-width row below the title.
- **SP preview** line under weight class:
  `Hull X · Arms/Legs Y · Engine Z (heat cap Z)` (from `HEAT_CAPACITY` + class SP).
- **Glossify** upgrade tags + equipment passive/active text (reuse `GlossaryText`).
- Confirm step: name `1.15rem` oil-hi; rows regain `🎯 / 🗡️ / 🛠` + `·` separators.
- Body `min-height 12rem → 11rem`.
- Header ⓘ **Glossary** chip → see WS-7.
- **Keep** the extra `Side` selector and the `Roster full` disabled submit (evolution).

**Files:** `client/src/components/wizards/RigWizard.tsx`,
`client/src/styles/rig-wizard.css`.

### WS-5 · Attack sheet polish  *(Tier 1 + Tier 2, client-only)*

**Target design:** lines 350–385 + `buildAttackView` 931–1003.
- Add the **drag handle**, the **dice-preview strip**
  (`🎲 Rolls N hit dice (d6) + 1 location die (d12)…`, amber box above Go), and
  **backdrop blur(2px)** on the scrim.
- Go button dynamic label uses the **mode label** (`Aimed Shot · 2 actions`, `Ram`,
  `Fire`) and `Need N action(s) · N left` (with `·`).
- ⓘ **Glossary** chip in the title row → WS-7. Glossify field/option descriptions.
- opt `min-height 4.5→4.3rem`; scrim `.6→.62` alpha.
- **Keep** the rules-accurate range-readout / field / option copy (guardrail 2).

**Files:** `client/src/components/wizards/AttackWizard.tsx`,
`client/src/styles/battle.css`.

### WS-6 · Dice roll overlay  *(Tier 1, client + additive server)*

**Client (`RollConsole.tsx`, `battle.css`):**
- Add the **"Rolling…"** status line while dice tumble.
- **Per-die tones:** crit=ember, location d12=**teal** (currently mis-toned crit),
  hit=green, miss=faint. Staggered settle (`550 + i·240ms`).
- Unsettled die shows a **rolling random face**, not `?`.
- Minor: overlay `420→400px` width capped `min(400px,100%)`; z-index `80→85`.
- **Keep** the manual dice-entry form + ✕ (evolution). **Keep** live "OK"/title copy
  (guardrail 2), unless the server change below makes weapon-vs-target trivial, in
  which case adopt the design's `titleFull`.

**Server (additive, RECOMMENDED, descope-able):** `shared/combat.js` currently emits a
single aggregate roll (`{sides:6, value:hits, label:"hits (X/rof)"}`), so per-die tones
can't be derived faithfully. Extend the attack resolver to emit each of the `rof` hit
dice as `{sides:6, value, tone}` (`crit` on 6, `ok` on hit, `miss` otherwise, using the
real threshold) plus the location `{sides:12, value, tone:"cool"}`. Update
`shared/combat.test.js`. `RollConsole` prefers `roll.tone` when present.

**Fallback if descoped:** client-only, fix d12→teal and tone the single aggregate die
by comparing `value` to `rof`; no server change. (Less faithful; dice won't tumble
individually.)

### WS-7 · Glossary browse-dialog + ⓘ triggers  *(Tier 1, client-only)*

**Drift:** the full scrollable Glossary dialog and its ⓘ open-buttons don't exist.

- New `GlossaryDialog` component: centered dialog (design 410–428) listing all glossary
  entries, left amber border per entry, term + uppercase full-name + definition,
  scrollable, ✕ + click-outside close. Source from the existing 48-term
  `shared/glossary.js` (keep content).
- Add ⓘ trigger buttons: topbar (design line 64), commission-sheet header (272),
  attack-sheet header (357). Wire through a small UI state flag
  (`UiStateContext` or a dedicated context), mirror the existing overlay pattern.
- **Keep** the anchored per-term tooltip and subtle highlight as-is (guardrail 3).

**Files:** new `client/src/components/overlays/GlossaryDialog.tsx` (+ test),
`client/src/components/Topbar.tsx`, `RigWizard.tsx`, `AttackWizard.tsx`,
`client/src/state/UiStateContext.tsx`, `client/src/styles/glossary.css`.

### WS-8 · Shell / stage / HUD / setup / outcome / FAB  *(Tier 1 + Tier 2)*

- **Outcome banner** (`OutcomeBanner.tsx`, `battle.css`): `fixed → absolute` (center in
  `.term`, not viewport), `width:min(320px,86%)`, padding `1rem 1.2rem`, entrance
  `line-in → oi-rise`, and **restore the `↻ New Battle` button**.
  - *Reset wiring (additive server, RECOMMENDED, descope-able):* add a "reset battle"
    server command (keep rigs, clear game to pre-start) + a client action; wire the
    button to it. **Fallback if descoped:** show the button but disable/hide it, or wire
    to existing ready-reset only.
- **Stage** (`Stage.tsx`): add the right-aligned room-code tag (use the real
  `session.room`, styled like the design's `ROOM IRON42`). Bottom padding
  `5.4rem → 4.5rem` (verify it still clears the chat dock; keep 5.4 if it doesn't).
- **Topbar** (`Topbar.tsx`): ⓘ button → WS-7.
- **Add-card** (`RigAddScreen.tsx`, `rig-sheet.css`): locked label `Full → Ready up ↑`,
  hint → `Full lineup of 3 committed, mark ready to deploy.`, drop the `opacity:.82`
  dimming + `disabled` (keep it a clickable affordance).
- **Chat FAB** (`app.css`): `58→54px`, icon `1.45→1.4rem` (confirm 🛠 glyph).

### WS-9 · Icon & small-token fidelity  *(Tier 2, client-only)*

- **Action console icons** (`BattleActionsContext.tsx` `ACTION_ICONS`): aimed `◎→🔭`,
  ram `💥→💢`, move `🦿→👣`, sprint `💨→🏃` (fire 🎯, reload 🔄 already match).
- **Heat-chip flame** (`rig-sheet.css`): drop `grayscale(.5)/opacity:.7` so 🔥 is
  full-color in cool/cold zones (matches design).
- Misfire copy `misfire roll = D12 + n → misfire = D12 + n` (only if judged a clean
  label fix; otherwise keep).

---

## Testing

- **Unit:** `loadout.ts` (WS-1), `computeFocus` new End-turn + secondary lines (WS-3),
  glossary dialog term list (WS-7), and, if WS-6 server change lands,
  `shared/combat.js` per-die roll output.
- **Component:** extend `RigItem.test.tsx` (loadout panel), `RigWizard.test.tsx`
  (bottom-sheet + SP preview), add `GlossaryDialog` test.
- **Regression guard:** existing suites must stay green, `npm test`
  (Vitest + `node --test`).
- **Visual:** verify against the design section-by-section using the preview server; the
  design forbids screenshots-as-spec, but we confirm the built UI matches the numbers.

## Rollout order

WS-3, WS-8, WS-9 (self-contained, low-risk visual wins) → WS-1, WS-4, WS-5, WS-7
(structural, client-only) → WS-2 → WS-6 (the two additive server-touching items last,
so they can be descoped without blocking the rest).

## Open decisions for review

1. **WS-6 server change** (per-die dice), do it (faithful) or descope to client-only?
2. **WS-8 reset command**: add the server reset (faithful) or descope the button?
3. **Stage bottom padding** `5.4→4.5rem`: only if it still clears the chat dock.
