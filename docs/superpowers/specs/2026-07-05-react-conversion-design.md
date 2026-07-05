# React Conversion — Design

**Date:** 2026-07-05
**Status:** Approved (design), pending implementation plan

## Goal

Convert the client UI from vanilla JS ES modules to React, so future work benefits
from reusable components, a familiar ecosystem, and clearer structure. This is a
long-term architecture investment, not a minimal patch — the setup should be
idiomatic React.

## Decisions (locked)

| Fork | Decision |
|------|----------|
| Build tooling | **Vite** (React + JSX + TS, HMR in dev, static build for prod) |
| Migration strategy | **Full client rewrite** in one focused effort |
| State management | **Context + `useReducer`**, split value/dispatch contexts to bound re-renders |
| Language | **TypeScript** (client only) |
| Testing | **Vitest + React Testing Library**; port `markdown` test, replace `ui-static` test |

## Architecture & boundaries

Only the **client** is rewritten. `server/` and `shared/` stay untouched, with a
**single exception**: one line in `server/index.js` changes the static root from
`public/` to the built client output (`client/dist`).

- `shared/*.js` stays **plain JS** — `node server/index.js` keeps running with no
  build step. A hand-written `client/shared.d.ts` gives the TS client full types
  when importing it. Vite bundles `shared` into the client for prod; the dev proxy
  serves it otherwise.
- **CSS class names and ids are preserved verbatim** (`.rig-item`, `#chatPanel`,
  `.open`, `hidden`, etc.). All six CSS files (`tokens`, `app`, `rig-sheet`,
  `battle`, `join`, `glossary`, `rig-wizard`) carry over unchanged, so the app is
  pixel-identical and CSS is not part of the risk surface. Components render the
  same markup structure the current CSS targets.
- **WebSocket-only sync** (matching the actual `api.js` behavior — reconnect with
  1s→2s→4s backoff capped at 5s, no polling). The README's mention of 3s polling is
  stale; we build to the real code.

## Folder structure

```
client/
  index.html              # fonts + <div id="root">, no manual build tags
  vite.config.ts          # proxy /api, /ws, /shared -> :8000
  tsconfig.json
  src/
    main.tsx
    App.tsx
    state/
      RoomStateContext.tsx   # reducer + value/dispatch providers
      UiStateContext.tsx     # ephemeral UI state
      types.ts               # Rig, Game, Session, Command shapes
    hooks/
      useRoomSocket.ts       # WebSocket + reconnect backoff
      useCommands.ts         # sendCommand wrapper + optimistic apply
      useSpeech.ts           # Web Speech API (STT/TTS)
      useViewportHeight.ts   # visualViewport --app-h sync
    lib/
      markdown.ts            # ported from public/js/markdown.js
      rigTags.ts             # ported from public/js/rig-tags.js
      glossaryTerms.ts       # glossary term data + matcher
    components/
      JoinGate.tsx
      Terminal.tsx  Topbar.tsx  TurnBanner.tsx
      BattleHud.tsx  BattleSetup.tsx
      RigDeck.tsx  RigTerminal.tsx  RigAddScreen.tsx  ActionConsole.tsx
      chat/     ChatFab.tsx ChatPanel.tsx MessageList.tsx Bubble.tsx ChatInput.tsx
      overlays/ RollConsole.tsx OutcomeBanner.tsx GlossaryTip.tsx Drawer.tsx
      wizards/  RigWizard.tsx AttackWizard.tsx
    styles/                  # existing CSS copied in, unchanged
  shared.d.ts
```

Server (`server/`, `shared/`, `data/`, `rules.md`) unchanged except the one static
path line. Old `public/js` + `public/css` deleted at the end (git history preserved).

## Component tree (maps 1:1 to today's modules)

| Today (imperative module) | React component |
|---|---|
| `join.js` | `<JoinGate>` |
| `index.html` shell | `<Terminal>` → `<Topbar>` `<Stage>` |
| `tracker.js` (`renderRigs`) | `<RigDeck>` (swipe/pager) → `<RigTerminal>` + `<RigAddScreen>` |
| `battle.js` (`renderBattle`, `buildActionConsole`) | `<BattleHud>` `<BattleSetup>` `<ActionConsole>` |
| `chat.js` | `<ChatFab>` `<ChatPanel>` → `<MessageList>`/`<Bubble>`/`<ChatInput>` |
| `roll-dialog.js` | `<RollConsole>` (portal, owns its animation timers) |
| `rig-wizard.js` / `attack-wizard.js` / `drawer.js` | `<Drawer>` → `<RigWizard>` / `<AttackWizard>` |
| `glossary*.js` | `<GlossaryText>` (tokenizes → `<Term>`) + `<GlossaryTip>` |
| `speech.js` | `useSpeech` hook |
| `status.js` | local status state in `<ChatPanel>` |

## State design

Context + `useReducer`, engineered so a WebSocket push does not re-render the whole
tree:

