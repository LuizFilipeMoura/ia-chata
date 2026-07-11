# V2 Native Overlays — Overview & Architecture (remove all interims)

**Date:** 2026-07-11
**Status:** Approved direction (user: "leave no interim, everything should be new")
**Depends on:** Phases A–D (shipped). This overview governs Phases **E–J**, which replace every
remaining reused-from-V1 presentation surface with native V2 components.

## Why

Phases A–D delivered a functional V2 that reuses several V1 presentation pieces as documented
interims. The goal now: **zero interims** — every pixel the V2 user sees is native V2, under
`.v2-root`, in the dieselpunk design system. V1 stays untouched and fully working behind the toggle.

## Interim inventory (what must become native)

| Interim (V1 today) | Reached from | Native replacement | Phase |
|---|---|---|---|
| `Drawer` (bottom-sheet primitive) | `DrawerProvider` | V2 Drawer + `V2DrawerProvider` | **E** |
| `RollConsole` (dice theater, manual entry) | `RollProvider` | V2 RollConsole + `V2RollProvider` | **E** |
| Battle-action bodies (move/sprint hold, repair, prepare, blast) | `BattleActionsContext` | `V2BattleActionsProvider` (V2 bodies via V2 Drawer/Roll) | **F** |
| `ReactionPicker` | prepare + reactions | V2 ReactionPicker | **F** |
| Watcher drawers (answer-token gate, reaction resolution, activation recap) | `useBattleWatchers` | `useV2BattleWatchers` (V2 drawers) | **F** |
| `AttackWizard` (fire/aimed/lock) | `WizardProvider.openAttack` | V2 AttackWizard | **G** |
| `VpWizard` (objective scoring) | `WizardProvider.openScore` | V2 VpWizard | **G** |
| `FieldMap` + `FieldControls` | Squadron | V2 FieldMap + V2 FieldControls | **H** |
| `ChatPanel` (+ MessageList/Bubble/ChatInput/SuggestedPrompts) | `V2ChatMount` | V2 ChatPanel suite | **I** |
| `GlossaryDialog` + `GlossaryTip` + `GlossaryText` | V2Terminal / loadout / chat | V2 glossary suite | **J** |

## Architecture: V2 gets its own provider stack

The V1 overlay providers **bundle logic with V1 JSX** (`DrawerProvider` renders `<Drawer>`,
`RollProvider` renders `<RollConsole>`, `WizardProvider` renders the wizards,
`BattleActionsContext` builds V1 drawer bodies). So V2 cannot swap presentation by reusing those
providers — it needs **parallel V2 providers**.

**Split of concerns (reuse vs. rebuild):**
- **Reuse (pure state / logic, no V1 JSX):** `RoomStateContext`, `UiStateContext`,
  `GlossaryTipContext` *state*, `ChatContext` *state*, and the logic hooks `useChatStream`,
  `useSpeech`, `useCommands`, `useMySide`, plus all `/shared/*.js` game logic
  (`availableActions`, `actionBudget`, `phaseSummary`, `computeFocus`, dice specs, distances, etc.).
- **Rebuild (V1 presentation):** Drawer, RollConsole, the battle-action drawer bodies, the wizards,
  field map, chat panel, glossary dialog/tip — as native V2 components + thin V2 providers.

**`main.tsx` composition split.** Today both apps share `<AppProviders>`. Introduce a V2-specific
composition so V1 is never touched and V2 never mounts idle V1 overlay providers:

```
main.tsx:
  useV2 ? <V2Providers><V2App/></V2Providers>   // Room + Ui + GlossaryTip(state) + Chat + V2 overlays
        : <AppProviders><App/></AppProviders>     // unchanged V1 stack
```

`V2Providers` (new, `client/src/v2/state/V2Providers.tsx`) composes:
`RoomProvider → V2GlossaryTipProvider → UiProvider → V2DrawerProvider → V2RollProvider →
V2BattleActionsProvider → V2WizardProvider → children`. It reuses `RoomProvider`/`UiProvider`
(pure state) and provides V2-native Drawer/Roll/BattleActions/Wizard/GlossaryTip. `ChatProvider`
stays local to the V2 chat mount (Phase I) as today.

**Hook indirection.** V2 components call **V2 hooks** (`useV2Drawer`, `useV2Roll`,
`useV2BattleActions`, `useV2Wizard`, `useV2GlossaryTip`) — never the V1 ones. Phase F rewires the
V2 `ActionConsole`, `TurnBanner`, `OutcomeBanner`, and RigTerminal to the V2 hooks; the shared
game-logic imports stay identical.

**Isolation contract unchanged.** All new CSS under `.v2-root`; V2 overlays that portal to
`document.body` wrap their content in `<div className="v2-root">` (the pattern already used by the
Phase C action-console popover). The existing `styles/isolation.test.ts` guards every new sheet.

## Build order & dependencies

E (Drawer + Roll primitives + V2Providers skeleton) → F (battle action flows + watchers, depends on E)
→ G (attack/VP wizards, depends on E + the V2 wizard provider) → H (field, depends on E's drawer for
the set-field sheet) → I (chat, independent) → J (glossary, independent; F/I consume V2 GlossaryText).

Each phase is its own spec (this folder) → plan → subagent implementation, and each ends with the
matching interim import deleted from V2 and a green suite. **Definition of done for the whole
initiative:** `grep -rE "from \"\.\./\.?\./components" client/src/v2` returns nothing (no V2 file
imports a V1 component), and every battle/chat/glossary surface renders native under `.v2-root`.

## Testing posture

Per phase: TDD component tests for each native piece (behavioral, mock the command layer), plus a
"no V1 component import" grep assertion added in the final phase. Live browser verification of each
replaced surface. The shared game-logic functions already have V1 unit tests; V2 reuses them, so V2
tests focus on presentation + wiring.
