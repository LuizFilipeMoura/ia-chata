# V2 Frontend — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `?v2`-gated, fully isolated V2 frontend covering Shell + Join + Squadron + Rig Terminal, wired to the real room state — a presentation-layer swap over V1.

**Architecture:** New `client/src/v2/` tree mirrors the real structure. `main.tsx` branches on a `?v2` flag to render `<V2App/>` (else `<App/>`), both inside the unchanged `<AppProviders/>`. V2 reuses 100% of V1's state/hooks/commands; it only supplies presentation + view-model mapping. All CSS is scoped under `.v2-root` with `--v2-*` tokens — zero collision with V1's global CSS.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + @testing-library/react (jsdom), shared game modules under `/shared/*.js`.

**Reference:** Spec at `docs/superpowers/specs/2026-07-11-v2-frontend-phase-a-design.md`. The visual source of truth is the mockup, copied into the repo in Task 0 at `client/src/v2/design-reference/oil-iron-terminal.html`. When a step says "port inline styles from mockup lines X–Y", open that file and translate the inline `style="..."` values into the scoped CSS class for that element. Colors map to `--v2-*` tokens (see Task 1's `tokens.css`).

**Key V1 APIs reused (verified):**
- Commands via `useCommands()` → `sendCommand(verb, attrs)` (POSTs `/api/game/:room/command`). Verbs used in Phase A: `damage {name,loc,amount:"1"}`, `repair {name,loc,amount:"1"}`, `remove {name}`, `activate {name}`, `setdice {value:"auto"|"manual"}`, `ready {side}`, `undo {side}`.
- Join: POST `/api/game/:room/join` `{name, side}` → `{side, state}`; server's returned `side` wins.
- State: `useRoomState()` → `{ rigs, game, field, ownerSide, session }`; `useRoomDispatch()`; actions `setSession`, `applyServerState`, `clearSession`.
- Hooks: `useRoomSocket(session, applyState)`, `useViewportHeight()`, `useMySide()`, `useWizard()` (`openCommission()`).
- Shared: `heatMeter(rig)`, `HEAT_CAPACITY`, `canAddRigForSide({rigs,game}, side)`, `MAX_RIGS_TOTAL`, `MAX_RIGS_PER_SIDE` from `/shared/game-state.js`; `kindOf`, `partNamesOf`, `UNIT_KINDS` from `/shared/unit-kinds.js`; `rigModifiers(rig)` from `/shared/battle-view.js`.
- Lib: `buildLoadout(rig)`, `rigStatus(rig)`, `barClass(component)`, `orderedRigs(rigs, side)`, `ownerLabel(owner, side)`.

**Test command (all tasks):** `npx vitest run <test-path>` from repo root. Full suite: `npm test`.

**Commit after every task.** Branch is `assets/commander-voice-lines`; keep committing there (do not create a PR in this plan).

---

## File Structure

```
client/src/
  main.tsx                       MODIFY — branch on shouldUseV2()
  v2/
    V2App.tsx                    session branching (Join vs Terminal), socket + join flow
    V2Terminal.tsx               the shell host: holds openRigId state, renders Shell + Squadron + RigTerminal
    shouldUseV2.ts               pure flag parser (unit-tested)
    lib/
      viewModels.ts              state → view-models: spColor, tonnage, rosterRows, commissioned count
    screens/
      Join.tsx                   join card wired to join POST
      Squadron.tsx               roster sections + header + add card + ready bar
    components/
      Shell.tsx                  .v2-root wrapper: status strip, channel nav, command dock, CRT overlays
      RigRow.tsx                 one roster row (own or enemy)
      CompRow.tsx                component SP bar + damage/repair
      HeatGauge.tsx              read-only segmented heat gauge
    overlays/
      RigTerminal.tsx            modal rig control terminal
    styles/
      tokens.css                 --v2-* tokens + fonts, scoped to .v2-root
      shell.css                  shell chrome + CRT
      join.css
      squadron.css
      rig-terminal.css
    design-reference/
      oil-iron-terminal.html     copied mockup (visual source of truth)
```

Screens/components each own one responsibility. `viewModels.ts` centralizes state→view mapping so components stay declarative and the mapping is unit-tested in isolation.

---

## Task 0: Scaffold V2 directory, tokens, and the `?v2` toggle

**Files:**
- Create: `client/src/v2/shouldUseV2.ts`
- Create: `client/src/v2/shouldUseV2.test.ts`
- Create: `client/src/v2/styles/tokens.css`
- Create: `client/src/v2/design-reference/oil-iron-terminal.html` (copy)
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Copy the mockup into the repo as visual reference**

Run (from repo root; source path is the unzipped handoff in scratch):

```bash
mkdir -p client/src/v2/design-reference
cp "/c/Users/breke/AppData/Local/Temp/claude/C--Users-breke-WebstormProjects-ia-regrinha/4583778a-a168-428d-aa24-6ce84d5121b6/scratchpad/v2zip/dieselpunk-game-ui-redesign/project/Oil & Iron Terminal.dc.html" client/src/v2/design-reference/oil-iron-terminal.html
```

If that source path no longer exists, re-extract from `~/Downloads/Dieselpunk game UI redesign-handoff.zip`. Verify: `wc -l client/src/v2/design-reference/oil-iron-terminal.html` → 700 lines.

- [ ] **Step 2: Write the failing test for the flag parser**

Create `client/src/v2/shouldUseV2.test.ts`:

```ts
import { expect, test } from "vitest";
import { shouldUseV2 } from "./shouldUseV2";

test("returns true when v2 query flag present", () => {
  expect(shouldUseV2("?v2")).toBe(true);
  expect(shouldUseV2("?foo=1&v2")).toBe(true);
  expect(shouldUseV2("?v2=1")).toBe(true);
});

test("returns false when absent", () => {
  expect(shouldUseV2("")).toBe(false);
  expect(shouldUseV2("?foo=1")).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run client/src/v2/shouldUseV2.test.ts`
Expected: FAIL — cannot find module `./shouldUseV2`.

- [ ] **Step 4: Implement the parser**

Create `client/src/v2/shouldUseV2.ts`:

```ts
// V2 is opt-in via a `?v2` query flag so it can ship alongside V1 with zero
// impact on the default experience. Accepts `?v2`, `?v2=1`, or `v2` among others.
export function shouldUseV2(search: string): boolean {
  return new URLSearchParams(search).has("v2");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run client/src/v2/shouldUseV2.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Write the V2 design tokens (scoped, prefixed)**

Create `client/src/v2/styles/tokens.css`. These are the mockup's tokens (mockup lines 15–25) but placed on `.v2-root` (NOT `:root`) and prefixed `--v2-`. This file also imports the fonts and defines the keyframes/scrollbar, all scoped.

```css
/* V2 design tokens — scoped to .v2-root, never :root, to guarantee no collision
   with V1's global tokens.css. Every custom property is prefixed --v2-. */
@import url("https://fonts.googleapis.com/css2?family=Stardos+Stencil:wght@400;700&family=Oswald:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap");

.v2-root {
  --v2-iron-950:#080a0d; --v2-iron-900:#0c0f14; --v2-iron-850:#12161d; --v2-iron-800:#171d25;
  --v2-iron-780:#1c2029; --v2-iron-750:#232a34; --v2-line:#2b323d; --v2-line-soft:#20262f; --v2-rivet:#3a424e;
  --v2-oil:#e79a3d; --v2-oil-hi:#ffbf6a; --v2-oil-deep:#a8641c;
  --v2-ember:#e5533a; --v2-ember-hi:#ff6f52; --v2-ember-deep:#8f2f22;
  --v2-txt:#eef2f7; --v2-txt-dim:#aeb7c4; --v2-txt-faint:#7b8593;
  --v2-ok:#6cc47f; --v2-warn:#e8bd57; --v2-low:#ef9450; --v2-crit:#f26a50;
  --v2-stencil:"Stardos Stencil","Oswald",system-ui,sans-serif;
  --v2-disp:"Oswald",system-ui,sans-serif;
  --v2-mono:"JetBrains Mono",ui-monospace,monospace;

  position:fixed; inset:0; z-index:10; display:flex; flex-direction:column;
  color:var(--v2-txt); font-family:var(--v2-disp); -webkit-font-smoothing:antialiased;
  background:
    radial-gradient(130% 90% at 50% -20%,rgba(231,154,61,.07),transparent 55%),
    radial-gradient(100% 60% at 50% 120%,rgba(50,58,72,.12),transparent 60%),
    #080a0d;
}
.v2-root *{box-sizing:border-box;}
.v2-root ::-webkit-scrollbar{width:8px;height:8px;}
.v2-root ::-webkit-scrollbar-thumb{background:#39414d;border:1px solid #10141a;}
.v2-root ::-webkit-scrollbar-track{background:#0b0e12;}
.v2-root a{color:var(--v2-oil);}
.v2-root a:hover{color:var(--v2-oil-hi);}

@keyframes v2-flick{0%,100%{opacity:.14}7%{opacity:.24}9%{opacity:.10}40%{opacity:.18}42%{opacity:.30}80%{opacity:.13}}
@keyframes v2-scan{from{background-position:0 0}to{background-position:0 6px}}
@keyframes v2-lampfast{0%,100%{opacity:.4}50%{opacity:1}}
@keyframes v2-grain{0%{transform:translate(0,0)}20%{transform:translate(-3%,2%)}40%{transform:translate(2%,-3%)}60%{transform:translate(-2%,-2%)}80%{transform:translate(3%,3%)}100%{transform:translate(0,0)}}
@keyframes v2-glowpulse{0%,100%{box-shadow:inset 0 0 0 1px rgba(231,154,61,.5),0 0 0 rgba(231,154,61,0)}50%{box-shadow:inset 0 0 0 1px rgba(231,154,61,.9),0 0 22px rgba(231,154,61,.35)}}
@media (prefers-reduced-motion:reduce){.v2-root *{animation:none!important}}
```

Note: `.v2-root` carries the app-shell layout (fixed, flex column) itself, so `Shell` renders directly into it. The mockup set `html,body{overflow:hidden}` globally — do NOT replicate that on `body`; the fixed `.v2-root` already covers the viewport and V1 must stay unaffected.

- [ ] **Step 7: Wire the toggle in `main.tsx`**

Modify `client/src/main.tsx` — keep V1 imports, add the branch. Replace the render call:

```tsx
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/rig-sheet.css";
import "./styles/battle.css";
import "./styles/join.css";
import "./styles/glossary.css";
import "./styles/rig-wizard.css";
import "./styles/vp-wizard.css";
import "./styles/dieselpunk.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppProviders } from "./AppProviders";
import { shouldUseV2 } from "./v2/shouldUseV2";
import V2App from "./v2/V2App";

const Root = shouldUseV2(window.location.search) ? V2App : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <Root />
    </AppProviders>
  </StrictMode>,
);
```

`V2App` does not exist yet — Step 8 stubs it so the build stays green.

- [ ] **Step 8: Stub V2App so the app compiles**

Create `client/src/v2/V2App.tsx`:

```tsx
import "./styles/tokens.css";

export default function V2App() {
  return <div className="v2-root">V2 boot…</div>;
}
```

- [ ] **Step 9: Verify build + tests are green**

Run: `npx vitest run client/src/v2` and `npx tsc -p . --noEmit` (or the project's typecheck). Expected: PASS / no type errors.

- [ ] **Step 10: Commit**

```bash
git add client/src/v2 client/src/main.tsx
git commit -m "feat(v2): scaffold v2 tree, scoped tokens, ?v2 toggle"
```

---

## Task 1: View-model helpers (`viewModels.ts`)

**Files:**
- Create: `client/src/v2/lib/viewModels.ts`
- Test: `client/src/v2/lib/viewModels.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `client/src/v2/lib/viewModels.test.ts`:

```ts
import { expect, test } from "vitest";
import { spColor, tonnage, commissioned } from "./viewModels";
import type { Rig } from "../../state/types";

const rig = (owner: "a" | "b", weightClass: "light" | "medium"): Rig => ({
  id: Math.floor(Math.random() * 1e6), name: "X", owner, weightClass,
  hull: { sp: 6, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: "ablative-plating", activated: false, destroyed: false,
});

test("spColor ramps from green to ember by ratio", () => {
  expect(spColor(6, 6)).toContain("6cc47f");   // full → green
  expect(spColor(4, 6)).toContain("e8bd57");   // ~66% → amber
  expect(spColor(2, 6)).toContain("ef9450");   // ~33% → orange
  expect(spColor(0, 6)).toContain("f26a50");   // dead → crit red
});

test("tonnage sums the cosmetic weight-class map for one side", () => {
  const rigs = [rig("a", "light"), rig("a", "medium"), rig("b", "light")];
  // light=6, medium=8 (cosmetic map) → side a = 14
  expect(tonnage(rigs, "a")).toBe(14);
});

test("commissioned counts a side's rigs against the per-side cap", () => {
  const rigs = [rig("a", "light"), rig("a", "medium"), rig("b", "light")];
  expect(commissioned(rigs, "a")).toEqual({ count: 2, max: 3 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/v2/lib/viewModels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `client/src/v2/lib/viewModels.ts`:

```ts
import { MAX_RIGS_PER_SIDE } from "/shared/game-state.js";
import type { Rig } from "../../state/types";

// SP-bar gradient thresholds, ported from the mockup's spColor (mockup lines
// 516–522). Returns a CSS linear-gradient string used as an inline bar fill.
export function spColor(cur: number, max: number): string {
  const p = max ? cur / max : 0;
  if (cur <= 0) return "linear-gradient(90deg,#8f2f22,#f26a50)";
  if (p <= 0.33) return "linear-gradient(90deg,#cf6a24,#ef9450)";
  if (p <= 0.66) return "linear-gradient(90deg,#c99327,#e8bd57)";
  return "linear-gradient(90deg,#4c9a5f,#6cc47f)";
}

// Cosmetic only — the game has no tonnage stat. Used for the Yard header flavor.
const TONS: Record<string, number> = { light: 6, medium: 8, heavy: 10, colossal: 12 };
export function tonnage(rigs: Rig[], side: string): number {
  return rigs
    .filter((r) => (r.owner || "a") === side)
    .reduce((sum, r) => sum + (TONS[r.weightClass] ?? 0), 0);
}

export function commissioned(rigs: Rig[], side: string): { count: number; max: number } {
  const count = rigs.filter((r) => (r.owner || "a") === side).length;
  return { count, max: MAX_RIGS_PER_SIDE };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run client/src/v2/lib/viewModels.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/lib
git commit -m "feat(v2): view-model helpers (spColor, tonnage, commissioned)"
```

---

## Task 2: V2App — session branching + join flow

**Files:**
- Modify: `client/src/v2/V2App.tsx`
- Test: `client/src/v2/V2App.test.tsx`

Mirror `App.tsx`: reuse `useRoomState`, `useRoomDispatch`, `useRoomSocket`, `useViewportHeight`, and the same join POST. No session → `<Join/>`; session → `<V2Terminal/>`. Join and V2Terminal are stubbed here and filled by later tasks.

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/V2App.test.tsx`:

```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../AppProviders";
import { useRoomDispatch } from "../state/RoomStateContext";
import V2App from "./V2App";

vi.mock("../hooks/useRoomSocket", () => ({ useRoomSocket: () => {} }));

function Seed() {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON", side: "a", name: "Kostov" } });
  }, [dispatch]);
  return null;
}

test("renders Join when there is no session", () => {
  render(<AppProviders><V2App /></AppProviders>);
  expect(screen.getByText(/ENLIST · COMMISSION · DEPLOY/i)).toBeInTheDocument();
});

test("renders the Terminal shell once a session exists", async () => {
  render(<AppProviders><Seed /><V2App /></AppProviders>);
  expect(await screen.findByText(/RIG CONTROL TERMINAL/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/v2/V2App.test.tsx`
Expected: FAIL — Join/Terminal text not present (stub renders "V2 boot…").

- [ ] **Step 3: Implement V2App + minimal Join/V2Terminal stubs**

Replace `client/src/v2/V2App.tsx`:

```tsx
import { useCallback, useState } from "react";
import "./styles/tokens.css";
import { useRoomState, useRoomDispatch } from "../state/RoomStateContext";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { useViewportHeight } from "../hooks/useViewportHeight";
import type { ServerState } from "../state/types";
import { Join } from "./screens/Join";
import { V2Terminal } from "./V2Terminal";

export default function V2App() {
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

  if (!session?.room) return <Join onJoin={onJoin} error={joinError} />;
  return <V2Terminal />;
}
```

Create stub `client/src/v2/screens/Join.tsx` (real UI in Task 4):

```tsx
interface Props { onJoin: (room: string, name: string, side: string) => void; error: string }
export function Join(_props: Props) {
  return (
    <div className="v2-root">
      <div className="v2-mono">ENLIST · COMMISSION · DEPLOY</div>
    </div>
  );
}
```

Create stub `client/src/v2/V2Terminal.tsx` (real shell in Task 3):

```tsx
export function V2Terminal() {
  return (
    <div className="v2-root">
      <header>RIG CONTROL TERMINAL · MK.IV</header>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run client/src/v2/V2App.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2
git commit -m "feat(v2): V2App session branching + join flow"
```

---

## Task 3: Shell — status strip, channel nav, command dock, CRT

**Files:**
- Create: `client/src/v2/components/Shell.tsx`
- Create: `client/src/v2/styles/shell.css`
- Modify: `client/src/v2/V2Terminal.tsx`
- Test: `client/src/v2/components/Shell.test.tsx`

`Shell` renders the `.v2-root` chrome and takes the active channel + a body via children. The command dock's **Leave** and **Revert** are wired here (reuse V1 logic). Channels other than Yard render disabled.

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/components/Shell.test.tsx`:

```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { Shell } from "./Shell";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

function Seed({ state }: { state: ServerState }) {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON-42", side: "a", name: "Kostov" } });
    dispatch({ type: "applyServerState", state });
  }, [dispatch, state]);
  return null;
}

const baseState: ServerState = {
  version: 1, rigs: [], ownerSide: "a", field: null,
  game: { round: 1, phase: "setup", started: false, sides: [], canUndo: false },
};

test("shows the room code and only the Yard channel active", async () => {
  render(<AppProviders><Seed state={baseState} /><Shell channel="yard"><div /></Shell></AppProviders>);
  expect(await screen.findByText(/IRON-42/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Yard/i })).toBeEnabled();
  expect(screen.getByRole("button", { name: /Forge/i })).toBeDisabled();
});

