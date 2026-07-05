# Score Objectives — VP Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw `window.prompt` VP scoring during the Recovery Phase with a wizard that lists the three objective markers, tallies the VP a player controls, submits each side's per-objective claims, and blocks the round from advancing when both sides claim the same marker.

**Architecture:** The `vp` command changes from a scalar `points` to a `claims: number[]` array of objective indices. The server stores each side's claims (`game.recoveryClaims`), and once both sides submit it either resolves scoring + advances the round, or — when the claim sets overlap — records the disputed indices in `game.recoveryConflict` and blocks. The client gets a new `VpWizard` modal (styled like `AttackWizard`) and three recovery focus states (score / waiting / disputed).

**Tech Stack:** Node ESM shared game logic (`shared/game-state.js`, tested with `node --test`), React + TypeScript client (tested with Vitest + Testing Library).

**Reference spec:** `docs/superpowers/specs/2026-07-05-score-objectives-vp-wizard-design.md`

---

## File Structure

- **Modify** `shared/game-state.js` — swap `recoveryVp` for `recoveryClaims` + `recoveryConflict` at the four init/reset sites and in `runRecovery`; rewrite the `vp` command handler.
- **Modify** `shared/game-state.test.js` — migrate existing `points` assertions to `claims`; add conflict/resubmit/validation tests.
- **Modify** `client/src/state/types.ts` — replace `recoveryVp` field with `recoveryClaims` + `recoveryConflict`.
- **Modify** `client/src/lib/computeFocus.ts` — three recovery states (score / waiting / disputed).
- **Modify** `client/src/lib/computeFocus.test.ts` — cover the three recovery states.
- **Create** `client/src/components/wizards/VpWizard.tsx` — the scoring modal.
- **Create** `client/src/components/wizards/VpWizard.test.tsx` — render/tally/submit test.
- **Create** `client/src/styles/vp-wizard.css` — marker-list styling.
- **Modify** `client/src/main.tsx` — import `vp-wizard.css`.
- **Modify** `client/src/state/WizardContext.tsx` — add `openScore()` + render `VpWizard`.
- **Modify** `client/src/components/TurnBanner.tsx` — route the `score` CTA to `openScore()`.
- **Modify** `client/src/state/BattleActionsContext.tsx` — delete the obsolete `scoreVp`/`mySide`/`sessionRef`.

---

## Task 1: Backend — `vp` command accepts claims, resolves control, blocks on conflict

**Files:**
- Modify: `shared/game-state.js` (init `~209`, ensureGameShape `~271`, runRecovery `~639`, reset `~917`, `vp` handler `~1014`)
- Test: `shared/game-state.test.js` (existing recovery tests `~581`, `~595`, `~1136`, `~1388`; new tests after `~588`)

- [ ] **Step 1: Write the failing tests**

In `shared/game-state.test.js`, add these two tests immediately after the existing test that ends at line ~588 (`"both sides scoring VP advances to the next round's initiative"`):

```js
test("VP claims score per-objective and block on a both-claimed marker", () => {
  const r = startedRoom();
  runFullRound(r);
  assert.equal(r.game.phase, "recovery");
  // Objectives: index 0 = centre (2 VP), indices 1 & 2 = corners (1 VP each).
  // Both claim the centre — conflict, no advance, no VP awarded.
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [0] } });
  applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [0] } });
  assert.equal(r.game.phase, "recovery");
  assert.deepEqual(r.game.recoveryConflict, [0]);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 0);
  assert.equal(r.game.round, 1);
  // A backs off the centre and resubmits — conflict clears, round advances.
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [1] } });
  assert.equal(r.game.phase, "initiative");
  assert.equal(r.game.round, 2);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 1); // corner
  assert.equal(r.game.sides.find((s) => s.id === "b").vp, 2); // centre
  assert.equal(r.game.recoveryConflict, null);
});

test("VP claims ignore out-of-range and duplicate indices", () => {
  const r = startedRoom();
  runFullRound(r);
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [0, 0, 9, -1] } });
  applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [] } });
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2); // just the centre, once
  assert.equal(r.game.phase, "initiative");
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the current handler reads `a.points` (ignores `claims`), so side `a` scores 0 and `recoveryConflict` is `undefined`.

- [ ] **Step 3: Migrate the existing `points`-based assertions to `claims`**

In `shared/game-state.test.js`, replace the four existing usages:

At ~581–583 (inside `"both sides scoring VP advances…"`):

```js
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [0] } });
  assert.equal(r.game.phase, "recovery");         // still waiting on b
  applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [1] } });
