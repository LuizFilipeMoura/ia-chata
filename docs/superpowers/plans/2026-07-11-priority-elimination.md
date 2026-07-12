# Priority Elimination — Kill VP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score a flat +2 VP to the opposing side whenever any enemy Rig is destroyed, and surface VP live in the battle HUD with a kill toast.

**Architecture:** One backend hook (`onRigDamaged`, the existing one-shot destruction transition) awards VP to the non-owning side and enriches the destruction resolution with a machine-readable `vp` award + `victimName`. The client HUD (`BattleHud`) renders both sides' running VP and shows a transient kill toast when a fresh VP-bearing resolution arrives.

**Tech Stack:** Node/vanilla JS shared state (`shared/game-state.js`, `node:test`), React + TypeScript client (`vitest` + Testing Library).

---

## File Structure

- `shared/game-state.js` — add `KILL_VP` const; award VP + enrich the destruction resolution inside `onRigDamaged`.
- `shared/game-state.test.js` — backend scoring tests.
- `client/src/state/types.ts` — extend `Resolution` with `vp?` and `victimName?`.
- `client/src/v2/components/BattleHud.tsx` — live VP readout + kill toast.
- `client/src/v2/styles/battle.css` — VP readout + toast styles.
- `client/src/v2/components/BattleHud.test.tsx` — HUD VP + toast tests.

---

## Task 1: Backend — award kill VP + enrich the destruction resolution

**Files:**
- Modify: `shared/game-state.js` (add `KILL_VP` const near the other exported constants; edit `onRigDamaged` ~line 1263)
- Test: `shared/game-state.test.js`

The current `onRigDamaged` (for reference):

```js
function onRigDamaged(room, rig, opts) {
  if (rig.destroyed && !rig._blastRolled) {
    rig._blastRolled = true;
    const roll = rollD(12, opts?.dice?.destruction, opts?.random);
    const exploded = roll >= 4;
    pushResolution(room, {
      kind: "destruction", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name} destroyed — ${exploded ? 'munitions erupt (mark rigs within 4")' : "no secondary blast"}`,
      effects: [],
    });
    if (exploded) room.game.pendingBlast = { sourceId: rig.id, exploded: true };
  }
  // Engagement ...
```

The test harness (existing helpers in `game-state.test.js`): `startedRoom()` builds a room with rigs `a1`/`a2`/`a3` (owner `a`) and `b1`/`b2`/`b3` (owner `b`); `findRig(r, "b1")` fetches one; `__test.applyDamage(r, rig, loc, amount, opts)` deals component damage and drives the destruction path; `__test.setRigSp(rig, part, sp)` sets a part's SP and recomputes.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js`:

```js
test("destroying an enemy rig scores +2 VP for the opposing side", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");        // owned by "b"
  b1.hull.sp = 1;
  __test.applyDamage(r, b1, "hull", 5, { random: () => 0, dice: { destruction: 9 } });
  assert.equal(b1.destroyed, true);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2); // enemy scores
  assert.equal(r.game.sides.find((s) => s.id === "b").vp, 0); // owner does not
  const kill = r.game.resolutions.find((e) => e.kind === "destruction" && e.rigId === b1.id);
  assert.deepEqual(kill.vp, { side: "a", amount: 2 });
  assert.equal(kill.victimName, b1.name);
  assert.ok(kill.effects.some((e) => /Priority Elimination/.test(e)));
});

test("a rig lost to its own cause still scores for the other side (credit by ownership)", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");        // owned by "a"
  a1.hull.sp = 1;
  __test.applyDamage(r, a1, "hull", 5, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(a1.destroyed, true);
  assert.equal(r.game.sides.find((s) => s.id === "b").vp, 2); // opponent scores
});

test("kill VP is awarded once per rig, never twice", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.hull.sp = 1;
  __test.applyDamage(r, b1, "hull", 5, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2);
  __test.setRigSp(b1, "hull", 5);     // "revive" the hull; _blastRolled stays set
  assert.equal(b1.destroyed, false);
  __test.applyDamage(r, b1, "hull", 9, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(b1.destroyed, true);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2); // still 2, not 4
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --silent -- shared/game-state.test.js` (or `node --test shared/game-state.test.js`)
Expected: the three new tests FAIL — `vp` is 0 and `kill.vp` is `undefined`.

