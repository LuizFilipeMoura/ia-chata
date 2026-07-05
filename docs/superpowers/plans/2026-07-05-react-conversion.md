# React Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the vanilla-JS client (`public/js`) as an idiomatic React + Vite + TypeScript app with pixel-identical behavior, leaving `server/` and `shared/` logic untouched.

**Architecture:** A single root `package.json` gains React/Vite/Vitest. Source lives in `client/`; Vite (root: `client`) builds to `client/dist`, which Express serves in production (one-line change). Server-synced room state flows through a `useReducer` context split into value/dispatch halves, fed by a WebSocket hook; ephemeral UI state and chat state live separately. All CSS class names/ids are preserved verbatim so the existing CSS carries over unchanged.

**Tech Stack:** React 18, Vite 5, TypeScript 5, Vitest + React Testing Library + jsdom, `concurrently` for dev. `shared/*.js` stays plain JS, typed for the client via a hand-written `client/shared.d.ts` and resolved via a Vite `/shared` alias.

**Design spec:** `docs/superpowers/specs/2026-07-05-react-conversion-design.md`

---

## Conventions used by every task

- **Markup-parity contract (READ THIS FIRST):** For every component that ports an
  existing module, the cited source file + line range is the *authoritative spec*
  for DOM structure, element order, text, `aria-*` attributes, and — critically —
  **CSS class names and element ids**. Reproduce them **exactly**; any drift breaks
  the verbatim CSS. When a task says "port markup from `tracker.js:283-437`", open
  that range and mirror its structure in JSX. This is a concrete instruction, not a
  placeholder.
- **Commit after every task** with the shown message.
- **Test runner:** `npx vitest run <path>` for client tests; `node --test <path>`
  for shared/server tests.
- **Paths** are repo-relative from `C:\Users\breke\WebstormProjects\ia-regrinha`.
- Work directly on `main` (per `AGENTS.md`). No feature branches.

---

## Phase 0 — Scaffold

### Task 1: Vite + React + TS scaffold that serves a blank page

**Files:**
- Modify: `package.json` (root)
- Create: `vite.config.ts`
- Create: `tsconfig.json`, `tsconfig.node.json`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/vite-env.d.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add dependencies and scripts to root `package.json`**

Replace the `scripts` and dependency blocks so the file reads:

```json
{
  "name": "oil-iron-master",
  "version": "1.0.0",
  "description": "Local voice-driven rules master for Of Oil and Iron, powered by Ollama + Gemma",
  "type": "module",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "dev:server": "node --watch server/index.js",
    "dev:client": "vite",
    "dev": "concurrently -n server,client -c blue,magenta \"npm:dev:server\" \"npm:dev:client\"",
    "build": "vite build",
    "preview": "set PORT=8123&& node --watch server/index.js",
    "test": "vitest run && node --test"
  },
  "engines": { "node": ">=18" },
  "dependencies": {
    "express": "^4.19.2",
    "ws": "^8.21.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "concurrently": "^8.2.2",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.3",
    "vite": "^5.3.3",
    "vitest": "^2.0.2"
  }
}
```

- [ ] **Step 2: Create `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("./shared", import.meta.url));

export default defineConfig({
  root: "client",
  plugins: [react()],
  resolve: {
    alias: [{ find: /^\/shared/, replacement: shared }],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/shared": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./client/src/test/setup.ts"],
    include: ["client/**/*.test.{ts,tsx}"],
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
});
```

- [ ] **Step 3: Create `tsconfig.json` and `tsconfig.node.json`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "paths": { "/shared/*": ["./shared/*"] }
  },
  "include": ["client/src", "client/shared.d.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `client/index.html`** (fonts preserved verbatim from `public/index.html:7-9`)

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<title>Of Oil and Iron — Rig Control Terminal</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
</head>
<body>
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: Create `client/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: Create `client/src/App.tsx` and `client/src/main.tsx`**

`client/src/App.tsx`:

```tsx
export default function App() {
  return <div>Oil &amp; Iron — React shell</div>;
}
```

`client/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Add build output + tool caches to `.gitignore`**

Append these lines to `.gitignore`:

```
client/dist
node_modules
.vite
```

- [ ] **Step 8: Install and verify the dev server renders**

Run: `npm install`
Then run: `npx vite` (Ctrl-C after checking)
Expected: Vite prints `Local: http://localhost:5173/`; opening it shows "Oil & Iron — React shell" with no console errors.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json client/index.html client/src/main.tsx client/src/App.tsx client/src/vite-env.d.ts .gitignore
git commit -m "chore: scaffold Vite + React + TS client"
```

---

### Task 2: Vitest setup file + smoke test

**Files:**
- Create: `client/src/test/setup.ts`
- Test: `client/src/App.test.tsx`

- [ ] **Step 1: Create the Testing Library setup file**

`client/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Write a smoke render test**

`client/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the shell", () => {
  render(<App />);
  expect(screen.getByText(/React shell/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run client/src/App.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add client/src/test/setup.ts client/src/App.test.tsx
git commit -m "test: add Vitest + Testing Library smoke test"
```

---

## Phase 1 — Styles and pure-logic ports

### Task 3: Copy CSS verbatim

**Files:**
- Create: `client/src/styles/{tokens,app,rig-sheet,battle,join,glossary,rig-wizard}.css` (copied byte-for-byte from `public/css/`)
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Copy each CSS file unchanged**

Copy the contents of each `public/css/*.css` file into the matching
`client/src/styles/*.css`. Do not edit them.

- [ ] **Step 2: Import them once, in load order, at the top of `client/src/main.tsx`**

Add above the existing imports (order matters — tokens first, matching
`public/index.html:10-16`):

```tsx
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/rig-sheet.css";
import "./styles/battle.css";
import "./styles/join.css";
import "./styles/glossary.css";
import "./styles/rig-wizard.css";
```

- [ ] **Step 3: Verify styles load**

Run: `npx vite` then open `http://localhost:5173/`.
Expected: the page background/fonts match the old app's dark terminal theme (body
picks up `--bg` from tokens.css). Ctrl-C when confirmed.

- [ ] **Step 4: Commit**

```bash
git add client/src/styles client/src/main.tsx
git commit -m "chore: port CSS verbatim into the React client"
```

---

### Task 4: `shared.d.ts` — type the shared modules the client imports

**Files:**
- Create: `client/shared.d.ts`

The client imports from `/shared/game-state.js`, `/shared/battle-view.js`, and
`/shared/glossary.js`. Declare exactly the members the client uses (verified
against `shared/game-state.js`, `shared/battle-view.js`, `shared/glossary.js`).

- [ ] **Step 1: Create `client/shared.d.ts`**