```

(Centre index 0 = 2 VP for a; corner index 1 = 1 VP for b — the existing `assert`s of `a.vp === 2` and `b.vp === 1` still hold.)

At ~595–596 (inside `"after round 5 the higher VP wins"`):

```js
    applyCommand(r, { verb: "vp", attrs: { side: "a", claims: round === 1 ? [0, 1] : [] } });
    applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [] } });
```

(Round 1: centre + one corner = 3 VP for a; every other round both claim nothing. Final `a.vp === 3`, `b.vp === 0` → winner a, unchanged.)

At ~1136 (the helper that drains recovery in a loop):

```js
    if (r.game.phase === "recovery") applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [] } }), applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [] } });
```

At ~1388 (the reset test):

```js
    assert.deepEqual(r.game.recoveryClaims, {});
```

- [ ] **Step 4: Update the state init/reset sites**

In `shared/game-state.js`, replace line ~209 (`recoveryVp: {},`) inside the game object literal with:

```js
      recoveryClaims: {},
      recoveryConflict: null,
```

Replace line ~271 in `ensureGameShape` (`room.game.recoveryVp ||= {};`) with:

```js
  room.game.recoveryClaims ||= {};
  if (room.game.recoveryConflict === undefined) room.game.recoveryConflict = null;
```

Replace line ~639 in `runRecovery` (`room.game.recoveryVp = {};`) with:

```js
  room.game.recoveryClaims = {};
  room.game.recoveryConflict = null;
```

Replace line ~917 in the reset handler (`room.game.recoveryVp = {};`) with:

```js
    room.game.recoveryClaims = {};
    room.game.recoveryConflict = null;
```

- [ ] **Step 5: Rewrite the `vp` command handler**

In `shared/game-state.js`, replace the whole `vp` branch (lines ~1014–1024):

```js
  } else if (verb === "vp") {
    if (room.game.phase === "recovery") {
      const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
      if (sideId && !room.game.recoveryVp[sideId]) {
        const side = room.game.sides.find((s) => s.id === sideId);
        side.vp += Math.max(0, Math.floor(Number(a.points) || 0));
        room.game.recoveryVp[sideId] = true;
        if (room.game.sides.every((s) => room.game.recoveryVp[s.id])) advanceRound(room);
        changed = true;
      }
    }
  }
```

with:

```js
  } else if (verb === "vp") {
    if (room.game.phase === "recovery") {
      const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
      if (sideId) {
        const objs = room.game.objectives || [];
        // Sanitize the claimed marker indices: integers in range, de-duplicated.
        const claims = Array.isArray(a.claims)
          ? [...new Set(
              a.claims
                .map((i) => Math.floor(Number(i)))
                .filter((i) => Number.isInteger(i) && i >= 0 && i < objs.length),
            )]
          : [];
        // Overwrite so a side can resubmit to resolve a conflict.
        room.game.recoveryClaims[sideId] = claims;
        changed = true;
        // Resolve only once BOTH sides have submitted their claims.
        if (room.game.sides.every((s) => Array.isArray(room.game.recoveryClaims[s.id]))) {
          const [sa, sb] = room.game.sides;
          const ca = room.game.recoveryClaims[sa.id];
          const cb = room.game.recoveryClaims[sb.id];
          const conflict = ca.filter((i) => cb.includes(i));
          if (conflict.length) {
            // Both claimed the same marker — block and flag for re-check (§11).
            room.game.recoveryConflict = conflict;
          } else {
            room.game.recoveryConflict = null;
            for (const s of room.game.sides) {
              s.vp += room.game.recoveryClaims[s.id]
                .reduce((sum, i) => sum + (objs[i]?.vp || 0), 0);
            }
            advanceRound(room);
          }
        }
      }
    }
  }
