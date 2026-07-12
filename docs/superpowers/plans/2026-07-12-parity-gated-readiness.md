# Parity-Gated Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 3-unit roster requirement with a composition-parity gate — neither side can ready until both field the same number of Rigs per weight class, the same number of Tanks, and the same number of Walkers (floor of 1 unit each).

**Architecture:** A pure `sidesAtParity(room)` predicate (built on a `compositionOf` signature helper) replaces the three `sideRigCount >= 3` gates in `shared/game-state.js`. The `MAX_RIGS_PER_SIDE` / `MAX_RIGS_TOTAL` caps are removed so rosters can grow freely. A mirror `composition.ts` helper on the client feeds a parity-diff hint in `computeFocus.ts` and a parity indicator in the Yard screen. Rules doc updated to the mandatory mirror rule.

**Tech Stack:** ES modules (shared/server), Node built-in test runner (`node --test`), React + TypeScript client, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-07-12-parity-gated-readiness-design.md`

**Test commands:**
- Shared/server (one file): `node --test shared/game-state.test.js`
- Client (one file): `npx vitest run client/src/lib/composition.test.ts`
- Full suite: `npm test`

**Shared test note:** existing shared tests define `const W = { longRange: "Mini Gun", melee: "Sword" }` (or `lr`/`melee`) as valid weapon attrs for `add`. Reuse the file's existing `W` spread — do not redefine it.

---

## Task 1: Server parity helpers + readiness/start gates

**Files:**
- Modify: `shared/game-state.js` (add helpers near `sideRigCount` ~:1104; swap gates at ~:1259, ~:2539, ~:2653)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write failing tests for the parity gate**

Add these tests to `shared/game-state.test.js` (place them just after the existing `test("both ready starts game ...")` block ~:480). They reuse the file's existing `W` weapon-attrs constant.

```js
test("ready is blocked until both sides mirror composition", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  // a: 2 light. b: 1 light. Not mirrored.
  applyCommand(r, { verb: "add", attrs: { name: "A1", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "add", attrs: { name: "A2", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "light", owner: "b", ...W } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, false);

  // Add the matching 2nd light to b -> now mirrored, ready sticks.
  applyCommand(r, { verb: "add", attrs: { name: "B2", class: "light", owner: "b", ...W } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);
});

test("parity checks weight class, not just rig count", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  // Same count (1 each) but different weight class.
  applyCommand(r, { verb: "add", attrs: { name: "A1", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "medium", owner: "b", ...W } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, false);
});

test("parity counts tanks and walkers by kind", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  // a: 1 tank. b: 1 walker. Same total, different kind -> not mirrored.
  applyCommand(r, { verb: "add", attrs: { name: "AT", kind: "tank", owner: "a", unit: "Tank Cannon" } });
  applyCommand(r, { verb: "add", attrs: { name: "BW", kind: "walker", owner: "b", unit: "Rocket Pod" } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, false);

  // Give each side one of each kind -> mirrored.
  applyCommand(r, { verb: "add", attrs: { name: "AW", kind: "walker", owner: "a", unit: "Rocket Pod" } });
  applyCommand(r, { verb: "add", attrs: { name: "BT", kind: "tank", owner: "b", unit: "Tank Cannon" } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);
});

test("a single unit per side is enough when mirrored (no fixed floor of three)", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "add", attrs: { name: "A1", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "light", owner: "b", ...W } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  assert.equal(r.game.started, true);
});

test("an empty side never reaches parity", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  // Both empty: 0 vs 0 is NOT parity.
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, false);
});
```

Note: the `add` verb must accept `kind`/`unit` attrs for tanks/walkers. If it does not (verify by reading the `add` handler), replace the tank/walker test with an equivalent using `makeUnit` + `room.rigs.push` directly, mirroring how other tests seed cold kinds. Check first before assuming.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: the five new tests FAIL (parity not yet enforced — `ready` still succeeds on `>= 3` or fails for the wrong reason). Existing `ready requires at least three rigs` and `adding or removing rigs before start resets ready flags` tests will ALSO now be logically stale — they are rewritten in Step 5.

- [ ] **Step 3: Add the parity helpers**

In `shared/game-state.js`, immediately after `sideRigCount` (~:1106), add:

```js
// Composition signature for one side: Rigs bucketed by weight class, cold kinds
// (tank/walker) bucketed by kind. e.g. { "rig:light": 2, "rig:heavy": 1, tank: 1 }
function compositionOf(room, sideId) {
  const sig = {};
  for (const u of room.rigs) {
    if ((u.owner || "a") !== sideId) continue;
    const kind = kindOf(u);
    const key = kind === "rig" ? `rig:${u.weightClass}` : kind;
    sig[key] = (sig[key] || 0) + 1;
  }
  return sig;
}