- [ ] **Step 3: Add the `KILL_VP` constant**

In `shared/game-state.js`, near the other top-level exported constants (e.g. beside `HEAT_CAPACITY`), add:

```js
// Priority Elimination (§11) — flat VP the opposing side scores for wrecking an
// enemy unit, once per unit. See docs/superpowers/specs/2026-07-11-priority-elimination-design.md.
export const KILL_VP = 2;
```

- [ ] **Step 4: Award VP + enrich the resolution in `onRigDamaged`**

Replace the body of the `if (rig.destroyed && !rig._blastRolled) { ... }` block with:

```js
    rig._blastRolled = true;
    const roll = rollD(12, opts?.dice?.destruction, opts?.random);
    const exploded = roll >= 4;
    // Priority Elimination — the side that does NOT own the wreck scores KILL_VP.
    // Guarded by _blastRolled above, so a revived-then-rekilled unit never re-awards.
    const scorer = room.game.sides.find((s) => s.id !== rig.owner);
    const effects = [];
    if (scorer) {
      scorer.vp = (scorer.vp || 0) + KILL_VP;
      effects.push(`+${KILL_VP} VP — Priority Elimination (${scorer.name})`);
    }
    pushResolution(room, {
      kind: "destruction", actor: rig.owner, rigId: rig.id,
      victimName: rig.name,
      vp: scorer ? { side: scorer.id, amount: KILL_VP } : undefined,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name} destroyed — ${exploded ? 'munitions erupt (mark rigs within 4")' : "no secondary blast"}`,
      effects,
    });
    if (exploded) room.game.pendingBlast = { sourceId: rig.id, exploded: true };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --silent -- shared/game-state.test.js`
Expected: the three new tests PASS, and the existing "destruction rolls a D12" / blast / objective-VP tests still PASS (the destruction resolution shape is a superset of before).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(vp): Priority Elimination — +2 VP to the opposing side on any kill"
```

---

## Task 2: Types — extend `Resolution`

**Files:**
- Modify: `client/src/state/types.ts:93-102`

- [ ] **Step 1: Add the optional fields**

In the `Resolution` interface, add two optional members:

```ts
export interface Resolution {
  id: number;
  kind?: string;
  rigId?: number;
  prep?: string;
  summary?: string;
  breakdown?: ResolutionBreakdown;
  effects?: string[];
  rolls?: Array<{ sides: number; value: number; label?: string; tone?: string }>;
  /** Priority Elimination award attached to a `destruction` entry. */
  vp?: { side: string; amount: number };
  /** Name of the wrecked unit, captured before it may be removed. */
  victimName?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix client run build` (or the project's `tsc`/typecheck script)
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/state/types.ts
git commit -m "types: Resolution carries a Priority Elimination vp award + victimName"
```

---

## Task 3: HUD — live VP readout

**Files:**
- Modify: `client/src/v2/components/BattleHud.tsx`
- Modify: `client/src/v2/styles/battle.css`
- Test: `client/src/v2/components/BattleHud.test.tsx`

`BattleHud` currently reads `const { rigs, game } = useRoomState();` and `const mySide = useMySide();`, and returns a `<div className="v2-bh">` with phase/turn/token rows.

- [ ] **Step 1: Write the failing test**

Add to `client/src/v2/components/BattleHud.test.tsx` (mirror the existing render setup in that file — it already seeds a started game with two sides):

```tsx
test("shows both sides' running VP, highlighting mine", () => {
  const state = {
    version: 1, ownerSide: "a", field: null, rigs: [],
    game: { round: 3, phase: "activation", started: true,
      turn: { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 3 },
      sides: [{ id: "a", name: "Kostov", vp: 4, ready: true }, { id: "b", name: "Rival", vp: 2, ready: true }] },
  } as unknown as ServerState;
  renderHud(state, "a"); // use the file's existing seed/render helper for BattleHud
  const mine = screen.getByText(/Kostov 4/);
  const foe = screen.getByText(/Rival 2/);
  expect(mine).toHaveClass("v2-bh-mine");
  expect(foe).toHaveClass("v2-bh-foe");
});
```

If the test file has no shared render helper, render `BattleHud` inside `AppProviders` with a `Seed`/dispatch harness exactly as the other tests in that file do, joined as side `a`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix client test -- BattleHud`
Expected: FAIL — no element with text `Kostov 4`.

- [ ] **Step 3: Render the VP row**

In `BattleHud.tsx`, after computing `mySide`, derive the two sides and add a VP row inside the `v2-bh` container (after the `v2-bh-turn` div):

```tsx
  const sides = game.sides || [];
  const mine = sides.find((s) => s.id === mySide);
  const foe = sides.find((s) => s.id !== mySide);
```

```tsx
      <div className="v2-bh-vp">
        {mine && <span className="v2-bh-mine">{mine.name} {mine.vp ?? 0}</span>}
        {mine && foe && <span className="v2-bh-vp-sep"> · </span>}
        {foe && <span className="v2-bh-foe">{foe.name} {foe.vp ?? 0}</span>}
      </div>
```

- [ ] **Step 4: Add styles**

In `client/src/v2/styles/battle.css`, near the other `.v2-bh-*` rules:

```css
.v2-root .v2-bh-vp {
  font-family: var(--v2-mono);
  font-size: var(--v2-text-base);
  letter-spacing: 0.03em;
}
.v2-root .v2-bh-vp-sep { color: var(--v2-txt-dim); }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix client test -- BattleHud`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/components/BattleHud.tsx client/src/v2/styles/battle.css client/src/v2/components/BattleHud.test.tsx
git commit -m "feat(vp): live VP readout in the battle HUD"
```

---

## Task 4: HUD — kill toast

**Files:**
- Modify: `client/src/v2/components/BattleHud.tsx`
- Modify: `client/src/v2/styles/battle.css`
- Test: `client/src/v2/components/BattleHud.test.tsx`

The toast lives in `BattleHud` (co-located with the VP readout): it watches `game.resolutions` for the newest entry carrying `vp`, and shows a transient banner naming the scorer, victim, and amount. A `useRef` high-water mark ensures each kill toasts once; a timer auto-dismisses.

- [ ] **Step 1: Write the failing test**

Add to `BattleHud.test.tsx`:

```tsx
test("pops a kill toast when a fresh destruction resolution carries a vp award", async () => {
  const base = {
    version: 1, ownerSide: "a", field: null, rigs: [],
    game: { round: 3, phase: "activation", started: true,
      turn: { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 3 },
      sides: [{ id: "a", name: "Kostov", vp: 0, ready: true }, { id: "b", name: "Rival", vp: 0, ready: true }],
      resolutions: [] },
  } as unknown as ServerState;
  const killed = {
    ...base, version: 2,
    game: { ...base.game,
      sides: [{ id: "a", name: "Kostov", vp: 2, ready: true }, { id: "b", name: "Rival", vp: 0, ready: true }],
      resolutions: [{ id: 5, kind: "destruction", rigId: 9, victimName: "Ravager", vp: { side: "a", amount: 2 }, effects: [] }] },
  } as unknown as ServerState;
  const { rerender } = renderHud(base, "a");        // file's render helper, returns rerender
  expect(screen.queryByText(/Ravager/)).toBeNull();
  rerender(killed);                                  // apply the state carrying the kill
  expect(await screen.findByText(/Ravager wrecked · \+2 VP/)).toBeInTheDocument();
});
```

Adapt `renderHud`/`rerender` to however the file dispatches successive `applyServerState` updates (the existing tests already re-render with new state — reuse that mechanism).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix client test -- BattleHud`
Expected: FAIL — no `Ravager wrecked · +2 VP` text.

- [ ] **Step 3: Implement the toast**

In `BattleHud.tsx`, add imports `useEffect, useRef, useState` from React. Inside the component:

```tsx
  const [toast, setToast] = useState<string | null>(null);
  const lastKillId = useRef(0);
  const toastTimer = useRef<number | null>(null);
  useEffect(() => {
    const log = game?.resolutions || [];
    const fresh = log.filter((e) => e.id > lastKillId.current && e.vp);
    if (!fresh.length) return;
    const latest = fresh[fresh.length - 1];
    lastKillId.current = log[log.length - 1].id;
    const scorer = (game?.sides || []).find((s) => s.id === latest.vp!.side);
    setToast(`${scorer?.name ?? "?"} — ${latest.victimName ?? "a unit"} wrecked · +${latest.vp!.amount} VP`);
    if (toastTimer.current != null) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, [game?.resolutions]);
  useEffect(() => () => { if (toastTimer.current != null) clearTimeout(toastTimer.current); }, []);
```

Guard the high-water mark on first mount so a hydrated backlog doesn't toast: seed `lastKillId` to the newest id on the first run. Replace the effect's opening with:

```tsx
  const killSeeded = useRef(false);
  useEffect(() => {
    const log = game?.resolutions || [];
    if (!killSeeded.current) {
      killSeeded.current = true;
      lastKillId.current = log.length ? log[log.length - 1].id : 0;
      return;
    }
    const fresh = log.filter((e) => e.id > lastKillId.current && e.vp);
    if (!fresh.length) return;
    const latest = fresh[fresh.length - 1];
    lastKillId.current = log[log.length - 1].id;
    const scorer = (game?.sides || []).find((s) => s.id === latest.vp!.side);
    setToast(`${scorer?.name ?? "?"} — ${latest.victimName ?? "a unit"} wrecked · +${latest.vp!.amount} VP`);
    if (toastTimer.current != null) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, [game?.resolutions]);
```

Render the toast inside the `v2-bh` container:

```tsx
      {toast && <div className="v2-bh-killtoast" role="status">☠️ {toast}</div>}
```

- [ ] **Step 4: Add the toast style**

In `battle.css`:

```css
.v2-root .v2-bh-killtoast {
  margin-top: 4px;
  font-family: var(--v2-mono);
  font-size: var(--v2-text-base);
  color: var(--v2-ember-hi);
  animation: v2-bh-killtoast-in 160ms ease-out;
}
@keyframes v2-bh-killtoast-in { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix client test -- BattleHud`
Expected: PASS.

- [ ] **Step 6: Full client + shared suite**

Run: `npm --prefix client test -- --run` and `npm test --silent`
Expected: all green (no regressions).

- [ ] **Step 7: Commit**

```bash
git add client/src/v2/components/BattleHud.tsx client/src/v2/styles/battle.css client/src/v2/components/BattleHud.test.tsx
git commit -m "feat(vp): kill toast in the battle HUD on Priority Elimination"
```

---

## Self-Review Notes

- **Spec coverage:** scoring model → Task 1; `side.vp` credit-by-ownership → Task 1 tests; once-per-unit guard → Task 1 test 3; live HUD → Task 3; kill toast → Task 4; types → Task 2. Rules-text update is a documented non-blocking follow-up (not a task).
- **Deviation from spec:** the toast lives in `BattleHud` (co-located with the VP readout) rather than `useV2BattleWatchers`, because it is a rendered concern and `BattleHud` already re-renders on state. Behavior is identical.
- **Naming consistency:** `KILL_VP`, `vp: { side, amount }`, `victimName` used identically across backend, types, and client.
```