```

- [ ] **Step 6: Run the full shared test suite to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS — new tests pass and all migrated tests still pass.

- [ ] **Step 7: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(vp): score objectives by per-marker claims, block on conflict"
```

---

## Task 2: Client types + recovery focus states

**Files:**
- Modify: `client/src/state/types.ts:98`
- Modify: `client/src/lib/computeFocus.ts:81-89`
- Test: `client/src/lib/computeFocus.test.ts`

- [ ] **Step 1: Write the failing tests**

In `client/src/lib/computeFocus.test.ts`, append:

```ts
test("recovery prompts scoring when I haven't submitted", () => {
  const g = base({ started: true, phase: "recovery", recoveryClaims: {} });
  const f = computeFocus(g, [], "a");
  expect(f?.tone).toBe("act");
  expect(f?.primary).toBe("Score your objectives");
  expect(f?.cta).toEqual({ label: "Score VP", kind: "score" });
});

test("recovery waits after I submit with no conflict", () => {
  const g = base({ started: true, phase: "recovery", recoveryClaims: { a: [0] } });
  const f = computeFocus(g, [], "a");
  expect(f?.tone).toBe("wait");
  expect(f?.primary).toMatch(/Waiting for opponent/);
});

test("recovery flags a disputed marker to both sides", () => {
  const g = base({
    started: true, phase: "recovery",
    recoveryClaims: { a: [0], b: [0] }, recoveryConflict: [0],
  });
  const f = computeFocus(g, [], "a");
  expect(f?.primary).toBe("Objectives disputed");
  expect(f?.cta).toEqual({ label: "Re-check", kind: "score" });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx vitest run src/lib/computeFocus.test.ts`
Expected: FAIL — `recoveryClaims`/`recoveryConflict` are not valid `GameState` fields yet (type error) and the "disputed" branch does not exist.

- [ ] **Step 3: Update the `GameState` type**

In `client/src/state/types.ts`, replace line 98 (`  recoveryVp?: Record<string, unknown>;`) with:

```ts
  recoveryClaims?: Record<string, number[]>;
  recoveryConflict?: number[] | null;
```

- [ ] **Step 4: Rewrite the recovery branch in `computeFocus`**

In `client/src/lib/computeFocus.ts`, replace the recovery block (lines 81–89):

```ts
  if (g.phase === "recovery") {
    return g.recoveryVp?.[mine]
      ? { tone: "wait", icon: "⏳", primary: "Waiting for opponent to score…" }
      : {
          tone: "act", icon: "⟡", primary: "Score your objectives",
          secondary: "Tally VP for this round.",
          cta: { label: "Score VP", kind: "score" },
        };
  }
```

with:

```ts
  if (g.phase === "recovery") {
    const conflict = g.recoveryConflict && g.recoveryConflict.length ? g.recoveryConflict : null;
    const submitted = Array.isArray(g.recoveryClaims?.[mine]);
    if (conflict) {
      return {
        tone: "act", icon: "⚠️", primary: "Objectives disputed",
        secondary: "You both claimed the same marker — re-check who holds it.",
        cta: { label: "Re-check", kind: "score" },
      };
    }
    if (submitted) {
      return { tone: "wait", icon: "⏳", primary: "Waiting for opponent to score…" };
    }
    return {
      tone: "act", icon: "⟡", primary: "Score your objectives",
      secondary: "Mark which markers you control.",
      cta: { label: "Score VP", kind: "score" },
    };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/lib/computeFocus.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/state/types.ts client/src/lib/computeFocus.ts client/src/lib/computeFocus.test.ts
git commit -m "feat(recovery): score/waiting/disputed focus states for VP scoring"
```