// True when both sides are non-empty AND have identical composition signatures.
// This is the shared precondition for readiness and game start (spec: parity).
function sidesAtParity(room) {
  const sides = room.game.sides;
  if (!Array.isArray(sides) || sides.length < 2) return false;
  const a = compositionOf(room, sides[0].id);
  const b = compositionOf(room, sides[1].id);
  const aCount = Object.values(a).reduce((n, v) => n + v, 0);
  const bCount = Object.values(b).reduce((n, v) => n + v, 0);
  if (aCount < 1 || bCount < 1) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return false;
  return true;
}
```

`kindOf` is already imported at the top of the file from `./unit-kinds.js`.

- [ ] **Step 4: Swap the three gates**

In `maybeStartGame` (~:1259), replace:

```js
  const canStart = room.game.sides.every((side) => side.ready && sideRigCount(room, side.id) >= 3);
```
with:
```js
  const canStart = room.game.sides.every((side) => side.ready) && sidesAtParity(room);
```

In the `ready` verb handler (~:2539), replace:

```js
    if (side && !room.game.started && room.field.locked &&
        sideRigCount(room, side.id) >= 3 && !side.ready) {
```
with:
```js
    if (side && !room.game.started && room.field.locked &&
        sidesAtParity(room) && !side.ready) {
```

In the seed verb's `canStart` (~:2653), replace:

```js
    const canStart = sideRigCount(room, "a") >= 3 && sideRigCount(room, "b") >= 3;
```
with:
```js
    const canStart = sidesAtParity(room);
```

- [ ] **Step 5: Rewrite the two now-stale existing tests**

Replace the existing `test("ready requires at least three rigs for that side", ...)` (~:448) entirely — its premise (3 rigs, empty opponent) is no longer valid. Delete it; its coverage is superseded by the Step 1 tests.

Rewrite `test("adding or removing rigs before start resets ready flags", ...)` (~:462) so parity holds before readying:

```js
test("adding or removing rigs before start resets ready flags", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  // Mirror both sides at 2 light so parity holds.
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 2; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);

  // Any roster change clears all ready flags.
  applyCommand(r, { verb: "add", attrs: { name: "B3", class: "light", owner: "b", ...W } });
  assert.equal(r.game.sides.every((s) => s.ready === false), true);

  applyCommand(r, { verb: "remove", attrs: { name: "B3" } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);
  applyCommand(r, { verb: "remove", attrs: { name: "B2" } });
  assert.equal(r.game.sides.every((s) => s.ready === false), true);
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: all tests PASS, including the `both ready starts game` test (3-light vs 3-light is still valid parity).

- [ ] **Step 7: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(game): gate readiness on composition parity, not a fixed rig count"
```

---

## Task 2: Remove roster caps

**Files:**
- Modify: `shared/game-state.js` (constants ~:24-25; `canAddRigForSide` ~:1108)
- Modify: `client/shared.d.ts` (~:4-5)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Rewrite the cap tests to assert unbounded adds**

Replace `test("add blocks a fourth rig for the same side without version bump or id burn", ...)` (~:415) with:

```js
test("add allows a fourth rig for the same side (no per-side cap)", () => {
  const r = createRoom("X");
  for (let i = 1; i <= 4; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `A${i}`, class: "light", owner: "a", ...W } });
  }
  assert.equal(r.rigs.length, 4);
  assert.equal(findRig(r, "A4").id, 4);
});
```

Replace `test("add blocks all new rigs once six rigs are in place", ...)` (~:432) with:

```js
test("add allows more than six rigs total (no roster cap)", () => {
  const r = createRoom("X");
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 4; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  assert.equal(r.rigs.length, 8);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: the two rewritten tests FAIL (adds are still capped at 3/6).

- [ ] **Step 3: Remove the caps**

In `shared/game-state.js`, delete the two constant lines (~:24-25):

```js
export const MAX_RIGS_PER_SIDE = 3;
export const MAX_RIGS_TOTAL = 6;
```

Replace `canAddRigForSide` (~:1108) with:

```js
// Adding is always allowed — parity (sidesAtParity), not a cap, governs when the
// game can start. Kept as a stable predicate for call sites that still ask.
export function canAddRigForSide(room, sideId) {
  return true;
}
```

- [ ] **Step 4: Drop the client type declarations**

In `client/shared.d.ts`, delete these two lines (~:4-5):

```ts
  export const MAX_RIGS_PER_SIDE: number;
  export const MAX_RIGS_TOTAL: number;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js client/shared.d.ts
git commit -m "feat(game): remove per-side and total roster caps"
```

---

## Task 3: Update the server prompt text

**Files:**
- Modify: `server/prompt.js` (import ~:4; line ~:46)
- Test: `server/prompt.test.js` (~:4, ~:25-26)

- [ ] **Step 1: Update the prompt-text test**

In `server/prompt.test.js`, remove the `MAX_RIGS_PER_SIDE, MAX_RIGS_TOTAL` from the import (~:4), leaving `CHASSIS`:

```js
import { CHASSIS } from "../shared/game-state.js";
```

Replace the two assertions (~:25-26) with one asserting the parity wording:

```js
  assert.match(TRACKER_PROTOCOL, /same number of Rigs in each weight class/i);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/prompt.test.js`
Expected: FAIL — the parity phrase is not yet in the prompt (and the old import may now be unused).

- [ ] **Step 3: Update the prompt text**

In `server/prompt.js`, remove `MAX_RIGS_PER_SIDE, MAX_RIGS_TOTAL` from the import (~:4) so it reads:

```js
import { CHASSIS, UNIT_WEAPONS } from "../shared/game-state.js";
```

Replace line ~:46-47:

```js
  `- The tracker allows at most ${MAX_RIGS_PER_SIDE} Rigs per side and ${MAX_RIGS_TOTAL} Rigs total.`,
  "  If that limit is already reached, explain that the roster is full and emit no `[[RIG add]]` tag.",
```
with:
```js
  "- Both sides must field the same number of Rigs in each weight class, the same",
  "  number of Tanks, and the same number of Walkers before either can ready. There",
  "  is no fixed roster size and no cap — rosters just have to mirror each other.",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/prompt.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/prompt.js server/prompt.test.js
git commit -m "feat(prompt): describe parity rule instead of roster caps"
```

---

## Task 4: Client composition helper library

**Files:**
- Create: `client/src/lib/composition.ts`
- Test: `client/src/lib/composition.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/composition.test.ts`:

```ts
import { expect, test } from "vitest";
import { compositionOf, parityStatus } from "./composition";
import type { Rig } from "../state/types";

const rig = (owner: "a" | "b", weightClass: string, kind?: "rig" | "tank" | "walker"): Rig => ({
  id: Math.floor(Math.random() * 1e6), name: "X", owner,
  weightClass: weightClass as Rig["weightClass"], kind,
  hull: { sp: 6, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false,
});

test("compositionOf buckets rigs by weight class and cold kinds by kind", () => {
  const rigs = [rig("a", "light"), rig("a", "light"), rig("a", "heavy"), rig("a", "-", "tank")];
  expect(compositionOf(rigs, "a")).toEqual({ "rig:light": 2, "rig:heavy": 1, tank: 1 });
});

test("parityStatus reports atParity when both sides mirror", () => {
  const rigs = [rig("a", "light"), rig("b", "light")];
  expect(parityStatus(rigs, "a").atParity).toBe(true);
  expect(parityStatus(rigs, "a").diffLabel).toBeNull();
});

test("parityStatus reports a shortfall from my point of view", () => {
  // a: 1 light. b: 1 light + 1 heavy. I am short 1 heavy.
  const rigs = [rig("a", "light"), rig("b", "light"), rig("b", "heavy")];
  const s = parityStatus(rigs, "a");
  expect(s.atParity).toBe(false);
  expect(s.diffLabel).toBe("Short 1 Heavy Rig");
});

test("parityStatus reports an excess from my point of view", () => {
  // a: 1 light + 1 tank. b: 1 light. I have 1 extra tank.
  const rigs = [rig("a", "light"), rig("a", "-", "tank"), rig("b", "light")];
  const s = parityStatus(rigs, "a");
  expect(s.atParity).toBe(false);
  expect(s.diffLabel).toBe("1 extra Tank");
});

test("parityStatus prompts when the opponent has no units", () => {
  const rigs = [rig("a", "light")];
  const s = parityStatus(rigs, "a");
  expect(s.atParity).toBe(false);
  expect(s.diffLabel).toBe("Waiting for opponent to commission units.");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/composition.test.ts`
Expected: FAIL — module `./composition` does not exist.

- [ ] **Step 3: Write the implementation**

Create `client/src/lib/composition.ts`:

```ts
import type { Rig } from "../state/types";

export type Composition = Record<string, number>;

// Bucket: rigs by weight class ("rig:light"), cold kinds by kind ("tank"/"walker").
// Mirrors the server's compositionOf in shared/game-state.js.
export function compositionOf(rigs: Rig[], side: string): Composition {
  const sig: Composition = {};
  for (const u of rigs) {
    if ((u.owner || "a") !== side) continue;
    const kind = u.kind || "rig";
    const key = kind === "rig" ? `rig:${u.weightClass}` : kind;
    sig[key] = (sig[key] || 0) + 1;
  }
  return sig;
}

function sideCount(rigs: Rig[], side: string): number {
  return rigs.filter((r) => (r.owner || "a") === side).length;
}

const BUCKET_LABEL: Record<string, string> = {
  "rig:light": "Light Rig",
  "rig:medium": "Medium Rig",
  "rig:heavy": "Heavy Rig",
  "rig:colossal": "Colossal Rig",
  tank: "Tank",
  walker: "Walker",
};

function bucketLabel(key: string, n: number): string {
  const base = BUCKET_LABEL[key] || key;
  return n === 1 ? base : `${base}s`;
}

export interface ParityStatus {
  atParity: boolean;
  // Most salient mismatch phrased from `mySide`'s POV, or null when at parity.
  diffLabel: string | null;
}

// Compare my composition against the opponent's. Surfaces the single largest
// mismatch: a shortfall ("Short 1 Heavy Rig") is prioritised over an excess
// ("1 extra Tank") since adding is the usual fix.
export function parityStatus(rigs: Rig[], mySide: string): ParityStatus {
  const enemy = mySide === "a" ? "b" : "a";
  const mine = compositionOf(rigs, mySide);
  const theirs = compositionOf(rigs, enemy);
  const myCount = sideCount(rigs, mySide);
  const enemyCount = sideCount(rigs, enemy);

  if (enemyCount === 0) {
    return { atParity: false, diffLabel: "Waiting for opponent to commission units." };
  }

  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  let mismatched = false;
  let short: { key: string; n: number } | null = null;
  let extra: { key: string; n: number } | null = null;
  for (const k of keys) {
    const d = (mine[k] || 0) - (theirs[k] || 0);
    if (d !== 0) mismatched = true;
    if (d < 0 && (!short || -d > short.n)) short = { key: k, n: -d };
    if (d > 0 && (!extra || d > extra.n)) extra = { key: k, n: d };
  }

  if (!mismatched && myCount >= 1) return { atParity: true, diffLabel: null };

  if (short) return { atParity: false, diffLabel: `Short ${short.n} ${bucketLabel(short.key, short.n)}` };
  if (extra) return { atParity: false, diffLabel: `${extra.n} extra ${bucketLabel(extra.key, extra.n)}` };
  return { atParity: false, diffLabel: "Match your opponent's composition." };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/lib/composition.test.ts`
Expected: PASS (all five tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/composition.ts client/src/lib/composition.test.ts
git commit -m "feat(client): composition + parity-diff helper mirroring the server"
```

---

## Task 5: Parity-diff hint in computeFocus

**Files:**
- Modify: `client/src/lib/computeFocus.ts` (drop `MIN_RIGS_TO_READY` ~:14; rewrite pre-battle branch ~:35-60)
- Test: `client/src/lib/computeFocus.test.ts` (~:20-24)

- [ ] **Step 1: Update / add the hint tests**

In `client/src/lib/computeFocus.test.ts`, replace the existing `test("pre-battle with no rigs prompts commissioning", ...)` (~:20) with:

```ts
test("pre-battle with no rigs prompts commissioning", () => {
  const f = computeFocus(base({ started: false }), [], "a");
  expect(f?.primary).toMatch(/Commission your first unit/);
  expect(f?.cta?.kind).toBe("commission");
});

test("pre-battle off parity shows the composition diff", () => {
  const g = base({
    started: false,
    sides: [
      { id: "a", name: "Codex", vp: 0, ready: false },
      { id: "b", name: "Rival", vp: 0, ready: false },
    ],
  });
  // a: 1 light. b: 1 light + 1 heavy. a is short 1 heavy.
  const rigs = [
    rig({ id: 1, owner: "a", weightClass: "light" }),
    rig({ id: 2, owner: "b", weightClass: "light" }),
    rig({ id: 3, owner: "b", weightClass: "heavy" as Rig["weightClass"] }),
  ];
  const f = computeFocus(g, rigs, "a");
  expect(f?.primary).toBe("Match your opponent's composition");
  expect(f?.secondary).toBe("Short 1 Heavy Rig");
});

test("pre-battle at parity prompts Ready", () => {
  const g = base({
    started: false,
    sides: [
      { id: "a", name: "Codex", vp: 0, ready: false },
      { id: "b", name: "Rival", vp: 0, ready: false },
    ],
  });
  const rigs = [
    rig({ id: 1, owner: "a", weightClass: "light" }),
    rig({ id: 2, owner: "b", weightClass: "light" }),
  ];
  const f = computeFocus(g, rigs, "a");
  expect(f?.cta?.kind).toBe("ready");
  expect(f?.primary).toMatch(/Mark ready/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/computeFocus.test.ts`
Expected: FAIL — copy still says "Commission your first Rig" and there is no parity-diff branch.

- [ ] **Step 3: Rewrite the pre-battle branch**

In `client/src/lib/computeFocus.ts`, add the import at the top:

```ts
import { parityStatus } from "./composition";
```

Delete the line `const MIN_RIGS_TO_READY = 3;` (~:14).

Replace the entire `if (!g.started) { ... }` block (~:35-60) with:

```ts
  // ---- Pre-battle setup ----
  if (!g.started) {
    const myCount = rigCountOf(mine);
    if (myCount === 0) {
      return {
        tone: "guide", icon: "◈", primary: "Commission your first unit",
        secondary: "Every squadron needs at least one.",
        cta: { label: "Commission", kind: "commission" },
      };
    }
    const parity = parityStatus(rigs, mine);
    if (!parity.atParity) {
      return {
        tone: "guide", icon: "◈", primary: "Match your opponent's composition",
        secondary: parity.diffLabel ?? "Both sides must field the same units.",
        cta: { label: "Commission", kind: "commission" },
      };
    }
    if (!sideReadyOf(mine)) {
      return {
        tone: "guide", icon: "✔", primary: "Mark ready when set",
        secondary: "Rosters match — tap Ready to deploy.",
        cta: { label: "Ready", kind: "ready" },
      };
    }
    return { tone: "wait", icon: "⏳", primary: `Waiting for ${sideNameOf(enemy)} to ready…` };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/lib/computeFocus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/computeFocus.ts client/src/lib/computeFocus.test.ts
git commit -m "feat(client): parity-diff readiness hint replaces the fixed-count hint"
```

---

## Task 6: Yard parity indicator (viewModels + Squadron)

**Files:**
- Modify: `client/src/v2/lib/viewModels.ts` (import ~:1; `commissioned` ~:22-25)
- Modify: `client/src/v2/lib/viewModels.test.ts` (~:2, ~:26-29)
- Modify: `client/src/v2/screens/Squadron.tsx` (~:2, ~:21, ~:30, ~:41)

- [ ] **Step 1: Update the viewModels test**

In `client/src/v2/lib/viewModels.test.ts`, replace the `commissioned` test (~:26-29) with a `squadronStatus` test, and update the import (~:2):

```ts
import { spColor, tonnage, squadronStatus } from "./viewModels";
```

```ts
test("squadronStatus reports count and parity against the opponent", () => {
  // a: 1 light + 1 medium. b: 1 light. a is off parity.
  const rigs = [rig("a", "light"), rig("a", "medium"), rig("b", "light")];
  const s = squadronStatus(rigs, "a");
  expect(s.count).toBe(2);
  expect(s.atParity).toBe(false);

  const mirrored = [rig("a", "light"), rig("b", "light")];
  expect(squadronStatus(mirrored, "a")).toEqual({ count: 1, atParity: true, diffLabel: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/lib/viewModels.test.ts`
Expected: FAIL — `squadronStatus` is not exported.

- [ ] **Step 3: Replace `commissioned` with `squadronStatus`**

In `client/src/v2/lib/viewModels.ts`, replace the import (~:1):

```ts
import { parityStatus } from "../../lib/composition";
```

Replace the `commissioned` function (~:22-25) with:

```ts
export function squadronStatus(
  rigs: Rig[],
  side: string,
): { count: number; atParity: boolean; diffLabel: string | null } {
  const count = rigs.filter((r) => (r.owner || "a") === side).length;
  const { atParity, diffLabel } = parityStatus(rigs, side);
  return { count, atParity, diffLabel };
}
```

- [ ] **Step 4: Update the Squadron screen**

In `client/src/v2/screens/Squadron.tsx`:

Replace the import (~:7):

```tsx
import { squadronStatus, tonnage } from "../lib/viewModels";
```

Replace the destructure (~:21):

```tsx
  const { count, atParity, diffLabel } = squadronStatus(rigs, mySide);
```

Replace the `readyDisabled` line (~:30) — parity replaces `count < max`:

```tsx
  const readyDisabled = started || myReady || !atParity || !field?.locked;
```

Replace the stats count display (~:41) — no fixed max any more; show count plus parity state:

```tsx
          <div className="v2-yard-count">{count} COMMISSIONED{!started && !atParity && diffLabel ? ` · ${diffLabel}` : ""}</div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run client/src/v2/lib/viewModels.test.ts`
Expected: PASS.
Then typecheck the screen by running the client test suite touching it: `npx vitest run client/src/v2` (should pass with no type errors referencing `max`/`commissioned`).

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/lib/viewModels.ts client/src/v2/lib/viewModels.test.ts client/src/v2/screens/Squadron.tsx
git commit -m "feat(v2): Yard shows parity status instead of an N/max meter"
```

---

## Task 7: RigAddScreen (V1) cap messaging

**Files:**
- Modify: `client/src/components/RigAddScreen.tsx`

Note: this is the V1 component, still mounted by `client/src/components/RigDeck.tsx`. `canAddRigForSide` now always returns `true`, so the locked-card branch is dead; simplify to the always-addable path.

- [ ] **Step 1: Simplify RigAddScreen**

Replace the whole file `client/src/components/RigAddScreen.tsx` with:

```tsx
import { useRoomState } from "../state/RoomStateContext";
import { useWizard } from "../state/WizardContext";
import { useMySide } from "../hooks/useMySide";

interface Props {
  onCommission?: () => void;
}

export function RigAddScreen({ onCommission }: Props) {
  const { rigs, game } = useRoomState();
  const { openCommission } = useWizard();
  const owner = useMySide();

  const sideRigCount = rigs.filter((rig) => (rig.owner || "a") === owner).length;

  // First-run empty state: when this side has no Rigs yet, the commission card
  // grows into a centered "start here" call rather than a quiet footer button.
  const isEmpty = sideRigCount === 0 && !Boolean(game?.started);

  const cardCls = "rig-add-card" + (isEmpty ? " is-empty" : "");

  const hint = isEmpty
    ? "Commission your first Rig to begin — name it, pick a chassis and its weapon upgrades."
    : "Name it, pick a chassis and weapon upgrades, then choose its equipment.";

  return (
    <div id="rigAddScreen" className={cardCls}>
      <div className="rig-add">
        <div className="rig-add-title">{isEmpty ? "◈ Your squadron is empty" : "◈ Commission a Rig"}</div>
        <div className="rig-add-hint">{hint}</div>
        <div className="rig-add-row">
          <button
            id="rigAddBtn"
            className="rig-add-btn btn btn--primary"
            type="button"
            onClick={() => (onCommission ?? openCommission)()}
          >
            + Commission
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles / tests pass**

Run: `npx vitest run client/src/components`
Expected: PASS — no references to the removed `MAX_RIGS_*` imports or `canAddRigForSide`. If a test asserts the old "Roster full" / "Ready up ↑" copy, update it to the always-addable copy.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/RigAddScreen.tsx
git commit -m "feat(client): drop V1 roster-full messaging (caps removed)"
```

---

## Task 8: Rules doc

**Files:**
- Modify: `rules.md` (~:40, ~:114-115, ~:123, ~:639)

- [ ] **Step 1: Update the intro "You need" line (~:40)**

Replace:

```
**You need:** 3–5 Rig models per side, D6 and D12 dice, a tape measure (inches), terrain, 3 objective markers, and tokens for preparations and catastrophic damage.
```
with:
```
**You need:** a matched force per side (see §3 — both sides field the same composition), D6 and D12 dice, a tape measure (inches), terrain, 3 objective markers, and tokens for preparations and catastrophic damage.
```

- [ ] **Step 2: Rewrite the §3 squadron-size list (~:114-115)**

Replace:

```
1. **Squadron size** — agree on **3–5 Rigs** per side. Max **1 Colossal** per Squadron.
2. **Choose each Rig's weight class** (§2).
```
with:
```
1. **Squadron size** — both sides field the **same composition**: the same number of Rigs in each weight class, the same number of Tanks, and the same number of Walkers. Any size (at least one unit per side); the two forces must mirror each other.
2. **Choose each Rig's weight class** (§2).
```

- [ ] **Step 3: Replace the "Balanced game (recommended)" note (~:123)**

Replace:

```
- **Balanced game (recommended):** both sides field the **same number of Rigs in each weight class** (mirror the composition).
```
with:
```
- **Mirror composition (required):** neither side may deploy until both forces match unit-for-unit by kind — and, for Rigs, by weight class. Readiness is locked until parity is met.
```

- [ ] **Step 4: Update the Alpha note (~:639)**

Replace:

```
**Removed from the Alpha:** the Oil points currency, Iron / Iron Cap weight limits, and **engine types** (Crude Oil / Diesel / Arc). Equipment returned in a redesigned form as the single-slot system in §15. Squadrons balance by matching composition (§3); heat tolerance is set by weight class (§6).
```
with:
```
**Removed from the Alpha:** the Oil points currency, Iron / Iron Cap weight limits, and **engine types** (Crude Oil / Diesel / Arc). Equipment returned in a redesigned form as the single-slot system in §15. Squadrons are balanced by enforced mirror composition (§3); heat tolerance is set by weight class (§6).
```

- [ ] **Step 5: Commit**

```bash
git add rules.md
git commit -m "docs(rules): mandatory mirror composition replaces fixed 3-5 count and Colossal cap"
```

---

## Task 9: Full-suite verification

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all Vitest and `node --test` suites PASS. If any unrelated test referenced `MAX_RIGS_PER_SIDE`, `MAX_RIGS_TOTAL`, `commissioned`, or the old `>= 3` gate, fix it to the parity model and re-run.

- [ ] **Step 2: Grep for stragglers**

Run: `git grep -nE "MAX_RIGS_PER_SIDE|MAX_RIGS_TOTAL|MIN_RIGS_TO_READY|commissioned\("`
Expected: no matches in source (only possibly in `docs/`). Resolve any source hits.

- [ ] **Step 3: Final commit if Step 1/2 required fixes**

```bash
git add -A
git commit -m "test: reconcile remaining references to removed roster caps"
```
```

## Coverage vs spec

| Spec section | Task |
| --- | --- |
| `compositionOf` / `sidesAtParity` helpers | 1 |
| Three gate swaps (start / ready / seed) | 1 |
| Un-ready on change (already handled) | 1 (test) |
| Remove `MAX_RIGS_*` caps, `canAddRigForSide` → true | 2 |
| Client type decls | 2 |
| `server/prompt.js` + test | 3 |
| Client composition + parity-diff helper | 4 |
| `computeFocus` hint rewrite | 5 |
| viewModels parity indicator + Squadron | 6 |
| RigAddScreen cap messaging | 7 |
| rules.md edits | 8 |
| Full verification | 9 |