```ts
import type { Rig, GameState, Turn } from "./src/state/types";

declare module "/shared/game-state.js" {
  export const MAX_RIGS_PER_SIDE: number;
  export const MAX_RIGS_TOTAL: number;
  export const SUPPORTED_RIG_CLASSES: string[];
  export const WEAPONS: Record<string, string[]>;
  export const EQUIPMENT: Record<string, { label: string; passive: string; active?: string }>;
  export const WEAPON_UPGRADES: Record<string, Array<{ id: string; name: string; [k: string]: unknown }>>;
  export const RIG_DEFAULTS: Record<string, { hull: number; arms: number; legs: number; engine: number }>;
  export function canAddRigForSide(room: { rigs: Rig[]; game?: GameState | null }, sideId: string): boolean;
  export function heatMeter(rig: Rig): {
    heat: number; cap: number; floor: number; over: number; bonus: number;
    zone: "cold" | "cool" | "warm" | "redline" | "over";
  };
  export function defaultWeaponUpgrade(weaponName: string): string;
  export function normalizeWeaponUpgrade(weaponName: string, upgradeId?: string | null): string;
  export function upgradeForWeapon(weaponName: string, upgradeId?: string | null): { id: string; name: string } | null;
}

declare module "/shared/battle-view.js" {
  export function availableActions(rig: Rig, turn: Turn): Array<{
    key: string; label: string; enabled: boolean; heat: number; cost?: number; note?: string;
  }>;
  export function actionBudget(rig: Rig, turn: Turn): {
    used: number; left: number; max: number; reduced: boolean;
  };
  export function rigModifiers(rig: Rig): Array<{ tag: string; tone: string }>;
  export function phaseSummary(game: GameState, rigs: Rig[]): {
    label: string; round: number; turnSide?: string | null; turnName?: string;
    activeName?: string; answerTokens: Record<string, number>;
  };
  export function outcomeText(outcome: unknown, sides: unknown): string;
}

declare module "/shared/glossary.js" {
  export const GLOSSARY: Array<{ id: string; term: string; def: string; match: string[] }>;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors referencing `/shared/*` modules. (Errors about missing
`./src/state/types` are fixed in Task 5 — if you run this before Task 5, expect
only that one unresolved-import error.)

- [ ] **Step 3: Commit**

```bash
git add client/shared.d.ts
git commit -m "types: declare shared game modules for the TS client"
```

---

### Task 5: Client domain types

**Files:**
- Create: `client/src/state/types.ts`

Derived from `makeRig` (`shared/game-state.js:261-303`) and `publicState`
(`shared/game-state.js:924-940`). Type the fields the client reads; keep
open-ended parts as optional.

- [ ] **Step 1: Create `client/src/state/types.ts`**

```ts
export type Loc = "hull" | "arms" | "legs" | "engine";

export interface Component {
  sp: number;
  max: number;
  destroyed: boolean;
}
export interface Engine extends Component {
  heat: number;
}

export interface Rig {
  id: number;
  name: string;
  weightClass: "light" | "medium";
  owner: "a" | "b";
  hull: Component;
  arms: Component;
  legs: Component;
  engine: Engine;
  weapons?: { longRange: string; melee: string };
  weaponUpgrades?: { longRange: string; melee: string };
  equipment: string | null;
  activated: boolean;
  destroyed: boolean;
}

export interface Side {
  id: string;
  name: string;
  vp: number;
  ready: boolean;
}

export interface Turn {
  side: string;
  activeRigId: number | null;
  actionsUsed: number;
  actionsMax: number;
}

export interface Resolution {
  id: number;
  kind?: string;
  rigId?: number;
  summary?: string;
  effects?: string[];
  rolls?: Array<{ sides: number; value: number; label?: string }>;
}

export interface GameState {
  round: number;
  phase: string;
  started: boolean;
  autoResolve?: boolean;
  sides: Side[];
  turn?: Turn | null;
  bounties?: Record<string, number>;
  outcome?: unknown;
  resolutions?: Resolution[];
  recoveryVp?: Record<string, unknown>;
  pendingBlast?: unknown;
}

export interface Session {
  room: string;
  side: string;
  name: string;
}

/** The `state` field of a `{ version, state }` server payload (publicState). */
export interface ServerState {
  code?: string;
  version: number;
  rigs: Rig[];
  game: GameState | null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/state/types.ts
git commit -m "types: add client domain types (Rig, GameState, ServerState)"
```

---

### Task 6: Port `markdown.ts` (TDD — port the existing test first)

**Files:**
- Create: `client/src/lib/markdown.ts`
- Test: `client/src/lib/markdown.test.ts`

- [ ] **Step 1: Write the failing test** (ported from `public/markdown.test.js`, plus keep the `renderMarkdown`-free API)

`client/src/lib/markdown.test.ts`:

```ts
import { markdownToHtml } from "./markdown";

test("markdownToHtml renders common Gemma markdown", () => {
  const html = markdownToHtml(
    ["## Attack Result", "", "**Hit:** roll `2d6`.", "", "- Apply damage", "- Mark heat"].join("\n"),
  );
  expect(html).toMatch(/<h2>Attack Result<\/h2>/);
  expect(html).toMatch(/<strong>Hit:<\/strong>/);
  expect(html).toMatch(/<code>2d6<\/code>/);
  expect(html).toMatch(/<ul><li>Apply damage<\/li><li>Mark heat<\/li><\/ul>/);
});

test("markdownToHtml escapes raw HTML and unsafe links", () => {
  const html = markdownToHtml("Hello <img src=x onerror=alert(1)> [bad](javascript:alert(1))");
  expect(html).not.toMatch(/<img/i);
  expect(html).toMatch(/&lt;img src=x onerror=alert\(1\)&gt;/);
  expect(html).toMatch(/<a href="#">bad<\/a>/);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run client/src/lib/markdown.test.ts`
Expected: FAIL — cannot find module `./markdown`.

- [ ] **Step 3: Port the implementation**

Copy `public/js/markdown.js` lines 1-122 verbatim into
`client/src/lib/markdown.ts`, with two changes:
1. Type the two exported signatures: `export function markdownToHtml(markdown: string): string`.
2. **Drop** `renderMarkdown` (the DOM helper) — React renders HTML via
   `dangerouslySetInnerHTML`, so it's unused. Keep everything else identical
   (`escapeHtml`, `sanitizeHref`, `stashToken`, `renderInline`, `isBlockStart`).

Add types to the internal helpers as needed (all params are strings; `stashToken`
takes `(tokens: string[], html: string)`).

- [ ] **Step 4: Run the test**

Run: `npx vitest run client/src/lib/markdown.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/markdown.ts client/src/lib/markdown.test.ts
git commit -m "feat: port markdown renderer to TS with tests"
```

---

### Task 7: Port `rigTags.ts` (parser only — no side effects)

**Files:**
- Create: `client/src/lib/rigTags.ts`
- Test: `client/src/lib/rigTags.test.ts`

The original `applyRigCommands` calls `sendCommand` directly. Split that: the lib
becomes a pure **parser** returning commands; the caller (chat, Task 37) dispatches
them. `stripRigTags` ports verbatim.

- [ ] **Step 1: Write the failing test**

`client/src/lib/rigTags.test.ts`:

```ts
import { parseRigCommands, stripRigTags } from "./rigTags";

test("parseRigCommands extracts verb + attrs from each tag", () => {
  const cmds = parseRigCommands('ok [[RIG damage name="Stalker" loc="hull" amount="3"]] done');
  expect(cmds).toEqual([{ verb: "damage", attrs: { name: "Stalker", loc: "hull", amount: "3" } }]);
});

test("stripRigTags removes complete and half-streamed tags", () => {
  expect(stripRigTags('Hit! [[RIG damage name="X"]] rest')).toBe("Hit!  rest".trim());
  expect(stripRigTags("Streaming [[RIG damage nam")).toBe("Streaming");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run client/src/lib/rigTags.test.ts`
Expected: FAIL — cannot find module `./rigTags`.

- [ ] **Step 3: Implement**

`client/src/lib/rigTags.ts`:

```ts
export interface RigCommand {
  verb: string;
  attrs: Record<string, string>;
}

const RIG_TAG_RE = /\[\[RIG\b([^\]]*?)\]\]/gi;

function parseAttrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) attrs[m[1].toLowerCase()] = m[2];
  return attrs;
}

/** Parse every [[RIG ...]] command out of `text`. Pure — the caller dispatches. */
export function parseRigCommands(text: string): RigCommand[] {
  RIG_TAG_RE.lastIndex = 0;
  const out: RigCommand[] = [];
  let match: RegExpExecArray | null;
  while ((match = RIG_TAG_RE.exec(text))) {
    const body = match[1].trim();
    const verb = (body.split(/\s+/)[0] || "").toLowerCase();
    out.push({ verb, attrs: parseAttrs(body) });
  }
  return out;
}

/** Remove command tags (and any trailing half-streamed tag) for display + speech. */
export function stripRigTags(text: string): string {
  return text
    .replace(RIG_TAG_RE, "")
    .replace(/\[\[RIG\b[^\]]*$/i, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run client/src/lib/rigTags.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/rigTags.ts client/src/lib/rigTags.test.ts
git commit -m "feat: port rig-tag parser to TS as a pure function"
```

---

### Task 8: Port glossary matching into a pure tokenizer

**Files:**
- Create: `client/src/lib/glossaryTerms.ts`
- Test: `client/src/lib/glossaryTerms.test.ts`

Replaces the DOM-walking `highlightGlossary` (`glossary.js`) with a pure tokenizer
returning text/term segments; the `<GlossaryText>` component (Task 35) renders
them. Longest-match-first ordering is preserved from `glossary.js:5-15`.

- [ ] **Step 1: Write the failing test**

`client/src/lib/glossaryTerms.test.ts`:

```ts
import { tokenizeGlossary, glossaryById } from "./glossaryTerms";

test("tokenizeGlossary splits recognized terms into term segments", () => {
  const segs = tokenizeGlossary("Watch the Heat and the Hull.");
  const terms = segs.filter((s) => s.kind === "term").map((s) => s.text);
  expect(terms).toContain("Heat");
  expect(terms).toContain("Hull");
  const rejoined = segs.map((s) => s.text).join("");
  expect(rejoined).toBe("Watch the Heat and the Hull.");
});

test("glossaryById resolves a term entry", () => {
  const anyId = tokenizeGlossary("Heat").find((s) => s.kind === "term")!.id!;
  expect(glossaryById(anyId)?.term).toBeTruthy();
});
```

(If the exact terms `Heat`/`Hull` are not in `shared/glossary.js`, substitute two
real terms — inspect `GLOSSARY[].match` first and adjust the assertion.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run client/src/lib/glossaryTerms.test.ts`
Expected: FAIL — cannot find module `./glossaryTerms`.

- [ ] **Step 3: Implement**

`client/src/lib/glossaryTerms.ts`:

```ts
import { GLOSSARY } from "/shared/glossary.js";

export interface GlossaryEntry { id: string; term: string; def: string; match: string[] }
export interface Segment { kind: "text" | "term"; text: string; id?: string; term?: string }

const byMatch = new Map<string, GlossaryEntry>();
for (const entry of GLOSSARY) for (const m of entry.match) byMatch.set(m, entry);
const byId = new Map(GLOSSARY.map((e) => [e.id, e]));

const alternatives = [...byMatch.keys()].sort((a, b) => b.length - a.length);
function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
const pattern = new RegExp(`\\b(${alternatives.map(escapeRegExp).join("|")})\\b`, "g");

export function glossaryById(id: string): GlossaryEntry | undefined { return byId.get(id); }

/** Split plain text into text/term segments; concatenating .text yields the input. */
export function tokenizeGlossary(text: string): Segment[] {
  const segs: Segment[] = [];
  pattern.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m.index > last) segs.push({ kind: "text", text: text.slice(last, m.index) });
    const entry = byMatch.get(m[0])!;
    segs.push({ kind: "term", text: m[0], id: entry.id, term: entry.term });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ kind: "text", text: text.slice(last) });
  return segs;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run client/src/lib/glossaryTerms.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/glossaryTerms.ts client/src/lib/glossaryTerms.test.ts
git commit -m "feat: port glossary matching to a pure tokenizer"
```

---

## Phase 2 — State and hooks

### Task 9: Room-state reducer + split contexts + session persistence

**Files:**
- Create: `client/src/state/roomReducer.ts`
- Create: `client/src/state/RoomStateContext.tsx`
- Create: `client/src/state/session.ts`
- Test: `client/src/state/roomReducer.test.ts`

Mirrors `state.js`: `applyServerState` adopts `{ rigs, game, version }`; session
persists to `localStorage` key `ooi-session-v1`.

- [ ] **Step 1: Write the failing reducer test**

`client/src/state/roomReducer.test.ts`:

```ts
import { roomReducer, initialRoomState } from "./roomReducer";
import type { ServerState } from "./types";

test("applyServerState adopts rigs, game, version", () => {
  const state: ServerState = { version: 4, rigs: [], game: { round: 1 } as never };
  const next = roomReducer(initialRoomState, { type: "applyServerState", state });
  expect(next.stateVersion).toBe(4);
  expect(next.game).toBe(state.game);
  expect(next.rigs).toBe(state.rigs);
});

test("setSession stores the session", () => {
  const s = { room: "IRON42", side: "a", name: "Lu" };
  const next = roomReducer(initialRoomState, { type: "setSession", session: s });
  expect(next.session).toEqual(s);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run client/src/state/roomReducer.test.ts`
Expected: FAIL — cannot find module `./roomReducer`.

- [ ] **Step 3: Implement `session.ts`**

```ts
import type { Session } from "./types";

const SESSION_KEY = "ooi-session-v1";

export function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
```

- [ ] **Step 4: Implement `roomReducer.ts`**

```ts
import type { Rig, GameState, Session, ServerState } from "./types";

export interface RoomState {
  rigs: Rig[];
  game: GameState | null;
  stateVersion: number;
  session: Session | null;
}

export const initialRoomState: RoomState = {
  rigs: [], game: null, stateVersion: -1, session: null,
};

export type RoomAction =
  | { type: "applyServerState"; state: ServerState | null | undefined }
  | { type: "setSession"; session: Session };

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "applyServerState": {
      const s = action.state;
      if (!s) return state;
      return {
        ...state,
        rigs: Array.isArray(s.rigs) ? s.rigs : [],
        game: s.game ?? null,
        stateVersion: s.version ?? state.stateVersion,
      };
    }
    case "setSession":
      return { ...state, session: action.session };
    default:
      return state;
  }
}

export function findRig(rigs: Rig[], name?: string | null): Rig | null {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  return rigs.find((r) => r.name.toLowerCase() === n) ?? null;
}
```

- [ ] **Step 5: Implement `RoomStateContext.tsx` (split value/dispatch)**

```tsx
import { createContext, useContext, useReducer, useEffect, type ReactNode } from "react";
import { roomReducer, initialRoomState, type RoomState, type RoomAction } from "./roomReducer";
import { loadSession, saveSession } from "./session";

const StateCtx = createContext<RoomState | null>(null);
const DispatchCtx = createContext<React.Dispatch<RoomAction> | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(roomReducer, initialRoomState, (base) => ({
    ...base, session: loadSession(),
  }));

  // Persist the session whenever it changes.
  useEffect(() => {
    if (state.session) saveSession(state.session);
  }, [state.session]);

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useRoomState(): RoomState {
  const v = useContext(StateCtx);
  if (!v) throw new Error("useRoomState outside RoomProvider");
  return v;
}
export function useRoomDispatch(): React.Dispatch<RoomAction> {
  const v = useContext(DispatchCtx);
  if (!v) throw new Error("useRoomDispatch outside RoomProvider");
  return v;
}
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run client/src/state/roomReducer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add client/src/state/roomReducer.ts client/src/state/roomReducer.test.ts client/src/state/RoomStateContext.tsx client/src/state/session.ts
git commit -m "feat: room-state reducer with split value/dispatch contexts"
```

---

### Task 10: UI-state context (ephemeral, separate from server state)

**Files:**
- Create: `client/src/state/UiStateContext.tsx`

Holds ephemeral local view state so WebSocket pushes never re-render it:
`chatOpen`, `expandedRigs` (Set of ids), `activeRigId` (pre-battle heat preview) —
mirroring `tracker.js:22-24`.

- [ ] **Step 1: Implement `UiStateContext.tsx`**

```tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface UiState {
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  expandedRigs: Set<number>;
  toggleExpanded: (id: number) => void;
  activeRigId: number | null;
  setActiveRig: (id: number | null) => void;
}

const Ctx = createContext<UiState | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [expandedRigs, setExpanded] = useState<Set<number>>(new Set());
  const [activeRigId, setActiveRigId] = useState<number | null>(null);

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const setActiveRig = useCallback((id: number | null) => {
    setActiveRigId(id);
    if (id != null) setExpanded((prev) => new Set(prev).add(id));
  }, []);

  return (
    <Ctx.Provider value={{ chatOpen, setChatOpen, expandedRigs, toggleExpanded, activeRigId, setActiveRig }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUi(): UiState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi outside UiProvider");
  return v;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/state/UiStateContext.tsx
git commit -m "feat: ephemeral UI-state context"
```

---

### Task 11: `useRoomSocket` — WebSocket push with reconnect backoff

**Files:**
- Create: `client/src/hooks/useRoomSocket.ts`
- Test: `client/src/hooks/useRoomSocket.test.tsx`

Ports `startSocket` (`api.js:20-53`). Effect opens the socket, dispatches
`applyServerState` on each message, reconnects with 1s→2s→4s (cap 5s) backoff, and
**cleans up on unmount** (closes socket + clears timer) so React StrictMode's
double-mount doesn't leak a second socket.

- [ ] **Step 1: Write the failing test** (fake WebSocket)

`client/src/hooks/useRoomSocket.test.tsx`:

```tsx
import { render, act } from "@testing-library/react";
import { useRoomSocket } from "./useRoomSocket";

class FakeWS {
  static last: FakeWS | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => this.onclose?.());
  constructor(public url: string) { FakeWS.last = this; }
}

function Harness({ onState }: { onState: (s: unknown) => void }) {
  useRoomSocket({ room: "IRON42", side: "a" }, onState);
  return null;
}

test("dispatches parsed server state on message", () => {
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  const onState = vi.fn();
  render(<Harness onState={onState} />);
  act(() => {
    FakeWS.last!.onmessage!({ data: JSON.stringify({ version: 2, state: { version: 2, rigs: [], game: null } }) });
  });
  expect(onState).toHaveBeenCalledWith({ version: 2, rigs: [], game: null });
});

test("closes the socket on unmount", () => {
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  const { unmount } = render(<Harness onState={() => {}} />);
  const ws = FakeWS.last!;
  unmount();
  expect(ws.close).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run client/src/hooks/useRoomSocket.test.tsx`
Expected: FAIL — cannot find module `./useRoomSocket`.

- [ ] **Step 3: Implement**

```ts
import { useEffect, useRef } from "react";
import type { ServerState } from "../state/types";

const MAX_RECONNECT_DELAY = 5000;

function socketUrl(room: string, side?: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ room });
  if (side) params.set("side", side);
  return `${proto}//${location.host}/ws?${params.toString()}`;
}

/** Opens the room push channel; dispatches each state payload. Reconnects with backoff. */
export function useRoomSocket(
  session: { room: string; side?: string } | null,
  onState: (state: ServerState) => void,
): void {
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    if (!session?.room) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let delay = 1000;
    let closed = false;

    const connect = () => {
      socket = new WebSocket(socketUrl(session.room, session.side));
      socket.onopen = () => { delay = 1000; };
      socket.onmessage = (event) => {
        const { state } = JSON.parse(event.data);
        onStateRef.current(state);
      };
      socket.onclose = () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      };
      socket.onerror = () => socket?.close();
    };
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [session?.room, session?.side]);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run client/src/hooks/useRoomSocket.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useRoomSocket.ts client/src/hooks/useRoomSocket.test.tsx
git commit -m "feat: useRoomSocket hook with reconnect backoff and cleanup"
```

---

### Task 12: `useCommands` — POST a mutation, optimistically adopt the response

**Files:**
- Create: `client/src/hooks/useCommands.ts`

Ports `sendCommand` (`api.js:7-18`). Returns a stable `sendCommand(verb, attrs)`;
POSTs to `/api/game/<room>/command`, dispatches `applyServerState` on the response.

- [ ] **Step 1: Implement**

```ts
import { useCallback } from "react";
import { useRoomState, useRoomDispatch } from "../state/RoomStateContext";

export function useCommands() {
  const { session } = useRoomState();
  const dispatch = useRoomDispatch();

  return useCallback(
    async (verb: string, attrs: Record<string, unknown> = {}) => {
      if (!session?.room) return;
      try {
        const resp = await fetch(`/api/game/${encodeURIComponent(session.room)}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cmd: { verb, attrs }, side: session.side }),
        });
        if (!resp.ok) return;
        const { state } = await resp.json();
        dispatch({ type: "applyServerState", state });
      } catch { /* the socket will deliver the eventual state */ }
    },
    [session?.room, session?.side, dispatch],
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useCommands.ts
git commit -m "feat: useCommands hook (POST + optimistic apply)"
```

---

### Task 13: `useViewportHeight` — keyboard-safe `--app-h`

**Files:**
- Create: `client/src/hooks/useViewportHeight.ts`

Ports `main.js:15-29`.

- [ ] **Step 1: Implement**

```ts
import { useEffect } from "react";

/** Track visualViewport height into --app-h so the dock stays above the keyboard. */
export function useViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const h = vv.height;
      if (!h || h < 1) return;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useViewportHeight.ts
git commit -m "feat: useViewportHeight hook for keyboard-safe layout"
```

---

### Task 14: `useSpeech` — STT + TTS

**Files:**
- Create: `client/src/hooks/useSpeech.ts`

Ports `speech.js`. Returns `{ supported, recording, toggleMic, tts, setTts, speak }`.
`onTranscript` is supplied by the caller (chat). STT `lang` comes from the caller.

- [ ] **Step 1: Implement**

```ts
import { useCallback, useEffect, useRef, useState } from "react";

interface UseSpeechOpts {
  lang: string;
  onTranscript: (text: string) => void;
}

export function useSpeech({ lang, onTranscript }: UseSpeechOpts) {
  const Impl = (window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }).SpeechRecognition ?? (window as unknown as {
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }).webkitSpeechRecognition;

  const supported = Boolean(Impl);
  const [recording, setRecording] = useState(false);
  const [tts, setTts] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    if (!Impl) return;
    const rec = new Impl();
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setRecording(true);
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    rec.onresult = (e: SpeechRecognitionEvent) =>
      onTranscriptRef.current(e.results[0][0].transcript);
    recRef.current = rec;
    return () => { rec.onresult = null; rec.abort?.(); };
  }, [Impl]);

  const toggleMic = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    if (recording) { rec.stop(); return; }
    rec.lang = langRef.current;
    try { rec.start(); } catch { /* ignore duplicate start */ }
  }, [recording]);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    const voices = window.speechSynthesis.getVoices();
    const pt = voices.find((v) => v.lang === "pt-BR") || voices.find((v) => v.lang?.startsWith("pt"));
    if (pt) u.voice = pt;
    window.speechSynthesis.speak(u);
  }, []);

  const setTtsGuarded = useCallback((v: boolean) => {
    setTts(v);
    if (!v) window.speechSynthesis?.cancel();
  }, []);

  return { supported, recording, toggleMic, tts, setTts: setTtsGuarded, speak };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors. (If `SpeechRecognition` types are missing, add
`// @ts-expect-error – vendor-prefixed API` above the `Impl` cast rather than
adding a dependency.)

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useSpeech.ts
git commit -m "feat: useSpeech hook (STT + TTS)"
```

---

## Phase 3 — Entry point and shell

### Task 15: `JoinGate`

**Files:**
- Create: `client/src/components/JoinGate.tsx`
- Test: `client/src/components/JoinGate.test.tsx`

Port markup from `public/index.html:29-43` and reactive logic from `join.js:18-63`.
**Preserve class names** `join-gate/join-card/join-title/join-sub/join-input/join-sides/join-side/join-btn/join-hint/join-err`. Calls a `onJoin(room, name, side)` prop.

- [ ] **Step 1: Write the failing test**

`client/src/components/JoinGate.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JoinGate } from "./JoinGate";

test("enables Enter only after room + side chosen and calls onJoin uppercased", async () => {
  const onJoin = vi.fn();
  render(<JoinGate onJoin={onJoin} />);
  const enter = screen.getByRole("button", { name: /enter room/i });
  expect(enter).toBeDisabled();
  await userEvent.type(screen.getByPlaceholderText(/room code/i), "iron42");
  await userEvent.type(screen.getByPlaceholderText(/your name/i), "Lu");
  await userEvent.click(screen.getByRole("button", { name: /You \(Side A\)/i }));
  expect(enter).toBeEnabled();
  await userEvent.click(enter);
  expect(onJoin).toHaveBeenCalledWith("IRON42", "Lu", "a");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run client/src/components/JoinGate.test.tsx`
Expected: FAIL — cannot find module `./JoinGate`.

- [ ] **Step 3: Implement**

```tsx
import { useMemo, useState } from "react";

interface Props {
  onJoin: (room: string, name: string, side: string) => Promise<void> | void;
  error?: string;
}

export function JoinGate({ onJoin, error }: Props) {
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [side, setSide] = useState<string | null>(null);

  const hint = useMemo(() => {
    if (!room.trim()) return "Enter a room code.";
    if (!name.trim()) return "Enter your name.";
    if (!side) return "Pick a side to continue.";
    return "Ready — tap Enter room.";
  }, [room, name, side]);
  const ready = Boolean(room.trim() && side);

  return (
    <div className="join-gate">
      <div className="join-card">
        <h1 className="join-title">OIL <i>&amp;</i> IRON</h1>
        <p className="join-sub">Enter a battle room</p>
        <input className="join-input" placeholder="Room code (e.g. IRON42)" autoComplete="off"
          value={room} onChange={(e) => setRoom(e.target.value)} />
        <input className="join-input" placeholder="Your name" autoComplete="off"
          value={name} onChange={(e) => setName(e.target.value)} />
        <div className="join-sides">
          <button className={`join-side${side === "a" ? " active" : ""}`} type="button"
            onClick={() => setSide("a")}>You (Side A)</button>
          <button className={`join-side${side === "b" ? " active" : ""}`} type="button"
            onClick={() => setSide("b")}>Enemy (Side B)</button>
        </div>
        <button className="join-btn btn btn--primary" type="button" disabled={!ready}
          onClick={() => onJoin(room.trim().toUpperCase(), name.trim() || "Player", side!)}>
          Enter room
        </button>
        <p className={`join-hint${hint.startsWith("Ready") ? " join-hint--go" : ""}`}>{hint}</p>
        <p className="join-err">{error ?? ""}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run client/src/components/JoinGate.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/JoinGate.tsx client/src/components/JoinGate.test.tsx
git commit -m "feat: JoinGate component"
```

---

### Task 16: App wiring — providers, join flow, socket, gate-vs-terminal

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/main.tsx`
- Create: `client/src/components/Terminal.tsx` (temporary placeholder body)

Ports the join fetch (`join.js:43-55`) and the boot flow (`main.js:31-38`).

- [ ] **Step 1: Wrap the app in providers in `main.tsx`**

Change the render call in `client/src/main.tsx` to:

```tsx
import { RoomProvider } from "./state/RoomStateContext";
import { UiProvider } from "./state/UiStateContext";
// ...css imports unchanged...

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RoomProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </RoomProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: Create a placeholder `Terminal.tsx`**

```tsx
export function Terminal() {
  return <div className="term"><header className="topbar">OIL &amp; IRON</header></div>;
}
```

- [ ] **Step 3: Implement `App.tsx` (join flow + gate/terminal switch + socket)**

```tsx
import { useCallback, useState } from "react";
import { useRoomState, useRoomDispatch } from "./state/RoomStateContext";
import { useRoomSocket } from "./hooks/useRoomSocket";
import { useViewportHeight } from "./hooks/useViewportHeight";
import { JoinGate } from "./components/JoinGate";
import { Terminal } from "./components/Terminal";
import type { ServerState } from "./state/types";

export default function App() {
  const { session } = useRoomState();
  const dispatch = useRoomDispatch();
  const [joinError, setJoinError] = useState("");
  useViewportHeight();

  const applyState = useCallback(
    (state: ServerState) => dispatch({ type: "applyServerState", state }),
    [dispatch],
  );
  useRoomSocket(session, applyState);

  const onJoin = useCallback(async (room: string, name: string, side: string) => {
    setJoinError("");
    try {
      const resp = await fetch(`/api/game/${encodeURIComponent(room)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, side }),
      });
      if (!resp.ok) throw new Error(`join failed (${resp.status})`);
      const data = await resp.json();
      if (!data.side) throw new Error("Room is full.");
      dispatch({ type: "setSession", session: { room, side: data.side, name } });
      dispatch({ type: "applyServerState", state: data.state });
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Join failed");
    }
  }, [dispatch]);

  if (!session?.room) return <JoinGate onJoin={onJoin} error={joinError} />;
  return <Terminal />;
}
```

- [ ] **Step 4: Manual verify against the real server**

Terminal 1: `npm run dev:server`. Terminal 2: `npx vite`.
Open `http://localhost:5173/`, enter a room + name, pick a side, Enter.
Expected: the gate disappears, the placeholder terminal shows, and the Network tab
shows a successful `POST /api/game/<room>/join` and an open `/ws` connection.
Refresh: it should skip the gate (session persisted). Ctrl-C both.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/main.tsx client/src/components/Terminal.tsx
git commit -m "feat: app boot — providers, join flow, socket, gate/terminal switch"
```

---

### Task 17: Terminal shell (Topbar + Stage skeleton)

**Files:**
- Modify: `client/src/components/Terminal.tsx`
- Create: `client/src/components/Topbar.tsx`
- Create: `client/src/components/Stage.tsx`

Port the shell markup from `public/index.html:45-85` (topbar + `<main id="stage">`
with `stage-head` / `rigDeckTitle`). **Preserve** `term/topbar/brand-mark/brand-name/brand-sub/stage/stage-head` class names and the `#stage` id. Leave slots
(comments) where `BattleHud`, `RigDeck`, `BattleSetup` mount in later tasks.

- [ ] **Step 1: Implement `Topbar.tsx`** (from `index.html:46-50`)

```tsx
export function Topbar() {
  return (
    <header className="topbar">
      <span className="brand-mark">⚙</span>
      <span className="brand-name">OIL <i>&amp;</i> IRON</span>
      <span className="brand-sub">RIG CONTROL TERMINAL</span>
    </header>
  );
}
```

- [ ] **Step 2: Implement `Stage.tsx`** (from `index.html:52-85`, slots for later)

```tsx
export function Stage() {
  return (
    <main id="stage" className="stage">
      <div className="stage-head">
        <h1 id="rigDeckTitle">Squadron Status</h1>
      </div>
      {/* BattleHud mounts here (Task 24) */}
      {/* RigDeck mounts here (Task 21) */}
      {/* BattleSetup mounts here (Task 23) */}
    </main>
  );
}
```

- [ ] **Step 3: Implement `Terminal.tsx`**

```tsx
import { Topbar } from "./Topbar";
import { Stage } from "./Stage";

export function Terminal() {
  return (
    <div className="term">
      <Topbar />
      <Stage />
      {/* ChatFab + ChatPanel mount here (Task 34) */}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run dev (`npm run dev:server` + `npx vite`), join a room.
Expected: the top bar and "Squadron Status" heading render in the terminal frame.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Terminal.tsx client/src/components/Topbar.tsx client/src/components/Stage.tsx
git commit -m "feat: terminal shell (Topbar + Stage skeleton)"
```

---

## Phase 4 — Tracker core

### Task 18: Rig-view helper functions (pure)

**Files:**
- Create: `client/src/lib/rigView.ts`
- Test: `client/src/lib/rigView.test.ts`

Ports the pure helpers from `tracker.js`: `barClass` (26-33), `rigStatus`
(273-279), `ownerLabel` (35-37), `orderedRigs` (39-46). `ownerLabel`/`orderedRigs`
take `mySide` as a parameter (no global `S`).

- [ ] **Step 1: Write the failing test**

`client/src/lib/rigView.test.ts`:

```ts
import { barClass, rigStatus, orderedRigs } from "./rigView";
import type { Rig } from "../state/types";

const comp = (sp: number, max: number, destroyed = false) => ({ sp, max, destroyed });
const rig = (over: Partial<Rig>): Rig => ({
  id: 1, name: "R", weightClass: "medium", owner: "a",
  hull: comp(6, 6), arms: comp(5, 5), legs: comp(5, 5),
  engine: { ...comp(5, 5), heat: 0 }, equipment: null,
  activated: false, destroyed: false, ...over,
});

test("barClass maps SP ratios to fill classes", () => {
  expect(barClass(comp(0, 6))).toBe("rig-fill-crit");
  expect(barClass(comp(6, 6))).toBe("rig-fill-ok");
  expect(barClass(comp(2, 6))).toBe("rig-fill-low");
  expect(barClass({ ...comp(0, 6), destroyed: true })).toBe("rig-fill-dead");
});

test("rigStatus flags catastrophic when any component is at 0", () => {
  expect(rigStatus(rig({ arms: comp(0, 5) })).cls).toBe("crit");
});

test("orderedRigs lists my side first", () => {
  const mine = rig({ id: 1, owner: "a" });
  const foe = rig({ id: 2, owner: "b" });
  expect(orderedRigs([foe, mine], "a").map((r) => r.id)).toEqual([1, 2]);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run client/src/lib/rigView.test.ts`
Expected: FAIL — cannot find module `./rigView`.

- [ ] **Step 3: Implement**

```ts
import type { Rig, Component, Loc } from "../state/types";

const LOCS: Loc[] = ["hull", "arms", "legs", "engine"];

export function barClass(c: Component): string {
  if (c.destroyed) return "rig-fill-dead";
  if (c.sp === 0) return "rig-fill-crit";
  const ratio = c.sp / c.max;
  if (ratio <= 0.34) return "rig-fill-low";
  if (ratio <= 0.67) return "rig-fill-warn";
  return "rig-fill-ok";
}

export function rigStatus(rig: Rig): { text: string; cls: string } {
  if (rig.destroyed) return { text: "⛔ System failure — destroyed", cls: "crit" };
  if (LOCS.some((l) => rig[l].sp === 0)) return { text: "⚠ Catastrophic damage", cls: "crit" };
  if (LOCS.some((l) => rig[l].sp / rig[l].max <= 0.34)) return { text: "▲ Heavy damage — operational", cls: "warn" };
  if (LOCS.some((l) => rig[l].sp < rig[l].max)) return { text: "◆ Damaged — operational", cls: "warn" };
  return { text: "● All systems nominal", cls: "" };
}

export function ownerLabel(owner: string | undefined, mySide: string): string {
  return (owner || "a") === mySide ? "Your Squadron" : "Enemy";
}

export function orderedRigs(rigs: Rig[], mySide: string): Rig[] {
  const enemy = mySide === "a" ? "b" : "a";
  return [
    ...rigs.filter((r) => (r.owner || "a") === mySide),
    ...rigs.filter((r) => (r.owner || "a") === enemy),
  ];
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run client/src/lib/rigView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/rigView.ts client/src/lib/rigView.test.ts
git commit -m "feat: pure rig-view helpers with tests"
```

---

### Task 19: `CompRow` and `HeatGauge`

**Files:**
- Create: `client/src/components/rig/CompRow.tsx`
- Create: `client/src/components/rig/HeatGauge.tsx`

Port `compRow` (`tracker.js:131-170`) and `buildHeatGauge` (`tracker.js:177-270`).
**Preserve every class name** (`rig-comp/rig-comp-label/rig-step/rig-bar/rig-bar-fill/rig-bar-text`; `heat-gauge/heat-gauge-head/heat-gauge-label/heat-gauge-read/heat-gauge-cap/heat-track/heat-seg` and its `--on/--danger/--redline` modifiers, `heat-status*`, `heat-controls/heat-btn*`, `heat-locked-hint`). `heatMeter` comes from `/shared/game-state.js`. The heat-change flash (`prevHeat`, `tracker.js:24,186-189,268`) becomes a `usePrevious` comparison inside `HeatGauge`.

- [ ] **Step 1: Implement `CompRow.tsx`**

Reproduce `tracker.js:131-170` as JSX. `−` button → `onCommand("damage", { name, loc, amount: "1" })`; `＋` → `onCommand("repair", …)`. Bar text: `DESTROYED` / `CATASTROPHIC` / `{sp}/{max}`; fill width `Math.round(sp/max*100)%`, class `rig-bar-fill ${barClass(c)}`.

```tsx
import { barClass } from "../../lib/rigView";
import type { Rig, Loc } from "../../state/types";

interface Props { rig: Rig; loc: Loc; onCommand: (verb: string, attrs: Record<string, unknown>) => void }

export function CompRow({ rig, loc, onCommand }: Props) {
  const c = rig[loc];
  const label = loc.charAt(0).toUpperCase() + loc.slice(1);
  const text = c.destroyed ? "DESTROYED" : c.sp === 0 ? "CATASTROPHIC" : `${c.sp}/${c.max}`;
  return (
    <div className="rig-comp">
      <span className="rig-comp-label">{label}</span>
      <button className="rig-step" type="button" aria-label={`Damage ${loc}`}
        onClick={() => onCommand("damage", { name: rig.name, loc, amount: "1" })}>−</button>
      <div className="rig-bar">
        <div className={`rig-bar-fill ${barClass(c)}`} style={{ width: `${Math.round((c.sp / c.max) * 100)}%` }} />
        <div className="rig-bar-text">{text}</div>
      </div>
      <button className="rig-step" type="button" aria-label={`Repair ${loc}`}
        onClick={() => onCommand("repair", { name: rig.name, loc, amount: "1" })}>＋</button>
    </div>
  );
}
```

- [ ] **Step 2: Implement `HeatGauge.tsx`**

Port `tracker.js:177-270` faithfully: the `heatMeter` read, `displayMax = cap + 4`,
the segmented track with `--warm` custom property per lit segment, the four status
branches (`over/redline/cold/warm|nominal`), the `heat-status-lock` when
`floor > 0`, the four control buttons (`Shut Down`→"0", `Vent −2`→"-2", `−1`→"-1",
`＋1`→"+1") disabled unless `isActive && !started`, and the `heat-locked-hint` when
not active. Use a `usePrevious(m.heat)` helper to add `heat-gauge--up/--down`.
Buttons call `onCommand("heat", { name, amount })`. Accept props
`{ rig, isActive, started, onCommand }`.

- [ ] **Step 3: Type-check + quick render smoke**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors. (These render inside `RigItem` in Task 20; no standalone test.)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/rig/CompRow.tsx client/src/components/rig/HeatGauge.tsx
git commit -m "feat: CompRow and HeatGauge components"
```

---

### Task 20: `RigItem` (accordion header + body), memoized

**Files:**
- Create: `client/src/components/rig/RigItem.tsx`
- Test: `client/src/components/rig/RigItem.test.tsx`

Port `buildRigItem` (`tracker.js:283-437`). **Preserve** all classes: `rig-item`
(+`is-destroyed/is-active/is-open`), `rig-head/rig-dot/rig-head-name/rig-badge/rig-heat-chip/rig-heat-chip-ic/rig-activate` (+`--readonly/on`), `rig-chev`, `rig-body/rig-body-inner/rig-status/rig-mods/rig-mod/rig-weapons/rig-equipment/rig-remove-row`. Uses `rigModifiers`, `EQUIPMENT`, `WEAPON_UPGRADES` from shared. Weapons/upgrades line from `tracker.js:404-418`. Activation logic (`tracker.js:326-360`): enemy rigs in battle get a read-only token; own rigs get a live button. Renders `CompRow ×4`, `HeatGauge`, and — when `game.started` — the `ActionConsole` (Task 29; until then leave a slot). "✕ Remove Rig" → `onCommand("remove", { name })`.

Props: `{ rig, isActive, isOpen, started, phase, myTurnSide, canActivateNow, onCommand, onToggle, onActivateLocal }`. Wrap the export in `React.memo`.

- [ ] **Step 1: Write the failing test**

`client/src/components/rig/RigItem.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RigItem } from "./RigItem";
import type { Rig } from "../../state/types";

const rig: Rig = {
  id: 1, name: "Stalker", weightClass: "medium", owner: "a",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 5, max: 5, destroyed: false, heat: 0 },
  weapons: { longRange: "Autocannon", melee: "Fist" },
  weaponUpgrades: { longRange: "", melee: "" }, equipment: null, activated: false, destroyed: false,
};

test("damage button issues a damage command", async () => {
  const onCommand = vi.fn();
  render(<RigItem rig={rig} isActive={false} isOpen started={false} phase="" myTurnSide={null}
    canActivateNow={false} onCommand={onCommand} onToggle={() => {}} onActivateLocal={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Damage hull/i }));
  expect(onCommand).toHaveBeenCalledWith("damage", { name: "Stalker", loc: "hull", amount: "1" });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run client/src/components/rig/RigItem.test.tsx`
Expected: FAIL — cannot find module `./RigItem`.

- [ ] **Step 3: Implement** `RigItem.tsx` porting `tracker.js:283-437`, header click / Enter / Space → `onToggle(rig.id)`; own-rig activate button → `onCommand("activate", {name})` in battle when `canActivateNow`, else `onActivateLocal(rig.id)` pre-battle. Leave a `{started && /* ActionConsole slot */}` comment where the console mounts.

- [ ] **Step 4: Run the test**

Run: `npx vitest run client/src/components/rig/RigItem.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/rig/RigItem.tsx client/src/components/rig/RigItem.test.tsx
git commit -m "feat: RigItem accordion component (memoized)"
```

---

### Task 21: `RigDeck` — ordering, grouping, deck title, add screen slot

**Files:**
- Create: `client/src/components/RigDeck.tsx`
- Modify: `client/src/components/Stage.tsx`

Port `renderRigs` orchestration (`tracker.js:446-473`) + group headers
(`groupHead`, 439-444). **Preserve** `rig-list`, `rig-group-head` classes and the
`#rigList` id. Reads `rigs`, `game`, `session` from `useRoomState`; `expandedRigs`,
`activeRigId`, `toggleExpanded`, `setActiveRig` from `useUi`; `sendCommand` from
`useCommands`. Computes per-rig `isActive/isOpen/canActivateNow` from
`tracker.js:288-329` and passes them to `RigItem`. Updates the `#rigDeckTitle` text
(`tracker.js:471-472`) — lift that into a small effect or derive it in `Stage`.
Renders `RigAddScreen` (Task 22) after the list.

- [ ] **Step 1: Implement `RigDeck.tsx`**

Structure:

```tsx
import { useRoomState } from "../state/RoomStateContext";
import { useUi } from "../state/UiStateContext";
import { useCommands } from "../hooks/useCommands";
import { orderedRigs, ownerLabel } from "../lib/rigView";
import { RigItem } from "./rig/RigItem";
import { RigAddScreen } from "./RigAddScreen";
import { Fragment } from "react";

export function RigDeck() {
  const { rigs, game, session } = useRoomState();
  const { expandedRigs, activeRigId, toggleExpanded, setActiveRig } = useUi();
  const sendCommand = useCommands();
  const mySide = session?.side || "a";
  const started = Boolean(game?.started);
  const ordered = orderedRigs(rigs, mySide);

  let lastGroup: string | null = null;
  return (
    <div id="rigList" className="rig-list">
      {ordered.map((rig) => {
        const group = ownerLabel(rig.owner, mySide);
        const header = group !== lastGroup ? (lastGroup = group, group) : null;
        const serverActive = started && game?.turn?.activeRigId === rig.id;
        const isActive = started ? serverActive : rig.id === activeRigId;
        const isOpen = expandedRigs.has(rig.id) || serverActive;
        const isMine = (rig.owner || "a") === mySide;
        const canActivateNow = Boolean(
          started && game?.phase === "activation" && game?.turn?.side === mySide &&
          isMine && game?.turn?.activeRigId == null && !rig.activated && !rig.destroyed,
        );
        return (
          <Fragment key={rig.id}>
            {header && <div className="rig-group-head">{header === "Your Squadron" ? "Your Squadron" : "Enemy"}</div>}
            <RigItem rig={rig} isActive={isActive} isOpen={isOpen} started={started}
              phase={game?.phase ?? ""} myTurnSide={game?.turn?.side ?? null}
              canActivateNow={canActivateNow} onCommand={sendCommand}
              onToggle={toggleExpanded} onActivateLocal={(id) => setActiveRig(isActive ? null : id)} />
          </Fragment>
        );
      })}
      <RigAddScreen />
    </div>
  );
}
```

- [ ] **Step 2: Mount `RigDeck` in `Stage.tsx`** and set the deck title

Replace the RigDeck slot comment with `<RigDeck />` and make the `#rigDeckTitle`
reflect the active rig:

```tsx
import { useRoomState } from "../state/RoomStateContext";
import { useUi } from "../state/UiStateContext";
// inside Stage():
const { rigs } = useRoomState();
const { activeRigId } = useUi();
const active = rigs.find((r) => r.id === activeRigId);
// title: active ? `Active · ${active.name}` : "Squadron Status"
```

- [ ] **Step 3: Verify against server**

Run dev, join, commission is not built yet — so temporarily verify the deck renders
existing rigs if any exist in `data/rooms.json`; otherwise confirm no crash and an
empty list with the add screen. (Full flow verified in Task 22.)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/RigDeck.tsx client/src/components/Stage.tsx
git commit -m "feat: RigDeck ordering, grouping, and deck title"
```

---

### Task 22: `RigAddScreen` — commission CTA + availability

**Files:**
- Create: `client/src/components/RigAddScreen.tsx`

Port markup `index.html:66-74` + availability logic `updateAddRigAvailability`
(`tracker.js:66-87`) and `addLimitMessage` (60-64). **Preserve** `rig-add-card/rig-add/rig-add-title/rig-add-hint/rig-add-row/rig-add-btn` classes and the `rig-add-locked`/`is-empty` toggles and the `#rigAddScreen`/`#rigAddBtn` ids. Uses `canAddRigForSide`, `MAX_RIGS_TOTAL`, `MAX_RIGS_PER_SIDE` from shared. Clicking Commission opens the Rig wizard (Task 32) — until then, wire an `onCommission` prop / context hook and leave a `TODO(Task 32)` comment that calls it; for now have it call a no-op passed from `RigDeck`.

- [ ] **Step 1: Implement** reproducing the empty-state title/hint swaps from
  `tracker.js:76-86`. Read `rigs`, `game`, `session` from `useRoomState`.

- [ ] **Step 2: Verify** dev: with 0 rigs the card shows the "Your squadron is
  empty" empty state; the button is enabled/disabled per the shared limits.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/RigAddScreen.tsx
git commit -m "feat: RigAddScreen with shared add-limit gating"
```

---

### Task 23: `BattleSetup` — ready check, bounty, dice mode

**Files:**
- Create: `client/src/components/BattleSetup.tsx`
- Modify: `client/src/components/Stage.tsx`

Port markup `index.html:77-84` + `renderBattleSetup` (`tracker.js:89-127`).
**Preserve** `battle-setup/battle-ready-status/battle-bounty/dice-mode/ready-battle`
classes and the `#battleSetup/#battleReadyStatus/#battleBounty/#diceMode/#readyBattle` ids. Ready → `sendCommand("ready", { side })`; dice toggle →
`sendCommand("setdice", { value: auto ? "manual" : "auto" })`. Reads `game`,
`rigs`, `session`.

- [ ] **Step 1: Implement `BattleSetup.tsx`** faithfully porting the started /
  not-started branches, the `myCount >= 3` gating, and the auto/manual label.

- [ ] **Step 2: Mount it in `Stage.tsx`** (replace the BattleSetup slot with `<BattleSetup />`).

- [ ] **Step 3: Verify** dev: ready button disabled until 3 rigs; dice toggle flips
  Auto/Manual and posts `setdice`.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/BattleSetup.tsx client/src/components/Stage.tsx
git commit -m "feat: BattleSetup ready/bounty/dice controls"
```

---

## Phase 5 — Battle HUD, banners, overlays, wizards

### Task 24: `BattleHud`

**Files:**
- Create: `client/src/components/BattleHud.tsx`
- Modify: `client/src/components/Stage.tsx`

Port markup `index.html:57-62` + the HUD portion of `renderBattle`
(`battle.js:122-152`, the `bhPhase/bhRound/bhTurn/bhTokens` writes). **Preserve**
`battle-hud/bh-phase/bh-phase-label/bh-round/bh-turn/bh-tokens/bh-prompt` classes
and their ids; keep `bh-mine`/`bh-foe` inline classes on the turn name. Hidden
unless `game?.started`. Uses `phaseSummary` from shared. `bhPrompt` stays empty
(`battle.js:146`).

- [ ] **Step 1: Implement**, deriving `mySide` from session. Render `null`/hidden
  when `!game?.started`.

- [ ] **Step 2: Mount** in `Stage.tsx`.

- [ ] **Step 3: Type-check** `npx tsc -p tsconfig.json --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/BattleHud.tsx client/src/components/Stage.tsx
git commit -m "feat: BattleHud phase/round/turn/tokens"
```

---

### Task 25: `TurnBanner` + `computeFocus`

**Files:**
- Create: `client/src/lib/computeFocus.ts`
- Create: `client/src/components/TurnBanner.tsx`
- Test: `client/src/lib/computeFocus.test.ts`
- Modify: `client/src/components/Terminal.tsx`

`computeFocus` (`battle.js:200-266`) is the guidance state machine — extract it as a
pure function `computeFocus(game, rigs, mySide): Focus | null` where `Focus.cta`
carries a `kind` string (e.g. `"commission" | "ready" | "initiative" | "blast" | "score"`) instead of an inline DOM handler, so the component maps `kind → onClick`. The banner ports markup `index.html:20-27` + `renderFocus` (`battle.js:165-196`), including the `my-turn-glow` body class, the `--turn-banner-h` CSS var, and the change-flash. **Preserve** `turn-banner/tb-icon/tb-text/tb-primary/tb-secondary/tb-cta` classes and the `#turnBanner` id and `data-tone`.

- [ ] **Step 1: Write the failing test** for `computeFocus`

`client/src/lib/computeFocus.test.ts`:

```ts
import { computeFocus } from "./computeFocus";
import type { GameState } from "../state/types";

const base = (over: Partial<GameState>): GameState => ({
  round: 1, phase: "setup", started: false, sides: [], ...over,
});

test("pre-battle with no rigs prompts commissioning", () => {
  const f = computeFocus(base({ started: false }), [], "a");
  expect(f?.primary).toMatch(/Commission your first Rig/);
  expect(f?.cta?.kind).toBe("commission");
});

test("finished phase yields no focus", () => {
  expect(computeFocus(base({ started: true, phase: "finished" }), [], "a")).toBeNull();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run client/src/lib/computeFocus.test.ts`
Expected: FAIL — cannot find module `./computeFocus`.

- [ ] **Step 3: Implement `computeFocus.ts`** porting `battle.js:200-266`, with
  `cta: { label, kind }` (kinds: `commission`, `ready`, `initiative`, `blast`,
  `score`). Uses `sideNameOf`/`sideReadyOf`/`rigCountOf` helpers (inline, param
  `game`/`rigs`/`mySide`) and `actionBudget` from shared for the "actions left"
  secondary.

- [ ] **Step 4: Implement `TurnBanner.tsx`** consuming `computeFocus`; map `cta.kind`
  to handlers: `commission`→open wizard (context callback, Task 32 wires it),
  `ready`→`sendCommand("ready",{side})`, `initiative`→auto `sendCommand("initiative",{})`
  or manual dice (Task 30), `blast`/`score`→open prompts (Task 30). Until Tasks
  30/32 land, route these through a `useBattlePrompts()` context with stub methods;
  add `TODO(Task 30/32)`. Manage `my-turn-glow`, `--turn-banner-h`, and the flash in
  effects (use a `useRef` for the previous primary + a state class toggle).

- [ ] **Step 5: Mount** `<TurnBanner />` at the top of `Terminal.tsx` (it renders
  above `.term` per `index.html:20`).

- [ ] **Step 6: Run tests**

Run: `npx vitest run client/src/lib/computeFocus.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/computeFocus.ts client/src/lib/computeFocus.test.ts client/src/components/TurnBanner.tsx client/src/components/Terminal.tsx
git commit -m "feat: TurnBanner + computeFocus guidance state machine"
```

---

### Task 26: `OutcomeBanner`

**Files:**
- Create: `client/src/components/OutcomeBanner.tsx`
- Modify: `client/src/components/Terminal.tsx`

Port `index.html:126` + `renderOutcome` (`battle.js:268-272`). **Preserve**
`outcome-banner` class + `#outcomeBanner` id. Visible only when
`game?.phase === "finished"`; text from `outcomeText(game.outcome, game.sides)`.

- [ ] **Step 1: Implement** and mount in `Terminal.tsx`.

- [ ] **Step 2: Type-check** → no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/OutcomeBanner.tsx client/src/components/Terminal.tsx
git commit -m "feat: OutcomeBanner"
```

---

### Task 27: `Drawer` (portal) + `ChoiceField` + drawer service

**Files:**
- Create: `client/src/components/overlays/Drawer.tsx`
- Create: `client/src/components/overlays/ChoiceField.tsx`
- Create: `client/src/state/DrawerContext.tsx`

Replaces the imperative `openDrawer`/`closeDrawer`/`choiceField` (`drawer.js`) with
a React portal + a context service. **Preserve** `dwr-scrim/dwr-card/dwr-title/dwr-actions/dwr-btn/dwr-btn-ic/dwr-field/dwr-field-ic/dwr-seg/dwr-opt/dwr-opt-ic` classes and `data-tone`, plus the `.show` transition (mount → next frame add `show`; on close remove `show`, unmount after 250ms). The service exposes `openDrawer(config)` / `closeDrawer()` where `config` mirrors `drawer.js:15-20` opts but `build` becomes a `render: () => ReactNode` and `actions[].onClick` are handlers.

- [ ] **Step 1: Implement `DrawerContext.tsx`** holding the current drawer config +
  `openDrawer`/`closeDrawer`, and rendering `<Drawer>` via `createPortal` to
  `document.body`. Handle the `dismissable` backdrop click (default true) and the
  enter/leave `.show` timing with state + `setTimeout`.

- [ ] **Step 2: Implement `Drawer.tsx`** (presentational: title with `data-tone`,
  `render()` body, actions row) and `ChoiceField.tsx` (segmented control from
  `drawer.js:64-88`, controlled via `value`/`onChange`).

- [ ] **Step 3: Wrap the app** — add `<DrawerProvider>` inside `<UiProvider>` in
  `main.tsx`.

- [ ] **Step 4: Type-check** → no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/overlays/Drawer.tsx client/src/components/overlays/ChoiceField.tsx client/src/state/DrawerContext.tsx client/src/main.tsx
git commit -m "feat: Drawer portal service + ChoiceField"
```

---

### Task 28: `RollConsole` service (auto animation + manual entry)

**Files:**
- Create: `client/src/components/overlays/RollConsole.tsx`
- Create: `client/src/state/RollContext.tsx`

Port `roll-dialog.js` in full. **Preserve** markup `index.html:116-125` and classes
`roll-scrim/roll-console/roll-head/roll-kind/roll-close/roll-dice/roll-summary/roll-effects/roll-form/roll-ok/die-wrap/die/die-label/roll-effect/roll-form-row/roll-form-go` + `#roll*` ids and the `d12/d6/rolling/settled` state classes + `data-tone`. The service exposes two async methods matching the originals:

- `playResolution(entry)` (`roll-dialog.js:51-102`): flicker via `Math.random` for
  650ms, then land on real values, stagger effects, reveal OK after `OK_REVEAL_MS`;
  respects `prefers-reduced-motion`. Returns a promise resolving when settled.
- `promptDice(specs, title)` (`roll-dialog.js:106-144`): render number inputs,
  validate 1..sides, resolve to a `{key: value}` map.

Implement the animation with `useState` + `setInterval`/`setTimeout` inside the
component, driven by an imperative handle stored in `RollContext` (a ref-backed
`{ playResolution, promptDice, closeRoll }`). Mount `<RollConsole>` once via
`RollProvider`.

- [ ] **Step 1: Implement `RollContext.tsx`** exposing `useRoll()` → `{ playResolution, promptDice, closeRoll }`, backed by state in the mounted `<RollConsole>`.

- [ ] **Step 2: Implement `RollConsole.tsx`** porting both flows, preserving timings
  (`OK_REVEAL_MS = 900`, 220ms hide, 650ms flicker, effect stagger `0.5 + i*0.12`s)
  and the `KIND_TONE` map (`roll-dialog.js:21`).

- [ ] **Step 3: Wrap the app** — add `<RollProvider>` in `main.tsx` (inside `DrawerProvider`).

- [ ] **Step 4: Manual verify** deferred to Task 33 (needs a resolution to play).
  For now: `npx tsc -p tsconfig.json --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/overlays/RollConsole.tsx client/src/state/RollContext.tsx client/src/main.tsx
git commit -m "feat: RollConsole service (auto animation + manual dice entry)"
```

---

### Task 29: `ActionConsole`

**Files:**
- Create: `client/src/components/battle/ActionConsole.tsx`
- Modify: `client/src/components/rig/RigItem.tsx`

Port `buildActionConsole` (`battle.js:275-329`) + `onAction` routing (331-337).
**Preserve** `action-console/ac-budget/ac-budget-label/ac-reduced/ac-pips/ac-pip/ac-grid/ac-btn/ac-ic/ac-label/ac-cost/ac-heat/ac-end` classes + `hint`/`hint--warn`. Uses `availableActions`, `actionBudget` from shared and the `ACTION_ICONS` map (`battle.js:11-16`). Renders only when the rig is the active one in `activation` phase. Action clicks route:
`fire/aimed/ram`→open Attack wizard (Task 31); `move/sprint`→move drawer (Task 30);
`repair/emergencypatch`→repair drawer (Task 30); else `sendCommand("action", { name, action: key })`. "End Activation"→`endActivation` (Task 30 handles the manual-overheat branch). Use a `useBattleActions()` context (Task 30) for the drawer-backed routes; direct `sendCommand` for the rest.

- [ ] **Step 1: Implement `ActionConsole.tsx`** with props `{ rig }`, reading
  `game.turn` from `useRoomState`, `sendCommand` from `useCommands`, and the
  drawer/wizard routes from `useBattleActions()` (stub methods until Tasks 30/31).

- [ ] **Step 2: Mount** it in `RigItem.tsx` where the slot comment is:
  `{started && game?.turn?.activeRigId === rig.id && game?.phase === "activation" && <ActionConsole rig={rig} />}` (guard mirrors `battle.js:280`).

- [ ] **Step 3: Type-check** → no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/battle/ActionConsole.tsx client/src/components/rig/RigItem.tsx
git commit -m "feat: ActionConsole with action budget and grid"
```

---

### Task 30: Battle prompts — move/repair drawers, VP/blast, manual dice, end-activation

**Files:**
- Create: `client/src/state/BattleActionsContext.tsx`
- Modify: `client/src/main.tsx`

Port the drawer/prompt helpers from `battle.js`: `openMoveDrawer` (349-426, incl.
the 5000ms timed hold + progress fill), `openRepairDrawer` (430-461),
`openVpPrompt` (475-479), `openBlastPrompt` (480-485), `promptOneDie`/`promptTwoDice`
(486-493), `endActivation` (463-468). Expose them via `useBattleActions()` so
`ActionConsole` and `TurnBanner` call them. VP/blast keep `window.prompt` (parity
with the original — `battle.js:476,481`). Move/repair use the Drawer service (Task
27); manual dice use the Roll service (Task 28); `SPEED`/`MOVE_HOLD_MS` constants
from `battle.js:340-341`.

- [ ] **Step 1: Implement `BattleActionsContext.tsx`** with `openMove(rig, key)`,
  `openRepair(rig, action)`, `scoreVp()`, `resolveBlast()`, `endActivation(rig)`,
  `rollInitiative()`. Inject `useDrawer`, `useRoll`, `useCommands`, `useRoomState`.
  Reproduce the move hold: render a drawer whose Confirm stays disabled and a fill
  bar animates over `MOVE_HOLD_MS`; use `useEffect`+`setInterval` inside a small
  `<MoveHold>` body component (the drawer `render` returns it).

- [ ] **Step 2: Wrap the app** — add `<BattleActionsProvider>` in `main.tsx` (inside
  `RollProvider`).

- [ ] **Step 3: Verify** dev in an active battle (or as far as state allows): Move
  opens a locked-Confirm drawer that unlocks after 5s; Repair posts the right
  command; End Activation posts `endactivation`.

- [ ] **Step 4: Commit**

```bash
git add client/src/state/BattleActionsContext.tsx client/src/main.tsx
git commit -m "feat: battle prompts (move/repair/vp/blast/dice/end-activation)"
```

---

### Task 31: `AttackWizard`

**Files:**
- Create: `client/src/components/wizards/AttackWizard.tsx`
- Modify: `client/src/state/BattleActionsContext.tsx`

Port `attack-wizard.js` (`openAttackWizard(rig, mode)`, 225 lines). **Preserve every
`aw-*` class** used there (read the file for the full list) and its scrim/card
pattern. Expose `openAttack(rig, mode)` from `useBattleActions()`. The wizard picks
target/arc/weapon/location per the original and issues the attack command (auto) or
routes to manual dice via the Roll service. Keep the mode split (`fire`/`aimed`/`ram`).

- [ ] **Step 1: Read `public/js/attack-wizard.js` fully**, list its `aw-*` classes,
  its command payload(s), and its steps.

- [ ] **Step 2: Implement `AttackWizard.tsx`** as a controlled multi-step component
  rendered through the Drawer service (or its own scrim if it uses distinct `aw-`
  chrome — match the original's markup). Reproduce the exact command verbs/attrs.

- [ ] **Step 3: Wire `openAttack` into `BattleActionsContext`** and route
  `ActionConsole`'s `fire/aimed/ram` to it.

- [ ] **Step 4: Verify** dev: firing opens the wizard, target/weapon/location
  selection matches the old UI, and the posted command matches the original.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/wizards/AttackWizard.tsx client/src/state/BattleActionsContext.tsx
git commit -m "feat: AttackWizard"
```

---

### Task 32: `RigWizard` (commission)

**Files:**
- Create: `client/src/components/wizards/RigWizard.tsx`
- Create: `client/src/state/WizardContext.tsx`
- Modify: `client/src/components/RigAddScreen.tsx`
- Modify: `client/src/components/TurnBanner.tsx`

Port `rig-wizard.js` (`openRigWizard`, 249 lines). **Preserve** its `rig-wizard`/`rw-*` (read the file) classes. It must keep the ui-static test invariants: an owner selector labeled **You**/**Enemy**, only `["light", "medium"]` classes, and the final commission command using `owner: state.owner` (see `ui-static.test.js:9-21`). Expose `openWizard()` via `useWizard()`; `RigAddScreen`'s Commission button and `TurnBanner`'s `commission` CTA both call it. On done it posts the add/commission command and (mirroring `onRigWizardDone`) clears any status.

- [ ] **Step 1: Read `public/js/rig-wizard.js` fully**; note its steps (name →
  class → weapons → weapon upgrades → equipment → owner), the shared data it reads
  (`WEAPONS`, `WEAPON_UPGRADES`, `EQUIPMENT`, `SUPPORTED_RIG_CLASSES`,
  `defaultWeaponUpgrade`, etc.), and its final command payload.

- [ ] **Step 2: Implement `WizardContext.tsx`** (`openWizard`/`closeWizard` + mount
  the wizard) and `RigWizard.tsx` as a controlled multi-step form. Reproduce the
  exact command verb/attrs, including `owner: state.owner`, `light`/`medium` only,
  and the You/Enemy labels.

- [ ] **Step 3: Wire** `RigAddScreen` Commission → `openWizard()`; `TurnBanner`
  `commission` CTA → `openWizard()`.

- [ ] **Step 4: Wrap the app** — add `<WizardProvider>` in `main.tsx`.

- [ ] **Step 5: Verify** dev end-to-end: commission a Light and a Medium rig; they
  appear in the deck under "Your Squadron"; enemy option produces an Enemy rig.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/wizards/RigWizard.tsx client/src/state/WizardContext.tsx client/src/components/RigAddScreen.tsx client/src/components/TurnBanner.tsx client/src/main.tsx
git commit -m "feat: RigWizard commission flow"
```

---

### Task 33: Resolution + activation-summary watchers

**Files:**
- Create: `client/src/hooks/useBattleWatchers.ts`
- Modify: `client/src/components/Terminal.tsx`

Port `syncResolutions` (`battle.js:47-56`) and `syncActivationSummary`/`showActivationSummary` (58-120). The resolution watcher plays the newest unseen
resolution via the Roll service; the activation watcher, when the active rig changes,
opens a recap drawer (Drawer service) summarizing that rig's log entries, auto-closing
after 6500ms. Both track "last seen" across renders with refs (mirroring the module
globals `lastSeenResolution`, `watchedActiveRig`, `activationBaselineId`,
`summaryReady`). **Preserve** `dwr-recap/dwr-recap-row/dwr-recap-line/dwr-recap-eff/dwr-hint` classes in the recap body.

- [ ] **Step 1: Implement `useBattleWatchers()`** — a hook that reads `game`/`rigs`
  from `useRoomState`, `useRoll`, `useDrawer`, and runs two effects keyed on
  `game?.resolutions` and `game?.turn?.activeRigId`. Guard the first render
  (`summaryReady`) so no spurious recap fires on load.

- [ ] **Step 2: Call `useBattleWatchers()`** once inside `Terminal` (it renders
  nothing; it drives the overlay services).

- [ ] **Step 3: Verify** dev in a live battle: a server resolution animates once in
  the Roll console; ending an activation shows the recap drawer, which auto-dismisses.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useBattleWatchers.ts client/src/components/Terminal.tsx
git commit -m "feat: resolution + activation-summary watchers"
```

---

## Phase 6 — Chat

### Task 34: Chat state + `ChatFab` + `ChatPanel` shell

**Files:**
- Create: `client/src/components/chat/ChatContext.tsx`
- Create: `client/src/components/chat/ChatFab.tsx`
- Create: `client/src/components/chat/ChatPanel.tsx`
- Modify: `client/src/components/Terminal.tsx`

Chat state stays **component-local** (design decision). `ChatContext` holds
`messages`, `history`, `isStreaming`, `think`, `status`, and settings, scoped to the
chat subtree. Port the fab↔panel open/close (`chat.js:22-48`) using `useUi().chatOpen`
and the `has-unread` flag. **Preserve** markup `index.html:87-113` and classes
`chat-fab/chat-fab-ic/active/has-unread`, `chat-panel/chat-grip/chat-head/chat-title/chat-tools/chat-chip/chat-close/lang-select/status-row`, `input-row/icon-btn`, and `#messages/#textInput/#chatPanel/#chatFab` ids + `aria-*`.

- [ ] **Step 1: Implement `ChatContext.tsx`** (provider scoped in `ChatPanel`'s
  parent) with the local state above and actions `addMessage`, `setStreaming`, etc.
  Keep it minimal — the streaming logic lands in Task 37.

- [ ] **Step 2: Implement `ChatFab.tsx`** — toggles `useUi().chatOpen`; shows
  `has-unread`; `aria-expanded` synced.

- [ ] **Step 3: Implement `ChatPanel.tsx` shell** — head + tools row (buttons wired
  in Tasks 37/39 as stubs for now), `status-row`, `<main id="messages">` (empty),
  and the input row (stub). Open/close driven by `chatOpen` (add/remove `open`
  class + `aria-hidden`), Escape closes (`chat.js:42-44`).

- [ ] **Step 4: Mount** `<ChatFab />` + `<ChatPanel />` in `Terminal.tsx`.

- [ ] **Step 5: Verify** dev: the FAB opens/closes the panel; Escape closes it.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/chat/ChatContext.tsx client/src/components/chat/ChatFab.tsx client/src/components/chat/ChatPanel.tsx client/src/components/Terminal.tsx
git commit -m "feat: chat panel shell + fab open/close"
```

---

### Task 35: `MessageList` + `Bubble` + `GlossaryText` + bot bubble

**Files:**
- Create: `client/src/components/chat/MessageList.tsx`
- Create: `client/src/components/chat/Bubble.tsx`
- Create: `client/src/components/chat/GlossaryText.tsx`
- Test: `client/src/components/chat/GlossaryText.test.tsx`

`Bubble` renders user/bot bubbles (`chat.js:50-61`) — **preserve** `bubble user/bot`,
`pending`, `think-block/think-text/answer-text` classes. Bot answers render markdown
via `dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }}` **then** wrap
glossary terms — but since we can't post-process the injected HTML in React, render
the answer through `GlossaryText`, which tokenizes the *plain* stripped text; for
markdown-with-glossary, apply `GlossaryText` to text nodes only. Simplest faithful
approach: `Bubble` renders bot markdown HTML, and `GlossaryText` handles
plain/streamed text bubbles. **Preserve** `glossary-term` span class + `data-term`,
`role="button"`, `tabindex`, `aria-label` (`glossary.js:52-58`).

- [ ] **Step 1: Write the failing test** for `GlossaryText`

`client/src/components/chat/GlossaryText.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { GlossaryText } from "./GlossaryText";
import { tokenizeGlossary } from "../../lib/glossaryTerms";

test("wraps recognized glossary terms in tappable spans", () => {
  const sample = tokenizeGlossary("Heat").find((s) => s.kind === "term")?.text ?? "Heat";
  const { container } = render(<GlossaryText text={`Watch the ${sample}.`} onOpen={() => {}} />);
  const term = container.querySelector(".glossary-term");
  expect(term).not.toBeNull();
  expect(term).toHaveAttribute("data-term");
  expect(term).toHaveAttribute("role", "button");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run client/src/components/chat/GlossaryText.test.tsx`
Expected: FAIL — cannot find module `./GlossaryText`.

- [ ] **Step 3: Implement `GlossaryText.tsx`** using `tokenizeGlossary`; render text
  segments as strings and term segments as
  `<span className="glossary-term" data-term={id} role="button" tabIndex={0} aria-label={`${term} — glossary term`} onClick={() => onOpen(id, el)}>`.

- [ ] **Step 4: Implement `Bubble.tsx`** (user = plain text via `GlossaryText`; bot =
  markdown HTML) and `MessageList.tsx` (maps `messages`, auto-scrolls to bottom via a
  ref effect on message count).

- [ ] **Step 5: Run the test**

Run: `npx vitest run client/src/components/chat/GlossaryText.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/chat/MessageList.tsx client/src/components/chat/Bubble.tsx client/src/components/chat/GlossaryText.tsx client/src/components/chat/GlossaryText.test.tsx
git commit -m "feat: chat message list, bubbles, and glossary text"
```

---

### Task 36: `ChatInput`

**Files:**
- Create: `client/src/components/chat/ChatInput.tsx`

Port `index.html:108-112` + input handlers (`chat.js:63-67,183-189`) + mic button.
**Preserve** `input-row/icon-btn` classes and `#micBtn/#textInput/#sendBtn` ids,
`aria-*`. Textarea auto-resizes to `min(scrollHeight,120)px`. Enter (no shift) sends;
Shift+Enter newlines. Mic button state from `useSpeech` (wired in Task 37). Props:
`{ onSend, mic }` where `mic` is `{ supported, recording, toggle }`.

- [ ] **Step 1: Implement** with a controlled `value` + `useRef` textarea for the
  auto-resize effect. Disable send while streaming (prop).

- [ ] **Step 2: Type-check** → no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/chat/ChatInput.tsx
git commit -m "feat: ChatInput (autoresize, enter-to-send, mic)"
```

---

### Task 37: Streaming send + rig-tags + speech/TTS wiring

**Files:**
- Create: `client/src/hooks/useChatStream.ts`
- Modify: `client/src/components/chat/ChatPanel.tsx`

Port `sendMessage` (`chat.js:95-181`): POST `/api/chat` with
`{ messages: history, think, room, side }`, read the NDJSON stream, accumulate
`thinking`/`content`, strip rig tags for display, render markdown incrementally,
then on completion parse rig commands (`parseRigCommands`) and `sendCommand` each,
push to history, and `speak` if TTS on. Keep the streaming buffer in a ref and commit
to state at each newline batch (perf). Wire `useSpeech({ lang, onTranscript: send })`
so voice transcripts send as messages (`main.js:13`); the seed bot bubble
(`main.js:31`) is added on mount.

- [ ] **Step 1: Implement `useChatStream.ts`** returning `{ send, isStreaming, status }`
  and consuming `useChatContext`, `useCommands`, and the passed `speak`/`tts`. Port
  the reader loop and event handling (`chat.js:123-160`) faithfully, including the
  `think-block` open/close transitions represented in message state.

- [ ] **Step 2: Wire it into `ChatPanel`** — connect `MessageList`, `ChatInput`
  (`onSend={send}`), `useSpeech`, and the seed greeting. Wire the mic button to
  `useSpeech.toggleMic`.

- [ ] **Step 3: Verify** dev (requires Ollama running per README): send a text
  message; the reasoning block streams then collapses, the answer renders markdown,
  and any `[[RIG …]]` command mutates the tracker. If Ollama isn't available, verify
  the request is issued and the error path renders `[Error: …]` (`chat.js:161-164`).

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useChatStream.ts client/src/components/chat/ChatPanel.tsx
git commit -m "feat: streaming chat with rig-tag dispatch and TTS"
```

---

### Task 38: `GlossaryTip` (portal tooltip)

**Files:**
- Create: `client/src/components/overlays/GlossaryTip.tsx`
- Create: `client/src/state/GlossaryTipContext.tsx`
- Modify: `client/src/main.tsx`
- Modify: `client/src/components/chat/GlossaryText.tsx`

Port `glossary-tip.js` in full. **Preserve** markup `index.html:128-132` + classes
`glossary-tip/glossary-tip-term/glossary-tip-def/glossary-tip-close`, the
`tip-below` class, the `--arrow-x` var, and the anchor's `is-open` class. Expose
`openTip(termId, anchorEl)` / `closeTip()` via context; `GlossaryText` term spans
call `openTip`. Reproduce placement math (`glossary-tip.js:13-32`), the
click-outside / Escape / Enter-Space handling (59-76), reposition on resize, and
close-on-scroll (79-81).

- [ ] **Step 1: Implement `GlossaryTipContext.tsx`** (state: open term + anchor rect)
  and `GlossaryTip.tsx` (portal to body; positions from the anchor rect; the same
  window listeners in effects with cleanup). Resolve defs via `glossaryById`.

- [ ] **Step 2: Wire** `GlossaryText` term click/keydown → `openTip(id, e.currentTarget)`;
  add `<GlossaryTipProvider>` in `main.tsx` and mount `<GlossaryTip />`.

- [ ] **Step 3: Verify** dev: tapping a highlighted term in a bot answer shows the
  tooltip above/below with the arrow pointing at the term; Escape/outside-click/scroll
  closes it.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/overlays/GlossaryTip.tsx client/src/state/GlossaryTipContext.tsx client/src/components/chat/GlossaryText.tsx client/src/main.tsx
git commit -m "feat: GlossaryTip tooltip"
```

---

### Task 39: Chat tool controls (think / TTS / lang / clear)

**Files:**
- Modify: `client/src/components/chat/ChatPanel.tsx`
- Modify: `client/src/components/chat/ChatContext.tsx`

Wire the toolbar chips (`index.html:96-103`) to state: `thinkToggle`
(`chat.js:202-207`) flips `think` + `active`/`aria-pressed`; `ttsToggle`
(`speech.js:67-72`) flips `useSpeech.tts`; `langSelect` sets STT language;
`clearBtn` (`chat.js:191-200`) clears `history` + `messages`, cancels speech, and
shows the "Context cleared" seed bubble + transient status. **Preserve** the
`chat-chip`/`active`/`aria-pressed` classes and the option values `pt-BR`/`en-US`.

- [ ] **Step 1: Implement** the four controls, reading/writing chat state and speech.

- [ ] **Step 2: Verify** dev: think chip toggles reasoning on next send; TTS chip
  reads answers; PT/EN changes recognition language; Clear wipes the transcript but
  keeps tracked rigs (state lives server-side).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/chat/ChatPanel.tsx client/src/components/chat/ChatContext.tsx
git commit -m "feat: chat toolbar (think/tts/lang/clear)"
```

---

## Phase 7 — Cutover and cleanup

### Task 40: Serve the built client from Express

**Files:**
- Modify: `server/index.js:23,26-28`

- [ ] **Step 1: Build the client**

Run: `npm run build`
Expected: Vite writes `client/dist/index.html` + hashed assets; no errors.

- [ ] **Step 2: Point Express at the build output**

In `server/index.js`, change the static root and the `/` handler from `public` to the
built client. Replace line 23 and the `/` handler (26-28):

```js
// was: app.use(express.static(path.join(rootDir, "public")));
app.use(express.static(path.join(rootDir, "client", "dist")));
app.use("/shared", express.static(path.join(rootDir, "shared")));

app.get("/", (req, res) => {
  res.sendFile(path.join(rootDir, "client", "dist", "index.html"));
});
```

(Leave the `/shared` static route and everything else untouched.)

- [ ] **Step 3: Verify production serving**

Run: `npm start` (ensure nothing else holds port 8000).
Open `http://localhost:8000/`.
Expected: the React app loads from the build (no Vite), the join gate works, and a
joined room shows the terminal. Check the Network tab: assets come from
`/assets/*.js`, and `/api`/`/ws` work same-origin.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: serve built React client from Express"
```

---

### Task 41: Replace `ui-static` invariants with component tests; delete old client

**Files:**
- Create: `client/src/components/wizards/RigWizard.test.tsx`
- Delete: `public/js/*`, `public/css/*`, `public/index.html`, `public/markdown.test.js`, `public/ui-static.test.js`
- Modify: `README.md` (dev/build instructions)

The old `ui-static.test.js` asserted source-string invariants; replace the ones that
still matter as real component tests, then remove the old client.

- [ ] **Step 1: Write `RigWizard.test.tsx`** covering the invariants from
  `ui-static.test.js:9-21`: renders **You** and **Enemy** owner options; offers only
  Light + Medium classes (no Heavy/Colossal); commissioning posts a command whose
  attrs include the chosen `owner`. (Mock `useCommands`/`WizardContext` as needed.)

- [ ] **Step 2: Run it**

Run: `npx vitest run client/src/components/wizards/RigWizard.test.tsx`
Expected: PASS.

- [ ] **Step 3: Delete the old client and its source-string tests**

```bash
git rm -r public/js public/css public/index.html public/markdown.test.js public/ui-static.test.js
```

(Keep any non-client files under `public/` if present — there are none in scope.)

- [ ] **Step 4: Confirm the shared/server tests still pass under `node --test`**

Run: `node --test`
Expected: shared tests (`shared/*.test.js`) pass; no attempt to load the deleted
`public/*.test.js`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: Vitest passes (all client tests) **and** `node --test` passes.

- [ ] **Step 6: Update `README.md`** — replace the "just open localhost:8000" dev
  note with: dev = `npm run dev` (Vite on 5173 proxying to Express on 8000);
  production = `npm run build` then `npm start` (Express serves `client/dist`). Keep
  all Ollama/voice/tunnel sections unchanged.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove vanilla client; add component tests; update README"
```

---

### Task 42: Full parity pass

**Files:** none (verification only)

- [ ] **Step 1: Build + start**

Run: `npm run build && npm start`

- [ ] **Step 2: Walk every surface** against the pre-rewrite behavior, screen by
  screen, and note any deviation:
  1. Join gate: room/name/side gating, persistence across refresh, "Room is full".
  2. Commission wizard: Light + Medium, weapons, upgrades, equipment, You/Enemy owner.
  3. Rig deck: grouping (Your Squadron / Enemy), accordion expand, damage/repair
     buttons, heat gauge segments + controls + change flash, remove.
  4. Battle setup: ready gating at 3 rigs, dice Auto/Manual, bounty line.
  5. Battle: HUD phase/round/turn/tokens, turn banner + `my-turn-glow`, activation,
     action console grid + budget pips, move hold drawer, repair drawer, attack
     wizard, end activation, roll console animation, activation recap drawer,
     outcome banner.
  6. Chat: streaming answer + reasoning block, markdown, glossary term tooltips,
     rig-tag mutations, mic (if supported), TTS, PT/EN, clear.

- [ ] **Step 3: Fix any parity gaps** found, committing each fix with a
  `fix: <what>` message referencing the surface. Re-run `npm test` after fixes.

- [ ] **Step 4: Final commit (if any docs/notes changed)**

```bash
git add -A
git commit -m "chore: parity pass for React client conversion"
```

---

## Self-review notes (for the plan author)

- **Spec coverage:** scaffold+Vite (T1-2) · CSS parity (T3) · shared `.d.ts`/JS-stays
  (T4) · TS types (T5) · lib ports w/ tests (T6-8) · Context+useReducer split
  (T9-10) · WS-only socket + reconnect (T11) · commands/optimistic apply (T12) ·
  hooks (T13-14) · JoinGate (T15) · app boot (T16) · shell (T17) · tracker
  (T18-23) · battle HUD/banners/overlays/wizards/watchers (T24-33) · chat +
  streaming + speech + glossary (T34-39) · one-line server change + cutover +
  test-swap + parity (T40-42). Every design section maps to a task.
- **Component-heavy tasks** (RigItem, HeatGauge, AttackWizard, RigWizard,
  RollConsole, GlossaryTip) intentionally cite exact source line ranges as the
  markup spec plus explicit class-name-parity requirements rather than reproducing
  hundreds of lines of JSX — the source file is authoritative and must be mirrored
  exactly. This is a deliberate instruction, not a placeholder.
- **Type/name consistency:** `sendCommand(verb, attrs)`, `applyServerState` action,
  `useRoomState/useRoomDispatch/useUi/useCommands/useDrawer/useRoll/useBattleActions/useWizard/useRoll` names are used consistently across tasks; the `{ version, state }`
  server payload shape and `ServerState` type are used everywhere state is adopted.