---

## Task 3: VpWizard component

**Files:**
- Create: `client/src/components/wizards/VpWizard.tsx`
- Create: `client/src/styles/vp-wizard.css`
- Modify: `client/src/main.tsx:7`
- Test: `client/src/components/wizards/VpWizard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/components/wizards/VpWizard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { VpWizard } from "./VpWizard";

const { sendCommand } = vi.hoisted(() => ({ sendCommand: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));
vi.mock("../../state/RoomStateContext", () => ({
  useRoomState: () => ({
    session: { room: "R", side: "a", name: "x" },
    game: {
      round: 2,
      objectives: [
        { x: 24, y: 16, vp: 2 },
        { x: 14, y: 9, vp: 1 },
        { x: 34, y: 23, vp: 1 },
      ],
      recoveryClaims: {},
      recoveryConflict: null,
    },
  }),
}));

beforeEach(() => sendCommand.mockClear());

test("offers all three markers and starts at 0 VP", () => {
  render(<VpWizard onClose={() => {}} />);
  expect(screen.getByText(/Centre/)).toBeInTheDocument();
  expect(screen.getAllByText(/Corner/)).toHaveLength(2);
  expect(screen.getByRole("button", { name: /Score 0 VP/ })).toBeInTheDocument();
});

test("tallies selected markers and submits their indices", async () => {
  const user = userEvent.setup();
  render(<VpWizard onClose={() => {}} />);
  await user.click(screen.getByText(/Centre/));
  const go = screen.getByRole("button", { name: /Score 2 VP/ });
  await user.click(go);
  expect(sendCommand).toHaveBeenCalledWith("vp", { side: "a", claims: [0] });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run src/components/wizards/VpWizard.test.tsx`
Expected: FAIL — `./VpWizard` does not exist.

- [ ] **Step 3: Create the component**

Create `client/src/components/wizards/VpWizard.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import type { Objective } from "../../state/types";

// Label a marker for the picker: the 2-VP centre, or a corner tagged with a
// compass hint (NW/NE/SW/SE) from its offset off the centre marker, so the two
// 1-VP corners are distinguishable and line up with the FieldMap.
function markerLabel(objectives: Objective[], i: number): { name: string; hint: string } {
  const o = objectives[i];
  const centre = objectives.find((x) => x.vp >= 2) ?? objectives[0];
  if (o === centre || o.vp >= 2) return { name: "Centre", hint: "" };
  const vert = o.y < centre.y ? "N" : "S";
  const horiz = o.x < centre.x ? "W" : "E";
  return { name: "Corner", hint: `${vert}${horiz}` };
}

export function VpWizard({ onClose }: { onClose: () => void }) {
  const { game, session } = useRoomState();
  const sendCommand = useCommands();
  const mySide = session?.side || "a";

  const objectives = game?.objectives ?? [];
  const conflict = new Set(game?.recoveryConflict ?? []);
  const round = game?.round ?? 1;

  // Prefill from any claim already submitted this Recovery (the re-check flow).
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(game?.recoveryClaims?.[mySide] ?? []),
  );

  const [show, setShow] = useState(false);
  const closing = useRef(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShow(false);
    setTimeout(onClose, 250);
  };

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const claims = [...selected].sort((x, y) => x - y);
  const total = claims.reduce((sum, i) => sum + (objectives[i]?.vp || 0), 0);

  const submit = () => {
    sendCommand("vp", { side: mySide, claims });
    close();
  };

  return (
    <div
      className={"aw-scrim" + (show ? " show" : "")}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="aw-card">
        <div className="aw-handle" />
        <div className="aw-title-row">
          <div className="aw-title">⟡ Score Objectives — Round {round}</div>
        </div>
        <p className="aw-field-desc">
          What points do you control? Tap each marker one of your Rigs holds
          (within 2", no enemy contesting).
        </p>

        <div className="vpw-list">
          {objectives.map((o, i) => {
            const { name, hint } = markerLabel(objectives, i);
            const sel = selected.has(i);
            const disputed = conflict.has(i);
            return (
              <button
                key={i}
                type="button"
                className={"vpw-opt" + (sel ? " sel" : "") + (disputed ? " disputed" : "")}
                onClick={() => toggle(i)}
              >
                <span className="vpw-vp">{o.vp}</span>
                <span className="vpw-name">{name}{hint ? ` · ${hint}` : ""}</span>
                <span className="vpw-state">{sel ? "You hold it" : "Not yours"}</span>
                {disputed ? (
                  <span className="vpw-warn">Both of you claimed this — one must change.</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="vpw-total">You'll score <b>{total}</b> VP</div>

        <button className="aw-go" onClick={submit}>Score {total} VP</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the stylesheet**

Create `client/src/styles/vp-wizard.css`:

```css
/* ---- Score-Objectives wizard: marker list inside the shared aw-* shell ---- */
.vpw-list { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 12px; }

