# Project Structure Split — Design Spec

**Date:** 2026-07-04
**Status:** Proposed (spec only — no implementation yet)
**Constraint:** No new dependencies, no build step, no bundler. Plain Node ESM on the server, native browser ES modules on the client. Everything must keep working with `npm start` / `npm test` exactly as today.

## Goal

Split the two monoliths (`index.html`, `server.js`) into small, single-concern files with explicit boundaries, so that multiple agents (or humans) can work on different concerns in parallel without editing the same file — especially during Phases 1–5 of the battle-state plan, which currently funnel almost every change into `index.html` and `server.js`.

This is a **mechanical move, not a rewrite**: code is relocated and re-plumbed with `import`/`export`, but behavior, markup, styles, and logic are unchanged. Deduplication of the rig math (currently in three places) is explicitly **not** done here — the Phase 1 plan already deletes the client and server copies; this spec just gives each copy a clearly-owned home until then.

## Problems today

1. **`index.html` (1,162 lines)** holds ~410 lines of CSS, ~65 lines of markup, and ~670 lines of JS spanning six unrelated concerns: viewport handling, rig state + math + `localStorage`, the `[[RIG ...]]` tag protocol, the tracker sheet/deck UI, chat streaming, and speech (STT + TTS). Any two UI tasks conflict on this one file.
2. **`server.js` (208 lines)** mixes env config, the tracker-protocol prompt text, rulebook loading, a duplicated `RIG_DEFAULTS`/`formatRigState`, the Ollama streaming proxy, and Express wiring. Phase 1 adds three more routes and a store into it.
3. **`express.static(__dirname)` serves the whole repo** — including `server.js`, `rules.md`, `docs/`, and `package.json` — to any browser on the LAN. Moving client files into `public/` fixes this as a side effect.
4. **Triple duplication** of `RIG_DEFAULTS` + rig math (`server.js`, `index.html`, `game-state.js`). Phase 1 resolves it; until then the copies at least get separate, clearly-labeled homes.
5. **The Phase 1 plan targets the monolith paths.** Without this split, Tasks 5–9 (server routes, join gate, polling, command sender, ownership render) all edit `server.js` and `index.html` — serializing work that is conceptually parallel.

## Approaches considered

- **A. Minimal split** — extract CSS and JS out of `index.html` into one file each; split `server.js` into two. Cheap, but `app.js` would still be a ~670-line grab-bag and Phase 1 tasks would still collide inside it.
- **B. Concern-per-file layout with `server/`, `public/`, `shared/` (recommended)** — each concern gets its own module with an explicit dependency direction; `shared/` holds the pure game logic used by both sides (per the Phase 1 architecture). Matches the ownership boundaries agents actually need. No tooling required.
- **C. Feature folders (`features/chat/`, `features/rigs/` each with own css/js/server slice)** — over-structured for a ~2,300-line project; deeper nesting without better isolation than B.

**Decision: B.**

## Target structure

```
ia-regrinha/
├── package.json               # scripts point at server/index.js
├── rules.md                   # unchanged (read from disk by the server; no longer web-served)
├── README.md / CHANGELOG.md   # unchanged
├── docs/                      # unchanged
│
├── shared/                    # pure game logic — no I/O, no DOM, no fetch, no fs
│   ├── game-state.js          # moved from ./game-state.js, content unchanged
│   └── game-state.test.js     # moved from ./game-state.test.js, import path updated
│
├── server/                    # Node-only code
│   ├── index.js               # entry: express app assembly, static mounts, listen()
│   ├── config.js              # env-derived constants: MODEL, OLLAMA_URL, NUM_CTX, RULEBOOK_MD, PORT
│   ├── prompt.js              # rulebook loading + SYSTEM_PROMPT, TRACKER_PROTOCOL,
│   │                          #   legacy RIG_DEFAULTS + formatRigState (deleted by Phase 1 Task 5)
│   ├── routes/
│   │   ├── chat.js            # POST /api/chat — Ollama streaming proxy (express.Router)
│   │   └── game.js            # (created by Phase 1 Task 5) join / GET / command routes
│   ├── store.js               # (created by Phase 1 Task 4) JSON-file room store
│   └── store.test.js          # (created by Phase 1 Task 4)
│
└── public/                    # the only directory served to browsers
    ├── index.html             # markup only + <link> stylesheets + <script type="module" src="js/main.js">
    ├── css/
    │   ├── tokens.css         # :root variables, resets, scrollbar, body shell
    │   ├── app.css            # topbar, message log, bubbles, dock, cmdbar, input row, keyframes
    │   └── rig-sheet.css      # scrim, sheet, rig deck/screens/bars, add-screen, pager
    │                          #   (Phase 1 Task 6 adds join.css beside these)
    └── js/                    # native ES modules, no build step
        ├── main.js            # entry: visualViewport sync, boot (loadRigs/renderRigs/greeting),
        │                      #   cross-module wiring (e.g. speech → chat callback)
        ├── status.js          # setStatus() over #statusRow — leaf module, no imports
        ├── rig-state.js       # RIG_DEFAULTS, LOCS, rigs array, localStorage load/save,
        │                      #   findRig/makeRig, damage/repair/set/heat/recompute
        │                      #   (largely deleted by Phase 1 Task 7 — becomes server-state mirror)
        ├── rig-tags.js        # RIG_TAG_RE, parseAttrs, applyRigCommands, stripRigTags, rigSnapshot
        ├── rig-panel.js       # sheet open/close, swipe deck, pager dots, rig screens, add form
        ├── chat.js            # history, bubbles, autoResize, sendMessage streaming loop,
        │                      #   clear button, reasoning toggle
        ├── speech.js          # SpeechRecognition (mic, lang select) + speechSynthesis (TTS toggle, speak)
        └── api.js             # (created by Phase 1) sendCommand, pollOnce/startPolling, join —
                               #   the single home for /api/game/* fetches
```