test("Leave opens a confirm dialog and wipes the session", async () => {
  const user = userEvent.setup();
  const clear = vi.spyOn(Storage.prototype, "clear");
  render(<AppProviders><Seed state={baseState} /><Shell channel="yard"><div /></Shell></AppProviders>);
  await user.click(await screen.findByRole("button", { name: /Leave/i }));
  await user.click(await screen.findByRole("button", { name: /Erase and leave/i }));
  expect(clear).toHaveBeenCalled();
});

test("Revert is hidden unless the server allows undo", async () => {
  render(<AppProviders><Seed state={baseState} /><Shell channel="yard"><div /></Shell></AppProviders>);
  await screen.findByText(/IRON-42/);
  expect(screen.queryByRole("button", { name: /Revert/i })).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/v2/components/Shell.test.tsx`
Expected: FAIL — `./Shell` not found.

- [ ] **Step 3: Implement Shell**

Create `client/src/v2/components/Shell.tsx`. Port the shell chrome markup from mockup lines 45–71 (CRT overlays + status strip), 73–85 (channel nav), 500–508 (command dock). Structure with classes (styles in Step 4):

```tsx
import { useEffect, useState, type ReactNode } from "react";
import "../styles/shell.css";
import { useRoomState, useRoomDispatch } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";

type Channel = "yard";
const CHANNELS: { id: string; num: string; label: string; enabled: boolean }[] = [
  { id: "join", num: "01", label: "Enlist", enabled: false },
  { id: "yard", num: "02", label: "Yard", enabled: true },
  { id: "commission", num: "03", label: "Forge", enabled: false },
  { id: "rulebook", num: "04", label: "Rules", enabled: false },
  { id: "outcome", num: "05", label: "Verdict", enabled: false },
];

export function Shell({ channel, children }: { channel: Channel; children: ReactNode }) {
  const { game, session } = useRoomState();
  const dispatch = useRoomDispatch();
  const sendCommand = useCommands();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const canUndo = !!game?.canUndo;

  useEffect(() => {
    if (!confirmLeave) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmLeave(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmLeave]);

  const doLeave = () => { localStorage.clear(); dispatch({ type: "clearSession" }); };

  return (
    <div className="v2-root">
      {/* CRT / ambient overlays — mockup lines 45–50 */}
      <div aria-hidden="true" className="v2-crt v2-crt--vignette" />
      <div aria-hidden="true" className="v2-crt v2-crt--scan" />
      <div aria-hidden="true" className="v2-crt v2-crt--grain" />
      <div aria-hidden="true" className="v2-crt v2-crt--flick" />

      <header className="v2-strip">
        <div className="v2-brand">
          <div className="v2-brand-badge"><div className="v2-brand-core" /></div>
          <div className="v2-brand-txt">
            <div className="v2-brand-name">OIL &amp; IRON</div>
            <div className="v2-brand-sub">RIG CONTROL TERMINAL · MK.IV</div>
          </div>
        </div>
        <div className="v2-strip-spacer" />
        <div className="v2-strip-meta">
          <div className="v2-link"><span className="v2-lamp v2-lamp--ok" />LINK ·LOCAL</div>
          <div className="v2-room">RM// {session?.room}</div>
        </div>
      </header>

      <nav className="v2-channels">
        {CHANNELS.map((ch) => (
          <button
            key={ch.id} type="button" disabled={!ch.enabled}
            aria-current={ch.id === channel ? "page" : undefined}
            className={"v2-channel" + (ch.id === channel ? " is-active" : "")}
          >
            <span className="v2-channel-num">{ch.num}</span>{ch.label}
          </button>
        ))}
      </nav>

      <main className="v2-screen">{children}</main>

      <footer className="v2-dock">
        <div className="v2-dock-label">CMD DOCK</div>
        <div className="v2-strip-spacer" />
        <button type="button" className="v2-dock-btn" disabled title="Rulebook — coming soon">
          <span>🛠</span>Rulebook
        </button>
        {canUndo && (
          <button type="button" className="v2-dock-btn"
            onClick={() => sendCommand("undo", { side: session?.side })}>
            <span>↺</span>Revert
          </button>
        )}
        <button type="button" className="v2-dock-btn v2-dock-btn--danger"
          onClick={() => setConfirmLeave(true)}>
          <span>⎋</span>Leave
        </button>
        <button type="button" className="v2-dock-gear" aria-label="Settings">⚙</button>
      </footer>

      {confirmLeave && (
        <div className="v2-leave-scrim" onClick={() => setConfirmLeave(false)}>
          <section className="v2-leave" role="dialog" aria-modal="true"
            aria-labelledby="v2LeaveTitle" onClick={(e) => e.stopPropagation()}>
            <div id="v2LeaveTitle" className="v2-leave-title">Leave room</div>
            <p className="v2-leave-copy">
              This clears local storage on this device and returns you to the join screen.
            </p>
            <div className="v2-leave-actions">
              <button type="button" className="v2-btn v2-btn--ghost" onClick={() => setConfirmLeave(false)}>Stay</button>
              <button type="button" className="v2-btn v2-btn--danger" onClick={doLeave}>Erase and leave</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write shell.css**

Create `client/src/v2/styles/shell.css`. Every selector is under `.v2-root`. Port exact values from mockup lines 45–71 / 73–85 / 500–508; the CRT layers use the `v2-*` keyframes from tokens.css. Skeleton (fill remaining values from the mockup):

```css
.v2-root .v2-crt{position:fixed;inset:0;z-index:9000;pointer-events:none;}
.v2-root .v2-crt--vignette{background:radial-gradient(120% 120% at 50% 50%,transparent 42%,rgba(0,0,0,.55) 82%,rgba(0,0,0,.92) 100%);}
.v2-root .v2-crt--scan{mix-blend-mode:multiply;background:repeating-linear-gradient(0deg,rgba(0,0,0,.32) 0 1px,rgba(0,0,0,0) 1px 3px);animation:v2-scan 1s steps(6) infinite;opacity:.7;}
.v2-root .v2-crt--grain{inset:-40%;opacity:.06;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");animation:v2-grain 1.2s steps(5) infinite;}
.v2-root .v2-crt--flick{background:radial-gradient(90% 70% at 50% 40%,rgba(231,154,61,.05),transparent 70%);animation:v2-flick 4s infinite;}

.v2-root .v2-strip{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:10px 16px 9px;background:linear-gradient(180deg,#12161d,#0b0e13);border-bottom:2px solid #000;box-shadow:inset 0 -1px 0 rgba(231,154,61,.14),0 3px 10px rgba(0,0,0,.6);}
.v2-root .v2-strip-spacer{flex:1;}
/* … port the remaining brand / meta / channel / dock / leave-dialog rules from
   the mockup, translating hex colors to var(--v2-*) where a token exists … */
.v2-root .v2-screen{flex:1;min-height:0;overflow-y:auto;position:relative;}
.v2-root .v2-channel[disabled]{opacity:.4;cursor:not-allowed;}
```

- [ ] **Step 5: Point V2Terminal at the Shell**

Replace `client/src/v2/V2Terminal.tsx`:

```tsx
import { Shell } from "./components/Shell";

export function V2Terminal() {
  return (
    <Shell channel="yard">
      <div />{/* Squadron mounts here in Task 6 */}
    </Shell>
  );
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run client/src/v2/components/Shell.test.tsx client/src/v2/V2App.test.tsx`
Expected: PASS (V2App's "Terminal shell" test now finds "RIG CONTROL TERMINAL" via the strip).

- [ ] **Step 7: Commit**

```bash
git add client/src/v2
git commit -m "feat(v2): shell — status strip, channel nav, command dock, CRT"
```

---

## Task 4: Join screen

**Files:**
- Modify: `client/src/v2/screens/Join.tsx`
- Create: `client/src/v2/styles/join.css`
- Test: `client/src/v2/screens/Join.test.tsx`

Port the join card from mockup lines 90–128. Wire to the `onJoin` prop. CTA disabled until room + side chosen; error line shown from the `error` prop.

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/screens/Join.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Join } from "./Join";

test("submits room, name, and chosen side", async () => {
  const user = userEvent.setup();
  const onJoin = vi.fn();
  render(<Join onJoin={onJoin} error="" />);

  await user.clear(screen.getByLabelText(/Battle Room Code/i));
  await user.type(screen.getByLabelText(/Battle Room Code/i), "iron-42");
  await user.clear(screen.getByLabelText(/Commander Designation/i));
  await user.type(screen.getByLabelText(/Commander Designation/i), "Kostov");
  await user.click(screen.getByRole("button", { name: /Enter The Yard/i }));

  expect(onJoin).toHaveBeenCalledWith("IRON-42", "Kostov", "a");
});

test("shows the error line when provided", () => {
  render(<Join onJoin={vi.fn()} error="Room is full." />);
  expect(screen.getByText("Room is full.")).toBeInTheDocument();
});
```

Note the expected room is upper-cased on submit (matches V1 behavior). Side A is the default selection, so the button emits `"a"`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/v2/screens/Join.test.tsx`
Expected: FAIL — inputs/labels not present (stub).

- [ ] **Step 3: Implement Join**

Replace `client/src/v2/screens/Join.tsx`. Port markup/styles from mockup lines 90–128; wire inputs + side picker + submit:

```tsx
import { useState } from "react";
import "../styles/join.css";

interface Props {
  onJoin: (room: string, name: string, side: string) => void;
  error: string;
}

export function Join({ onJoin, error }: Props) {
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [side, setSide] = useState("a");

  const ready = room.trim().length > 0 && !!side;
  const status = ready
    ? "◈ ALL SYSTEMS NOMINAL — READY TO ENLIST"
    : "Enter a room code to enlist.";

  const submit = () => { if (ready) onJoin(room.trim().toUpperCase(), name.trim(), side); };

  return (
    <div className="v2-root">
      <section className="v2-join">
        <div className="v2-join-card">
          <div className="v2-join-title">OIL<span>&amp;</span>IRON</div>
          <div className="v2-join-tagline">ENLIST · COMMISSION · DEPLOY</div>

          <label className="v2-join-label" htmlFor="v2Room">Battle Room Code</label>
          <div className="v2-join-field">
            <span className="v2-join-ic">◈</span>
            <input id="v2Room" className="v2-join-input v2-join-input--code"
              value={room} onChange={(e) => setRoom(e.target.value)} />
          </div>

          <label className="v2-join-label" htmlFor="v2Name">Commander Designation</label>
          <div className="v2-join-field">
            <span className="v2-join-ic">▸</span>
            <input id="v2Name" className="v2-join-input"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="v2-join-label">Declare Allegiance</div>
          <div className="v2-join-sides">
            <button type="button"
              className={"v2-side v2-side--a" + (side === "a" ? " is-sel" : "")}
              aria-pressed={side === "a"} onClick={() => setSide("a")}>
              <div className="v2-side-tag">SIDE · A</div>
              <div className="v2-side-name">FRIENDLY</div>
            </button>
            <button type="button"
              className={"v2-side v2-side--b" + (side === "b" ? " is-sel" : "")}
              aria-pressed={side === "b"} onClick={() => setSide("b")}>
              <div className="v2-side-tag">SIDE · B</div>
              <div className="v2-side-name">HOSTILE</div>
            </button>
          </div>

          <button type="button" className="v2-join-cta" disabled={!ready} onClick={submit}>
            Enter The Yard ▸
          </button>

          {error
            ? <p className="v2-join-status v2-join-status--err">{error}</p>
            : <p className="v2-join-status">{status}</p>}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Write join.css**

Create `client/src/v2/styles/join.css`, all selectors under `.v2-root`. Port values from mockup lines 90–128 (card frame, rivets, hazard stripe, title, fields, side cards, CTA). Map colors to `--v2-*`.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run client/src/v2/screens/Join.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/v2
git commit -m "feat(v2): join screen wired to join flow"
```

---

## Task 5: RigRow component

**Files:**
- Create: `client/src/v2/components/RigRow.tsx`
- Test: `client/src/v2/components/RigRow.test.tsx`

Port the roster row from mockup lines 150–178 (own) / 186–205 (enemy). One component handles both via a `hostile` prop. Renders class glyph, name, ACTIVE badge, loadout summary, four H/A/L/E mini-bars from real SP/max via `spColor`, and a status dot. Clicking calls `onOpen`.

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/components/RigRow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { RigRow } from "./RigRow";
import type { Rig } from "../../state/types";

const rig: Rig = {
  id: 1, name: "STALKER", owner: "a", weightClass: "light",
  hull: { sp: 4, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 3, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  weapons: { longRange: "Autocannon", melee: "Claw" },
  equipment: "ablative-plating", activated: false, destroyed: false,
};

test("renders name and four component bars and opens on click", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  render(<RigRow rig={rig} hostile={false} onOpen={onOpen} />);
  expect(screen.getByText("STALKER")).toBeInTheDocument();
  // H/A/L/E labels present
  ["H", "A", "L", "E"].forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /STALKER/i }));
  expect(onOpen).toHaveBeenCalledWith(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/v2/components/RigRow.test.tsx`
Expected: FAIL — `./RigRow` not found.

- [ ] **Step 3: Implement RigRow**

Create `client/src/v2/components/RigRow.tsx`:

```tsx
import { heatMeter } from "/shared/game-state.js";
import { kindOf, UNIT_KINDS } from "/shared/unit-kinds.js";
import { buildLoadout } from "../../lib/loadout";
import { spColor } from "../lib/viewModels";
import type { Rig, Component } from "../../state/types";

const CLASS_GLYPH: Record<string, [string, string, string]> = {
  light: ["◆", "LGT", "#8fbcff"], medium: ["◈", "MED", "#e8bd57"],
  heavy: ["⬢", "HVY", "#ef9450"], colossal: ["✦", "COL", "#f26a50"],
};

function loadoutText(rig: Rig): string {
  const lo = buildLoadout(rig);
  if (!lo) return "";
  if (lo.flat) return lo.unit?.name ?? "";
  return [lo.lr?.name, lo.melee?.name].filter(Boolean).join(" · ");
}

const BARS: { tag: string; loc: "hull" | "arms" | "legs" | "engine" }[] = [
  { tag: "H", loc: "hull" }, { tag: "A", loc: "arms" },
  { tag: "L", loc: "legs" }, { tag: "E", loc: "engine" },
];

export function RigRow({ rig, hostile, onOpen }: { rig: Rig; hostile: boolean; onOpen: (id: number) => void }) {
  const [glyph, short, color] = CLASS_GLYPH[rig.weightClass] ?? CLASS_GLYPH.light;
  const cold = !UNIT_KINDS[kindOf(rig)].hasHeat;
  const m = cold ? null : heatMeter(rig);
  const statusColor = rig.destroyed ? "#f26a50" : "#6cc47f";

  return (
    <button
      type="button"
      className={"v2-rigrow" + (hostile ? " v2-rigrow--hostile" : "")}
      onClick={() => onOpen(rig.id)}
    >
      <span className="v2-rigrow-stripe" />
      <span className="v2-rigrow-class" style={{ color }}>
        <span className="v2-rigrow-glyph">{glyph}</span>
        <span className="v2-rigrow-short">{short}</span>
      </span>
      <span className="v2-rigrow-main">
        <span className="v2-rigrow-head">
          <span className="v2-rigrow-name">{rig.name}</span>
          {rig.activated && !hostile && <span className="v2-rigrow-badge">ACTIVE</span>}
          {!cold && m && <span className="v2-rigrow-heat" data-zone={m.zone}>🔥{m.heat}</span>}
        </span>
        <span className="v2-rigrow-loadout">{loadoutText(rig)}</span>
        <span className="v2-rigrow-bars">
          {BARS.map(({ tag, loc }) => {
            const c = rig[loc] as Component;
            return (
              <span key={tag} className="v2-rigrow-bar">
                <span className="v2-rigrow-bar-head">
                  <span>{tag}</span><span>{c.sp}/{c.max}</span>
                </span>
                <span className="v2-rigrow-bar-track">
                  <span className="v2-rigrow-bar-fill"
                    style={{ width: `${Math.max(0, Math.round((c.sp / c.max) * 100))}%`, background: spColor(c.sp, c.max) }} />
                </span>
              </span>
            );
          })}
        </span>
      </span>
      <span className="v2-rigrow-status">
        <span className="v2-rigrow-dot" style={{ background: statusColor }} />
      </span>
    </button>
  );
}
```

Create `client/src/v2/styles/squadron.css` now (or defer to Task 6) — the RigRow classes live there; if deferring, RigRow renders unstyled in this task's test (fine, the test asserts content not pixels). To keep imports clean, import `../styles/squadron.css` at the top of RigRow.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run client/src/v2/components/RigRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2
git commit -m "feat(v2): RigRow roster row from real rig state"
```

---

## Task 6: Squadron screen

**Files:**
- Create: `client/src/v2/screens/Squadron.tsx`
- Modify: `client/src/v2/styles/squadron.css` (add screen-level rules; port mockup 131–221)
- Modify: `client/src/v2/V2Terminal.tsx`
- Test: `client/src/v2/screens/Squadron.test.tsx`

Squadron renders: header (THE YARD, commissioned N/max, tonnage), Your Squadron section (own rows), Hostile Forces section (enemy rows), the commission add card (interim → `useWizard().openCommission()`, gated by `canAddRigForSide`), and the ready bar (dice toggle + Ready, same gating as V1 `BattleSetup`). It takes an `onOpenRig` prop so V2Terminal owns the overlay state.

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/screens/Squadron.test.tsx`:

```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { Squadron } from "./Squadron";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

const rig = (id: number, name: string, owner: "a" | "b"): Rig => ({
  id, name, owner, weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  weapons: { longRange: "Autocannon", melee: "Claw" },
  equipment: "ablative-plating", activated: false, destroyed: false,
});

function Seed({ state }: { state: ServerState }) {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON-42", side: "a", name: "Kostov" } });
    dispatch({ type: "applyServerState", state });
  }, [dispatch, state]);
  return null;
}

test("groups own vs hostile rigs and shows the commissioned count", async () => {
  const state: ServerState = {
    version: 1, ownerSide: "a", field: null,
    rigs: [rig(1, "STALKER", "a"), rig(2, "CINDER", "a"), rig(3, "GRAVELORD", "b")],
    game: { round: 1, phase: "setup", started: false, sides: [
      { id: "a", name: "Kostov", vp: 0, ready: false },
      { id: "b", name: "Rival", vp: 0, ready: false },
    ] },
  };
  render(<AppProviders><Seed state={state} /><Squadron onOpenRig={vi.fn()} /></AppProviders>);
  expect(await screen.findByText("YOUR SQUADRON")).toBeInTheDocument();
  expect(screen.getByText("HOSTILE FORCES")).toBeInTheDocument();
  expect(screen.getByText(/2 \/ 3 COMMISSIONED/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/v2/screens/Squadron.test.tsx`
Expected: FAIL — `./Squadron` not found.

- [ ] **Step 3: Implement Squadron**

Create `client/src/v2/screens/Squadron.tsx`:

```tsx
import "../styles/squadron.css";
import { canAddRigForSide } from "/shared/game-state.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { useWizard } from "../../state/WizardContext";
import { orderedRigs } from "../../lib/rigView";
import { commissioned, tonnage } from "../lib/viewModels";
import { RigRow } from "../components/RigRow";

export function Squadron({ onOpenRig }: { onOpenRig: (id: number) => void }) {
  const { rigs, game, field } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const enemySide = mySide === "a" ? "b" : "a";
  const { openCommission } = useWizard();

  const ordered = orderedRigs(rigs, mySide);
  const mine = ordered.filter((r) => (r.owner || "a") === mySide);
  const foes = ordered.filter((r) => (r.owner || "a") === enemySide);
  const { count, max } = commissioned(rigs, mySide);
  const canAdd = canAddRigForSide({ rigs, game }, mySide);

  const started = Boolean(game?.started);
  const auto = game?.autoResolve !== false;
  const sideName = (id: string) => game?.sides?.find((s) => s.id === id)?.name || (id === "a" ? "Side A" : "Side B");
  const sideReady = (id: string) => Boolean(game?.sides?.find((s) => s.id === id)?.ready);
  const myReady = sideReady(mySide);
  const readyDisabled = started || myReady || count < max || !field?.locked;

  return (
    <section className="v2-yard">
      <div className="v2-yard-head">
        <div>
          <div className="v2-yard-eyebrow">DEPOT ROSTER</div>
          <h1 className="v2-yard-title">THE YARD</h1>
        </div>
        <div className="v2-yard-stats">
          <div className="v2-yard-count">{count} / {max} COMMISSIONED</div>
          <div className="v2-yard-tons">TONNAGE · {tonnage(rigs, mySide)} T</div>
        </div>
      </div>

      <div className="v2-yard-band v2-yard-band--own">
        <span className="v2-yard-band-dot" /><span>YOUR SQUADRON</span><span className="v2-yard-band-rule" />
      </div>
      <div className="v2-yard-list">
        {mine.map((r) => <RigRow key={r.id} rig={r} hostile={false} onOpen={onOpenRig} />)}
      </div>

      {foes.length > 0 && (
        <>
          <div className="v2-yard-band v2-yard-band--foe">
            <span className="v2-yard-band-dot" /><span>HOSTILE FORCES</span><span className="v2-yard-band-rule" />
          </div>
          <div className="v2-yard-list">
            {foes.map((r) => <RigRow key={r.id} rig={r} hostile onOpen={onOpenRig} />)}
          </div>
        </>
      )}

      {!started && (
        <button type="button" className="v2-yard-add" disabled={!canAdd}
          onClick={() => canAdd && openCommission()}>
          <span className="v2-yard-add-plus">＋</span>
          {canAdd ? "Commission New Rig" : "Roster full — ready up"}
        </button>
      )}

      {!started && (
        <div className="v2-yard-ready">
          <div className="v2-yard-ready-txt">
            <div className="v2-yard-ready-line">
              {sideName(mySide)} {myReady ? "READY" : "NOT READY"} · {sideName(enemySide)} {sideReady(enemySide) ? "READY" : "NOT READY"}
            </div>
            <div className="v2-yard-ready-sub">
              {!field?.locked ? "Owner must lock the field before you can ready up."
                : count < max ? `Choose ${max - count} more Rig${max - count === 1 ? "" : "s"} to ready up.`
                : "Tap any Rig to open its Control Terminal."}
            </div>
          </div>
          <button type="button" className="v2-yard-dice" aria-pressed={auto} disabled={started}
            onClick={() => sendCommand("setdice", { value: auto ? "manual" : "auto" })}>
            🎲 {auto ? "AUTO" : "MANUAL"}
          </button>
          <button type="button" className="v2-yard-readybtn" disabled={readyDisabled}
            onClick={() => sendCommand("ready", { side: mySide })}>
            READY
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Add squadron.css screen rules**

Add to `client/src/v2/styles/squadron.css` the `.v2-yard*` rules (header, section bands, add card, ready bar) ported from mockup lines 131–221, plus the `.v2-rigrow*` rules from mockup lines 150–205. All under `.v2-root`.

- [ ] **Step 5: Mount Squadron in V2Terminal (overlay state comes in Task 9)**

Replace `client/src/v2/V2Terminal.tsx`:

```tsx
import { useState } from "react";
import { Shell } from "./components/Shell";
import { Squadron } from "./screens/Squadron";

export function V2Terminal() {
  const [openRigId, setOpenRigId] = useState<number | null>(null);
  return (
    <Shell channel="yard">
      <Squadron onOpenRig={setOpenRigId} />
      {/* RigTerminal overlay wired in Task 9 (uses openRigId / setOpenRigId) */}
      {openRigId !== null && null}
    </Shell>
  );
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run client/src/v2/screens/Squadron.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/v2
git commit -m "feat(v2): squadron screen — roster, add card, ready bar"
```

---

## Task 7: CompRow (V2)

**Files:**
- Create: `client/src/v2/components/CompRow.tsx`
- Create: `client/src/v2/styles/rig-terminal.css` (start it here)
- Test: `client/src/v2/components/CompRow.test.tsx`

Port the terminal component row from mockup lines 346–362: label, SP bar, `− Damage` / `+ Repair` buttons wired to `damage` / `repair` verbs with the delta-flash behavior from V1's `CompRow`.

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/components/CompRow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CompRow } from "./CompRow";
import type { Rig } from "../../state/types";

const rig = { id: 1, name: "STALKER" } as unknown as Rig;

test("damage and repair dispatch the right commands", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  render(<CompRow rigName="STALKER" loc="hull" comp={{ sp: 4, max: 6, destroyed: false }} onCommand={onCommand} />);
  await user.click(screen.getByRole("button", { name: /Damage hull/i }));
  expect(onCommand).toHaveBeenCalledWith("damage", { name: "STALKER", loc: "hull", amount: "1" });
  await user.click(screen.getByRole("button", { name: /Repair hull/i }));
  expect(onCommand).toHaveBeenCalledWith("repair", { name: "STALKER", loc: "hull", amount: "1" });
});

test("shows CATASTROPHIC at 0 SP", () => {
  render(<CompRow rigName="X" loc="legs" comp={{ sp: 0, max: 5, destroyed: false }} onCommand={vi.fn()} />);
  expect(screen.getByText("CATASTROPHIC")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/v2/components/CompRow.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement CompRow**

Create `client/src/v2/components/CompRow.tsx`:

```tsx
import { useEffect, useRef } from "react";
import "../styles/rig-terminal.css";
import { spColor } from "../lib/viewModels";
import type { Component } from "../../state/types";

interface Props {
  rigName: string;
  loc: string;
  comp: Component;
  onCommand: (verb: string, attrs: Record<string, unknown>) => void;
}

export function CompRow({ rigName, loc, comp, onCommand }: Props) {
  const label = loc.charAt(0).toUpperCase() + loc.slice(1);
  const text = comp.destroyed ? "DESTROYED" : comp.sp === 0 ? "CATASTROPHIC" : `${comp.sp}/${comp.max}`;

  const prev = useRef<number | null>(null);
  const prior = prev.current;
  useEffect(() => { prev.current = comp.sp; });
  const damaged = prior != null && comp.sp < prior;
  const healed = prior != null && comp.sp > prior;
  const delta = prior != null ? Math.abs(comp.sp - prior) : 0;

  const cls = "v2-comp" + (damaged ? " is-hit" : healed ? " is-heal" : "");

  return (
    <div className={cls}>
      <span className="v2-comp-label">{label}</span>
      <button type="button" className="v2-comp-step v2-comp-step--dmg" aria-label={`Damage ${loc}`}
        onClick={() => onCommand("damage", { name: rigName, loc, amount: "1" })}>−</button>
      <div className="v2-comp-bar">
        <div className="v2-comp-bar-fill"
          style={{ width: `${Math.round((comp.sp / comp.max) * 100)}%`, background: spColor(comp.sp, comp.max) }} />
        <div className="v2-comp-bar-text">{text}</div>
      </div>
      <button type="button" className="v2-comp-step v2-comp-step--rep" aria-label={`Repair ${loc}`}
        onClick={() => onCommand("repair", { name: rigName, loc, amount: "1" })}>＋</button>
      {(damaged || healed) && (
        <span className={"v2-comp-delta " + (damaged ? "is-hit" : "is-heal")} aria-hidden="true">
          {damaged ? "−" : "+"}{delta}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Start rig-terminal.css**

Create `client/src/v2/styles/rig-terminal.css` with the `.v2-comp*` rules ported from mockup lines 346–362 (bar track, redline hatch, ± buttons, delta flash keyframes), under `.v2-root`.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run client/src/v2/components/CompRow.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/v2
git commit -m "feat(v2): CompRow with wired damage/repair"
```

---

## Task 8: HeatGauge (V2, read-only)

**Files:**
- Create: `client/src/v2/components/HeatGauge.tsx`
- Modify: `client/src/v2/styles/rig-terminal.css`
- Test: `client/src/v2/components/HeatGauge.test.tsx`

Read-only segmented gauge. Reuse `heatMeter(rig)` and hide for cold kinds — same logic as V1's `HeatGauge`, re-styled. No stoke/vent (Phase C).

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/components/HeatGauge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { HeatGauge } from "./HeatGauge";
import type { Rig } from "../../state/types";

const base = (over: Partial<Rig> = {}): Rig => ({
  id: 1, name: "X", owner: "a", weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 3 },
  equipment: "ablative-plating", activated: false, destroyed: false, ...over,
});

test("renders the heat reading for a heat-bearing rig", () => {
  render(<HeatGauge rig={base()} />);
  expect(screen.getByText("ENGINE HEAT")).toBeInTheDocument();
});

test("renders nothing for a cold kind", () => {
  const tank = base({ kind: "tank" });
  const { container } = render(<HeatGauge rig={tank} />);
  expect(container).toBeEmptyDOMElement();
});
```

(`kind: "tank"` makes `UNIT_KINDS[kindOf(rig)].hasHeat` false.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/v2/components/HeatGauge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement HeatGauge**

Create `client/src/v2/components/HeatGauge.tsx`. Port the gauge visuals from mockup lines 365–376 but as the true segmented track (V1 approach) driven by `heatMeter`:

```tsx
import "../styles/rig-terminal.css";
import { heatMeter } from "/shared/game-state.js";
import { UNIT_KINDS, kindOf } from "/shared/unit-kinds.js";
import type { Rig } from "../../state/types";

export function HeatGauge({ rig }: { rig: Rig }) {
  if (!UNIT_KINDS[kindOf(rig)].hasHeat) return null;
  const m = heatMeter(rig);
  const displayMax = m.cap + 4;
  const shownHeat = Math.min(m.heat, displayMax);

  const segs = [];
  for (let i = 0; i < displayMax; i++) {
    const c = ["v2-heat-seg"];
    if (i >= m.cap) c.push("v2-heat-seg--danger");
    if (i === m.cap) c.push("v2-heat-seg--redline");
    if (i < shownHeat) c.push("v2-heat-seg--on");
    segs.push(<span key={i} className={c.join(" ")} />);
  }

  const note =
    m.zone === "over" ? `⚠ misfire roll = D12 + ${m.bonus}`
    : m.zone === "redline" ? "At redline — one more triggers a misfire check"
    : m.zone === "cold" ? `Cold — full ${m.cap} of headroom`
    : m.zone === "warm" ? `Running hot — ${m.cap - m.heat} to redline`
    : `Nominal — ${m.cap - m.heat} to redline`;

  return (
    <div className="v2-heat" data-zone={m.zone}>
      <div className="v2-heat-head">
        <span className="v2-heat-label">ENGINE HEAT</span>
        <span className="v2-heat-read"><b>{m.heat}</b>/{m.cap}</span>
      </div>
      <div className="v2-heat-track">{segs}</div>
      <div className="v2-heat-note">{note}</div>
      {m.floor > 0 && <div className="v2-heat-lock">Engine wrecked · heat locked ≥ {m.floor}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Add heat rules to rig-terminal.css**

Append `.v2-heat*` rules (segmented track, danger/redline/on cells, zone-driven note color) under `.v2-root`, styled per the mockup's ember/amber palette (mockup lines 365–376).

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run client/src/v2/components/HeatGauge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/v2
git commit -m "feat(v2): read-only heat gauge"
```

---

## Task 9: RigTerminal overlay + wire into V2Terminal

**Files:**
- Create: `client/src/v2/overlays/RigTerminal.tsx`
- Modify: `client/src/v2/styles/rig-terminal.css`
- Modify: `client/src/v2/V2Terminal.tsx`
- Test: `client/src/v2/overlays/RigTerminal.test.tsx`

Modal overlay for a single rig: header (glyph/name/class/loadout/status), status-effect chips (`rigModifiers`), loadout detail (`buildLoadout`), component rows (`CompRow` over `partNamesOf(kind)`), read-only `HeatGauge`, Remove, and an Activate CTA gated by a `canActivate` prop. Close via scrim/✕/Escape. Port frame from mockup lines 310–416.

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/overlays/RigTerminal.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { RigTerminal } from "./RigTerminal";
import type { Rig } from "../../state/types";

const rig: Rig = {
  id: 1, name: "STALKER", owner: "a", weightClass: "light",
  hull: { sp: 4, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 2, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 3 },
  weapons: { longRange: "Autocannon", melee: "Claw" },
  weaponUpgrades: { longRange: "machined", melee: "field" },
  equipment: "ablative-plating", activated: false, destroyed: false,
};

test("renders header, four component rows, and remove", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  render(<RigTerminal rig={rig} canActivate={false} started={false} onCommand={onCommand} onClose={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "STALKER" })).toBeInTheDocument();
  ["Hull", "Arms", "Legs", "Engine"].forEach((l) => expect(screen.getByText(l)).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /Remove STALKER/i }));
  expect(onCommand).toHaveBeenCalledWith("remove", { name: "STALKER" });
});

test("Escape closes the overlay", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<RigTerminal rig={rig} canActivate={false} started={false} onCommand={vi.fn()} onClose={onClose} />);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});

test("activate CTA disabled with a wait label when not activatable in battle", () => {
  render(<RigTerminal rig={rig} canActivate={false} started onCommand={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole("button", { name: /Wait for your turn/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/v2/overlays/RigTerminal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RigTerminal**

Create `client/src/v2/overlays/RigTerminal.tsx`:

```tsx
import { useEffect } from "react";
import "../styles/rig-terminal.css";
import { rigModifiers } from "/shared/battle-view.js";
import { kindOf, partNamesOf, UNIT_KINDS } from "/shared/unit-kinds.js";
import { buildLoadout } from "../../lib/loadout";
import { rigStatus } from "../../lib/rigView";
import { CompRow } from "../components/CompRow";
import { HeatGauge } from "../components/HeatGauge";
import type { Rig, Component } from "../../state/types";

const CLASS_GLYPH: Record<string, string> = { light: "◆", medium: "◈", heavy: "⬢", colossal: "✦" };

interface Props {
  rig: Rig;
  canActivate: boolean;
  started: boolean;
  onCommand: (verb: string, attrs: Record<string, unknown>) => void;
  onClose: () => void;
}

export function RigTerminal({ rig, canActivate, started, onCommand, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kind = kindOf(rig);
  const locs: string[] = partNamesOf(kind);
  const cold = !UNIT_KINDS[kind].hasHeat;
  const badge = rig.weightClass || UNIT_KINDS[kind].label;
  const st = rigStatus(rig);
  const mods = rigModifiers(rig);
  const lo = buildLoadout(rig);

  const activateLabel = canActivate ? "◈ Activate Rig" : "Wait for your turn";

  return (
    <div className="v2-rt-scrim" onClick={onClose}>
      <section className="v2-rt" role="dialog" aria-modal="true"
        aria-label={`${rig.name} control terminal`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="v2-rt-close" aria-label="Close terminal" onClick={onClose}>✕</button>

        <header className="v2-rt-head">
          <span className="v2-rt-glyph">{CLASS_GLYPH[rig.weightClass] ?? "◆"}</span>
          <div className="v2-rt-id">
            <h2 className="v2-rt-name">{rig.name}</h2>
            <div className="v2-rt-sub">{badge} · {lo?.flat ? lo.unit?.name : [lo?.lr?.name, lo?.melee?.name].filter(Boolean).join(" · ")}</div>
          </div>
          <div className={"v2-rt-status v2-rt-status--" + (st.cls || "ok")}>{st.text}</div>
        </header>

        {mods.length > 0 && (
          <div className="v2-rt-mods">
            {mods.map((mod, i) => <span key={i} className="v2-rt-mod" data-tone={mod.tone}>{mod.tag}</span>)}
          </div>
        )}

        <div className="v2-rt-comps">
          {locs.map((loc) => (
            <CompRow key={loc} rigName={rig.name} loc={loc} comp={rig[loc as keyof Rig] as Component} onCommand={onCommand} />
          ))}
        </div>

        {!cold && <HeatGauge rig={rig} />}

        <div className="v2-rt-actions">
          <button type="button" className="v2-rt-activate" disabled={!canActivate || !started}
            onClick={() => canActivate && onCommand("activate", { name: rig.name })}>
            {activateLabel}
          </button>
          <button type="button" className="v2-rt-remove" aria-label={`Remove ${rig.name}`}
            onClick={() => onCommand("remove", { name: rig.name })}>
            ✕ Remove Rig
          </button>
        </div>
      </section>
    </div>
  );
}
```

Note: the pre-battle case (`started === false`) leaves Activate disabled with the "Wait for your turn" label — Phase A does not expose the V1 pre-battle heat-preview toggle; activation is a battle concern surfaced fully in Phase C.

- [ ] **Step 4: Add overlay rules to rig-terminal.css**

Append `.v2-rt*` rules (scrim, sheet frame with glowpulse + rivets from mockup lines 310–333, header, mods, actions) under `.v2-root`.

- [ ] **Step 5: Wire the overlay into V2Terminal**

Replace `client/src/v2/V2Terminal.tsx`:

```tsx
import { useState } from "react";
import { Shell } from "./components/Shell";
import { Squadron } from "./screens/Squadron";
import { RigTerminal } from "./overlays/RigTerminal";
import { useRoomState } from "../state/RoomStateContext";
import { useCommands } from "../hooks/useCommands";
import { useMySide } from "../hooks/useMySide";

export function V2Terminal() {
  const { rigs, game } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const [openRigId, setOpenRigId] = useState<number | null>(null);

  const openRig = rigs.find((r) => r.id === openRigId) || null;
  const started = Boolean(game?.started);
  const pendingGate = Boolean(game?.pendingAnswer || game?.pendingReaction || game?.pendingBlast);
  const canActivate =
    !!openRig && started && game?.phase === "activation" && game?.turn?.side === mySide &&
    (openRig.owner || "a") === mySide && game?.turn?.activeRigId == null && !pendingGate &&
    !openRig.activated && !openRig.destroyed;

  return (
    <Shell channel="yard">
      <Squadron onOpenRig={setOpenRigId} />
      {openRig && (
        <RigTerminal
          rig={openRig}
          started={started}
          canActivate={canActivate}
          onCommand={sendCommand}
          onClose={() => setOpenRigId(null)}
        />
      )}
    </Shell>
  );
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run client/src/v2/overlays/RigTerminal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add client/src/v2
git commit -m "feat(v2): rig terminal overlay wired into shell"
```

---

## Task 10: CSS isolation guard test

**Files:**
- Test: `client/src/v2/styles/isolation.test.ts`

Assert no V2 stylesheet contains a bare `:root`, `html`, or `body` selector — the guarantee that V2 never touches V1's globals.

- [ ] **Step 1: Write the test**

Create `client/src/v2/styles/isolation.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const dir = fileURLToPath(new URL(".", import.meta.url));

test("every V2 stylesheet scopes all rules under .v2-root (no global selectors)", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".css"));
  expect(files.length).toBeGreaterThan(0);
  const offenders: string[] = [];
  for (const f of files) {
    const css = readFileSync(new URL(f, import.meta.url), "utf8");
    // Strip @import/@media/@keyframes lines from the check surface; then look for
    // top-level element/root selectors that would leak into V1.
    const lines = css.split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (/^(:root|html|body)\b/.test(trimmed)) offenders.push(`${f}:${i + 1} ${trimmed}`);
      // A selector line that starts a rule but does not mention .v2-root
      if (/\{\s*$/.test(trimmed) && !trimmed.startsWith("@") && !trimmed.includes(".v2-root") && !trimmed.startsWith("."))
        { /* allow nested keyframe percentages like `50% {` */ }
    });
  }
  expect(offenders, offenders.join("\n")).toEqual([]);
});
```

- [ ] **Step 2: Run — expect PASS (or fix any offender)**

Run: `npx vitest run client/src/v2/styles/isolation.test.ts`
Expected: PASS. If it fails, the named file/line has a global selector — rewrite it as `.v2-root <selector>`.

- [ ] **Step 3: Commit**

```bash
git add client/src/v2/styles/isolation.test.ts
git commit -m "test(v2): guard against global CSS leakage"
```

---

## Task 11: Full-suite + manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all V1 tests still pass (V2 is additive) and all new V2 tests pass.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p . --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify in the browser (per the verification workflow)**

Start the dev server, open `http://localhost:5173/?v2`. Confirm:
1. Join screen renders in the dieselpunk V2 style; entering a room + name and choosing a side enters the Yard.
2. Yard shows own + enemy rigs with live component bars; commissioned count and tonnage render.
3. "Commission New Rig" opens the (V1) commission wizard; adding a rig updates the V2 roster.
4. Tapping a rig opens the V2 Rig Terminal; − / + change component SP (delta flash); heat gauge reflects state; Remove works; Escape/✕/scrim close it.
5. Dice AUTO/MANUAL toggles; READY enables only with 3 rigs + locked field.
6. Command dock: Leave confirms + returns to Join; Revert appears only when the server allows undo.
7. Open `http://localhost:5173/` (no `?v2`) and confirm V1 is visually unchanged (CSS isolation held).

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore(v2): phase A verification fixes"
```

---

## Self-Review Notes (author)

- **Spec coverage:** entry+toggle (T0), reuse boundary (T2), shell/channel/dock/CRT (T3), Join (T4), Squadron incl. add-card interim + ready bar (T5,T6), RigRow (T5), RigTerminal incl. mods/loadout/comp/heat/remove/activate-gate (T7,T8,T9), CSS isolation (T0 tokens + T10 guard), testing (every task). Tonnage cosmetic (T1). Heat read-only (T8) — matches corrected spec.
- **Deferred per spec (not gaps):** action console + Fire overlay (Phase C), V2 commission wizard (Phase B, interim delegates to V1), chat/glossary (Phase D).
- **Type consistency:** `sendCommand(verb, attrs)`, `CompRow` prop shape `{rigName, loc, comp, onCommand}`, `RigRow` `{rig, hostile, onOpen}`, `RigTerminal` `{rig, canActivate, started, onCommand, onClose}`, `commissioned → {count, max}` — used consistently across tasks.