.vpw-opt {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line, #3a3a3a);
  border-radius: 10px;
  background: var(--panel, #1c1c1c);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.vpw-opt.sel { border-color: var(--oil, #8ecae6); background: rgba(142, 202, 230, 0.12); }
.vpw-opt.disputed { border-color: var(--warn, #e0a458); background: rgba(224, 164, 88, 0.12); }

.vpw-vp {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 28px; height: 28px; padding: 0 6px;
  border-radius: 999px; font-weight: 700;
  background: var(--oil, #8ecae6); color: #08202b;
}
.vpw-name { font-weight: 600; }
.vpw-state { font-size: 0.8rem; opacity: 0.75; }
.vpw-warn { grid-column: 1 / -1; font-size: 0.8rem; color: var(--warn, #e0a458); }

.vpw-total { text-align: center; margin-bottom: 10px; opacity: 0.9; }
```

- [ ] **Step 5: Import the stylesheet**

In `client/src/main.tsx`, add after line 7 (`import "./styles/rig-wizard.css";`):

```ts
import "./styles/vp-wizard.css";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd client && npx vitest run src/components/wizards/VpWizard.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/wizards/VpWizard.tsx client/src/components/wizards/VpWizard.test.tsx client/src/styles/vp-wizard.css client/src/main.tsx
git commit -m "feat(vp): add Score Objectives wizard"
```

---

## Task 4: Wiring — open the wizard from the recovery CTA

**Files:**
- Modify: `client/src/state/WizardContext.tsx`
- Modify: `client/src/components/TurnBanner.tsx`
- Modify: `client/src/state/BattleActionsContext.tsx`

- [ ] **Step 1: Add `openScore` to `WizardContext`**

In `client/src/state/WizardContext.tsx`:

Add the import after line 4 (`import { AttackWizard, ... }`):

```tsx
import { VpWizard } from "../components/wizards/VpWizard";
```

Add to the `WizardApi` interface (after `openAttack`):

```tsx
  openScore: () => void;
```

Add to the `Open` union (after the `attack` variant):

```tsx
  | { kind: "score" }
```

Add the callback (after `openAttack`, before `close`):

```tsx
  const openScore = useCallback(() => setOpen({ kind: "score" }), []);
```

Add `openScore` to the provider value:

```tsx
    <Ctx.Provider value={{ openCommission, openAttack, openScore, close }}>
```

Add the portal render (after the `attack` render block, before the closing `</Ctx.Provider>`):

```tsx
      {open?.kind === "score" &&
        createPortal(<VpWizard onClose={close} />, document.body)}
```

- [ ] **Step 2: Route the `score` CTA to `openScore` in `TurnBanner`**

In `client/src/components/TurnBanner.tsx`:

Change line 16 to pull `openScore`:

```tsx
  const { openCommission, openScore } = useWizard();
```

Change line 17 to drop `scoreVp`:

```tsx
  const { rollInitiative, resolveBlast, endActivation } = useBattleActions();
```

Change the `score` case (line 72):

```tsx
      case "score": openScore(); break;
```

- [ ] **Step 3: Remove the obsolete `scoreVp` from `BattleActionsContext`**

In `client/src/state/BattleActionsContext.tsx`:

Delete the interface line 45 (`  scoreVp: () => void;`).

Change line 129 to stop destructuring `session`:

```tsx
  const { game } = useRoomState();
```

Delete the now-dead `sessionRef` and `mySide` (lines 131–137), i.e. remove:

```tsx
  // Keep game/session current inside stable callbacks without recreating them.
  const gameRef = useRef(game);
  const sessionRef = useRef(session);
  gameRef.current = game;
  sessionRef.current = session;

  const mySide = useCallback(() => sessionRef.current?.side || "a", []);
```

and replace it with (keeping `gameRef`, which is still used elsewhere):

```tsx
  // Keep game current inside stable callbacks without recreating them.
  const gameRef = useRef(game);
  gameRef.current = game;
```

Delete the `scoreVp` callback (lines ~261–265):

```tsx
  const scoreVp = useCallback(() => {
    const pts = window.prompt("Victory points scored this Recovery (centre 2, each corner 1):", "0");
    if (pts == null) return;
    sendCommand("vp", { side: mySide(), points: String(parseInt(pts, 10) || 0) });
  }, [sendCommand, mySide]);
```

Remove `scoreVp` from the provider value (line ~304):

```tsx
        openMove, openRepair, openPrepare, resolveBlast, endActivation, rollInitiative, resetBattle,
```

- [ ] **Step 4: Typecheck and run the full client suite**

Run: `cd client && npx tsc --noEmit && npx vitest run`
Expected: PASS — no type errors (no dangling `scoreVp`/`session`/`mySide`/`useCallback`-unused references), all tests green.

Note: if `useCallback` is now unused in `BattleActionsContext.tsx`, remove it from the React import at the top of the file to satisfy the linter.

- [ ] **Step 5: Commit**

```bash
git add client/src/state/WizardContext.tsx client/src/components/TurnBanner.tsx client/src/state/BattleActionsContext.tsx
git commit -m "feat(vp): open Score Objectives wizard from the recovery CTA"
```

---

## Task 5: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS — Vitest (client) and `node --test` (shared + server) both green.

- [ ] **Step 2: Manual smoke check (optional but recommended)**

Start the app (`npm run dev`), play/skip to a Recovery Phase, and confirm:
- the recovery CTA opens the wizard (not a browser prompt);
- toggling markers updates the "You'll score X VP" total;
- after one side submits, that side sees "Waiting for opponent to score…";
- both sides claiming the same marker shows "Objectives disputed" with a "Re-check" CTA on both sides, and the round only advances once the overlap is removed.

---

## Notes for the implementer

- **Objective indices are positional:** `computeObjectives` (in `shared/field.js`) always emits index 0 = centre (2 VP), indices 1 & 2 = the two empty-corner markers (1 VP each). The wizard and tests rely on this ordering.
- **Claims are overwritten, not merged:** re-submitting replaces a side's prior claim, which is how a disputed marker gets resolved without a separate "clear" command.
- **`changed = true` on every submit** bumps `room.version`, so the opponent's client re-renders into the waiting/disputed state even when no VP is awarded yet.
- **Breaking change:** the `vp` command no longer accepts a scalar `points`. The only caller was the deleted `scoreVp`; there is no back-compat path, which is fine pre-release.
```