Estimated sizes after the split: every JS module lands between ~30 and ~200 lines; every CSS file between ~100 and ~200 lines.

## Module boundaries and dependency direction

Rules that keep agents out of each other's files:

- **`shared/game-state.js` is pure.** No `fs`, no `fetch`, no DOM, no `Date.now`. It is the only place server-authoritative rig math may live. Fully unit-tested.
- **`server/routes/*` never build prompt text** — they import from `server/prompt.js`. `server/prompt.js` never touches `req`/`res`.
- **`server/config.js` is the only reader of `process.env`.**
- **Client modules form a DAG** (no import cycles):

  | Module | May import |
  |---|---|
  | `status.js` | (nothing) |
  | `rig-state.js` | (nothing) |
  | `rig-panel.js` | `rig-state`, `status` |
  | `rig-tags.js` | `rig-state`, `rig-panel` |
  | `speech.js` | `status` |
  | `chat.js` | `status`, `rig-tags`, `speech` |
  | `main.js` | anything (composition root) |

  The one would-be cycle (speech's `onresult` needs `sendMessage`, chat needs `speak`) is broken by injection: `speech.js` exports `initSpeech({ onTranscript })` and `main.js` passes `chat.sendMessage` in. `chat.js` imports `speak` directly.
- **Each module grabs its own DOM elements** (`document.getElementById`) at import time instead of receiving them from a central ref block — so adding a widget to one concern never edits another concern's file.
- **`public/index.html` and `main.js` remain shared touchpoints.** Mitigation: markup changes are additive per feature block (each concern owns its own subtree: `.dock` toolbar buttons belong to the module that handles them; `#rigPanel` belongs to rig-panel), and `main.js` stays a thin composition root (~40 lines) so merge conflicts there are trivial.

## What moves where (line-level mapping)

### `server.js` → `server/`

| Current lines | Content | Destination |
|---|---|---|
| 8–12 | env constants | `server/config.js` |
| 14, 20–47, 50–55, 57–99 | `SYSTEM_PROMPT` state, `TRACKER_PROTOCOL`, legacy `RIG_DEFAULTS`, `formatRigState`, `loadRulebook` | `server/prompt.js` |
| 109–195 | `POST /api/chat` handler | `server/routes/chat.js` as an `express.Router()` |
| 1–6, 101–107, 197–208 | imports, app assembly, `start()` | `server/index.js` |

`server/index.js` static mounts replace `express.static(__dirname)`:

```js
app.use(express.static(path.join(rootDir, "public")));
app.use("/shared", express.static(path.join(rootDir, "shared"))); // browser-importable game logic (Phase 1+)
```

`rules.md` still resolves from the repo root: `RULEBOOK_MD` is joined against the project root (one level up from `server/`), not against `server/`.

### `index.html` → `public/`

| Current lines | Content | Destination |
|---|---|---|
| 11–44 | `:root` vars, resets, scrollbar, `html/body` | `public/css/tokens.css` |
| 46–232, 415–420 | shell, topbar, messages, bubbles, dock, cmdbar, input, buttons, keyframes, reduced-motion | `public/css/app.css` |
| 234–413 | scrim, sheet, rig deck/screens/terminals/bars, add screen, pager | `public/css/rig-sheet.css` |
| 423–488 | all markup | stays in `public/index.html` |
| 520–534 | visualViewport sync | `public/js/main.js` |
| 536–629 | rig defaults, state, `localStorage`, math | `public/js/rig-state.js` |
| 631–687 | tag regex, `parseAttrs`, `applyRigCommands`, `stripRigTags`, `rigSnapshot` | `public/js/rig-tags.js` |
| 689–924 | `barClass` → deck pager, sheet open/close, add form | `public/js/rig-panel.js` |
| 926–943, 945–1062, 1117–1133 | `setStatus` → `status.js`; bubbles, `sendMessage`, clear, reasoning toggle → `chat.js` | `public/js/status.js`, `public/js/chat.js` |
| 1064–1115, 1136–1152 | STT + TTS | `public/js/speech.js` |
| 1154–1157 | boot calls + greeting | `public/js/main.js` |

The IIFE wrapper disappears (module scope replaces it). The Google Fonts `<link>`s stay in `index.html`.

### `package.json`

```json
"main": "server/index.js",
"scripts": {
  "start": "node server/index.js",
  "dev": "node --watch server/index.js",
  "preview": "set PORT=8123&& node --watch server/index.js",
  "test": "node --test shared/ server/"
}
```

`node --test <dir>` recursively picks up `*.test.js`, so colocated tests keep working without config; a directory with no test files (as `server/` is until Phase 1 Task 4) exits green, but a *nonexistent* path errors — hence the two-stage script update in the migration plan below. (`.claude/launch.json` runs the npm script by name, so it needs no change.)

## Interaction with the Phase 1 plan

**Order: this restructure lands first**, as one or more commits with zero behavior change; then Phase 1 Tasks 4–10 execute against the new paths. Tasks 1–3 of the plan are already done (test runner, `game-state.js`, tests). Path remapping for the remaining tasks:

| Phase 1 plan says | After restructure, target |
|---|---|
| Create `store.js`, `store.test.js` (Task 4) | `server/store.js`, `server/store.test.js` (import `../shared/game-state.js`) |
| Modify `server.js` — imports, store, protocol text, `/api/chat`, new routes (Task 5) | store wiring in `server/index.js`; protocol/`owner` text in `server/prompt.js`; delete legacy `RIG_DEFAULTS`/`formatRigState` from `server/prompt.js`; chat changes in `server/routes/chat.js`; new routes in **new** `server/routes/game.js` |
| Modify `index.html` — join gate (Task 6) | markup in `public/index.html`, styles in **new** `public/css/join.css`, logic in **new** `public/js/join.js` |
| Modify `index.html` — polling, `applyServerState`, delete client math (Task 7) | **new** `public/js/api.js` (poll + `applyServerState` + later `sendCommand`); deletions land in `public/js/rig-state.js` |
| Modify `index.html` — command sender, rewire buttons/tags (Task 8) | `sendCommand` in `public/js/api.js`; button rewires in `public/js/rig-panel.js`; tag rewire in `public/js/rig-tags.js` |
| Modify `index.html` — ownership render (Task 9) | `public/js/rig-panel.js` + `public/css/rig-sheet.css` |

Net effect: Phase 1's six client/server tasks touch six *different* files instead of two shared ones — they become parallelizable across agents (with only `public/index.html` markup and `main.js` wiring as small, additive merge points).

## Ownership map (who edits what)

| Task type | Files touched |
|---|---|
| Game rules / rig math / state shape | `shared/game-state.js` (+ its test) |
| Persistence | `server/store.js` (+ its test) |
| HTTP API surface | `server/routes/*.js` |
| LLM prompting / tracker protocol | `server/prompt.js` |
| Server config / wiring | `server/config.js`, `server/index.js` |
| Chat UI & streaming render | `public/js/chat.js` |
| Rig tracker UI | `public/js/rig-panel.js`, `public/css/rig-sheet.css` |
| `[[RIG]]` tag protocol (client side) | `public/js/rig-tags.js` |
| Voice (STT/TTS) | `public/js/speech.js` |
| Theming / global styles | `public/css/tokens.css`, `public/css/app.css` |
| Markup / composition | `public/index.html`, `public/js/main.js` (shared — keep edits additive) |

## Migration plan (each step independently verifiable and committable)

1. **Move shared logic.** `game-state.js` → `shared/game-state.js`, `game-state.test.js` → `shared/game-state.test.js` (fix its relative import). Set the test script to `node --test shared/`. Verify: `npm test` green.
2. **Split the server.** Create `server/config.js`, `server/prompt.js`, `server/routes/chat.js`, `server/index.js`; delete `server.js`; update `package.json` main/scripts, extending the test script to `node --test shared/ server/`. Verify: `npm test` green; `npm start`, chat round-trip works (rulebook loads, streaming answers arrive).
3. **Move and de-inline the client.** Create `public/`, move `index.html` in, extract the three CSS files and the seven JS modules, switch to `<script type="module">`, switch server static mounts to `public/` (+ `/shared`). Verify with the preview tools: page renders identically, chat streams, rig sheet opens/adds/damages/persists across reload, `[[RIG ...]]` tags from the model still apply and are stripped from display/TTS, mic + TTS still work, and `GET /server.js` now 404s.
4. **Housekeeping.** Add `.idea/` to `.gitignore`. Update README paths if any are referenced.

Rollback at any step is `git revert` of that step's commit — no step leaves the app in a mixed state.

## Testing

- **Automated:** existing `node:test` suites, relocated; `npm test` must pass after steps 1 and 2. No new tests are required by this spec (no logic changes), but the split makes the Phase-1 test targets (`shared/`, `server/`) natural homes.
- **Manual (step 3):** the preview checklist above — the client has no automated tests today and this spec does not add a client test harness (that would require new tooling, which is out of scope).

## Out of scope

- Deduplicating the three rig-math copies (Phase 1 Tasks 5 and 7 delete the server and client copies).
- Any behavior, styling, or markup change.
- A bundler, TypeScript, framework, or any new dependency.
- Client-side unit testing infrastructure.
- Splitting `rules.md` / docs.