- **RoomStateContext** — `{ rigs, game, stateVersion, session }`. Split into a
  **value context** and a **dispatch context** so action-only consumers don't
  re-render on state change. Fed by:
  - `useRoomSocket` — WebSocket + reconnect backoff (ported from `api.js`
    `startSocket`), as an effect with correct StrictMode cleanup (no duplicate
    sockets on double-mount).
  - `useCommands` — wraps `sendCommand(verb, attrs)`: POST to
    `/api/game/<room>/command`, then optimistically `applyServerState` on the
    response to avoid a round-trip flicker (preserves current behavior). The
    WebSocket broadcast later delivers the same authoritative state.
- **UiStateContext** — ephemeral state kept separate so server pushes never touch
  it: which panel is open, active wizard + step, roll animation, banner visibility.
- **Chat state is component-local** to `<ChatPanel>` (messages, history, streaming
  flag, think/tts/lang toggles) — not global. Streaming updates local state
  incrementally.
- `<RigTerminal>` is `React.memo`'d per rig, so one rig's SP change re-renders only
  that terminal, not the whole deck.
- Session persistence: `localStorage` key `ooi-session-v1` (unchanged), read on
  init and written via the session action.

## Imperative islands → hooks/components

| Concern | React approach |
|---|---|
| Chat streaming fetch (`chat.js`) | incremental local state; render answer via `markdownToHtml` + `dangerouslySetInnerHTML` |
| Model output rig-tags | parse with `rigTags.ts`, then `sendCommand` per parsed tag |
| Dice animation (`roll-dialog.js`) | self-contained `<RollConsole>` with its own timers/effects |
| Speech (STT/TTS) | `useSpeech` hook wrapping `SpeechRecognition` / `speechSynthesis` |
| Keyboard-safe `--app-h` | `useViewportHeight` hook on `window.visualViewport` |
| Glossary term highlighting | `<GlossaryText>` tokenizes text → `<Term>` spans (replaces DOM-walking `highlightGlossary`) |

## Dev / prod

- **Dev:** `npm run dev` runs Express (`:8000`, API + WS) and Vite (`:5173`, UI with
  HMR) together; Vite `server.proxy` forwards `/api`, `/ws` (with `ws: true`), and
  `/shared` to Express.
- **Prod:** `npm run build` emits `client/dist`; Express serves it (the one-line
  change to `server/index.js`). `npm start` stays the same for end users.
- **Fonts:** Google Fonts links stay in `client/index.html` (Chakra Petch +
  JetBrains Mono), with the same graceful system/monospace fallbacks.
- **Tests:** Vitest + React Testing Library. `public/markdown.test.js` ported to
  Vitest against `lib/markdown.ts`. `public/ui-static.test.js` replaced by
  component/render tests. Server-side `node --test` untouched.

## Migration order (within the rewrite)

1. Scaffold Vite + React + TS in `client/`; wire dev proxy; blank app served.
2. Copy CSS verbatim + fonts; port `lib/` modules (`markdown`, `rigTags`,
   `glossaryTerms`) to TS with Vitest tests.
3. State layer: contexts, reducer, `useRoomSocket`, `useCommands`, session persistence.
4. `<JoinGate>` (entry path) end-to-end against the real server.
5. `<Terminal>` shell + `<Topbar>` + `<Stage>` + `<RigDeck>`/`<RigTerminal>` +
   `<RigAddScreen>` (the core tracker).
6. `<BattleHud>` + `<BattleSetup>` + `<ActionConsole>` + `<RollConsole>` + wizards
   (`<RigWizard>`, `<AttackWizard>`).
7. `<ChatFab>`/`<ChatPanel>` with streaming + `useSpeech` + glossary highlighting.
8. Overlays: `<GlossaryTip>`, `<OutcomeBanner>`, `<TurnBanner>`, `<Drawer>`.
9. Swap Express static root to `client/dist`; update `package.json` scripts; delete
   old `public/js` + `public/css`; parity pass (preview verification against the
   current UI, screen by screen).

## Out of scope (YAGNI)

- No router (single screen).
- No data-fetching library.
- No CSS-in-JS or component library.
- No changes to `server/` logic or `shared/` game logic.
- No new features during the port — behavior parity only.

## Risks / watch-items

- **StrictMode double-mount** duplicating the WebSocket — effect cleanup must close
  the socket and cancel the reconnect timer.
- **Streaming re-render cost** — batch incremental chat updates; keep the streaming
  buffer in a ref, commit to state at a sane cadence.
- **Dice animation timing** — port the existing sequence faithfully inside
  `<RollConsole>`.
- **Glossary rewrite** — moving from DOM-walking to tokenized `<Term>` spans must
  reproduce the same match set and tooltip behavior.
- **Exact class-name parity** — any drift breaks the verbatim CSS; verify markup
  structure per component during the parity pass.
