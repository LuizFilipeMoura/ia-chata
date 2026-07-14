# Seed Preset Rosters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three launch presets to the V2 "Seed Test Battle" flow — Full spread (today's default), 4v4 rigs-only (curated), and 4v4 random rig prototypes.

**Architecture:** Server-side. The `seed` verb gains an `attrs.preset` selector that chooses the roster before its existing default fallback. Preset rosters live beside `SEED_ROSTER` in `shared/game-state.js` (`SEED_ROSTER_4V4` constant + `randomSeedRoster(random)` helper using the seedable RNG). The Join-screen seed picker becomes one panel: a preset toggle row + the existing who-acts-first row, which launches with the selected preset.

**Tech Stack:** Node ESM (`shared/game-state.js`), React + TypeScript (client/src/v2), Vitest (client) + `node:test` (shared).

**Spec:** `docs/superpowers/specs/2026-07-14-seed-preset-rosters-design.md`

---

## File Structure

- `shared/game-state.js` — add `SEED_ROSTER_4V4`, `randomSeedRoster()`, and the `preset` branch in the `seed` verb. (Modify)
- `shared/game-state.test.js` — preset coverage tests. (Modify)
- `client/src/v2/screens/seedPreset.ts` — `SeedPreset` type + `SEED_PRESETS` render list, shared by Join/V2App/hook. (Create)
- `client/src/v2/hooks/useSeedBattle.ts` — forward `preset`. (Modify)
- `client/src/v2/hooks/useSeedBattle.test.tsx` — assert forwarded `preset`. (Modify)
- `client/src/v2/V2App.tsx` — `onSeed(first, preset)`, send `preset` in attrs. (Modify)
- `client/src/v2/screens/Join.tsx` — one-panel picker + preset state. (Modify)
- `client/src/v2/screens/Join.test.tsx` — updated seed-flow expectations. (Modify)
- `client/src/v2/styles/join.css` — preset row styles. (Modify)

---

## Task 1: Server preset rosters + seed branch

**Files:**
- Modify: `shared/game-state.js` (add exports after `SEED_ROSTER`/`SEED_SUPPORT`; extend `seed` verb near line 2746)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Add the failing tests**

Add these tests near the existing seed tests (after the `SEED_ROSTER is 6 entries…` test, ~line 4350) in `shared/game-state.test.js`:

```js
test("seed preset 'rigs4' builds 4 rigs, 0 support per side, distinct chassis", () => {
  const r = createRoom("SEED-4V4");
  applyCommand(r, { verb: "seed", attrs: { first: "a", preset: "rigs4" } });

  assert.equal(r.game.started, true);
  const rigs = r.rigs.filter((rig) => rig.kind === "rig");
  const support = r.rigs.filter((rig) => rig.kind === "tank" || rig.kind === "walker");
  assert.equal(support.length, 0);
  assert.equal(rigs.filter((rig) => rig.owner === "a").length, 4);
  assert.equal(rigs.filter((rig) => rig.owner === "b").length, 4);
  assert.equal(new Set(rigs.map((rig) => rig.chassis)).size, 8);
});

test("SEED_ROSTER_4V4 is 8 entries, 4 per side, all chassis distinct and resolvable", () => {
  assert.equal(SEED_ROSTER_4V4.length, 8);
  assert.equal(SEED_ROSTER_4V4.filter((e) => e.owner === "a").length, 4);
  assert.equal(SEED_ROSTER_4V4.filter((e) => e.owner === "b").length, 4);
  assert.equal(new Set(SEED_ROSTER_4V4.map((e) => e.chassis)).size, 8);
  for (const e of SEED_ROSTER_4V4) assert.ok(resolveChassis({ chassis: e.chassis }), e.chassis);
});

test("seed preset 'random4' builds 4 rigs, 0 support per side, deterministic under a stub RNG", () => {
  const r = createRoom("SEED-RND");
  applyCommand(r, { verb: "seed", attrs: { first: "a", preset: "random4" } }, {}, { random: () => 0 });

  const rigs = r.rigs.filter((rig) => rig.kind === "rig");
  const support = r.rigs.filter((rig) => rig.kind === "tank" || rig.kind === "walker");
  assert.equal(support.length, 0);
  assert.equal(rigs.filter((rig) => rig.owner === "a").length, 4);
  assert.equal(rigs.filter((rig) => rig.owner === "b").length, 4);
  // random() === 0 → randomPick picks index 0 → every rig uses CHASSIS[0].
  assert.ok(rigs.every((rig) => rig.chassis === CHASSIS[0].id));
});

test("randomSeedRoster returns 8 rig entries, 4 per side", () => {
  const roster = randomSeedRoster(() => 0);
  assert.equal(roster.length, 8);
  assert.equal(roster.filter((e) => e.owner === "a").length, 4);
  assert.equal(roster.filter((e) => e.owner === "b").length, 4);
  assert.ok(roster.every((e) => e.chassis && e.prototype));
});

test("explicit roster overrides preset", () => {
  const r = createRoom("SEED-OVR");
  applyCommand(r, { verb: "seed", attrs: { first: "a", preset: "random4", roster: [
    ...SEED_ROSTER.filter((e) => e.owner === "a"),
    ...SEED_ROSTER.filter((e) => e.owner === "b"),
  ] } });
  const rigs = r.rigs.filter((rig) => rig.kind === "rig");
  assert.equal(rigs.length, 6); // the explicit 6-entry roster, not random4's 8
});
```

Add `SEED_ROSTER_4V4` and `randomSeedRoster` to the import block at the top of `shared/game-state.test.js` (the `import { … } from` list that already pulls `SEED_ROSTER, CHASSIS`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test "shared/game-state.test.js"`
Expected: FAIL — `SEED_ROSTER_4V4`/`randomSeedRoster` are undefined; the `rigs4`/`random4` seeds currently fall through to the default roster (support.length would be 6, not 0).

- [ ] **Step 3: Add `SEED_ROSTER_4V4`**

In `shared/game-state.js`, immediately after the `SEED_ROSTER` array (closes ~line 119), add:

```js
// Curated 4v4 rigs-only roster (spec: 2026-07-14-seed-preset-rosters). Reuses
// the 6 SEED_ROSTER entries and adds one more distinct chassis per side, keeping
// the all-distinct / no-mirror-matchup invariant (AGENTS.md). No support units.
export const SEED_ROSTER_4V4 = [
  ...SEED_ROSTER.filter((e) => e.owner === "a"),
  { name: "A4", owner: "a", chassis: "medium-crossbow-talon",    prototype: "longRange" },
  ...SEED_ROSTER.filter((e) => e.owner === "b"),
  { name: "B4", owner: "b", chassis: "light-wreckingball-double", prototype: "melee" },
];
```

- [ ] **Step 4: Add `randomSeedRoster`**

In `shared/game-state.js`, immediately after the `SEED_SUPPORT` array (closes ~line 175), add:

```js
// A random rigs-only 4v4 roster (spec: 2026-07-14-seed-preset-rosters): 4 per
// side, each a random chassis with its Prototype upgrade on a random weapon
// slot. Takes the seedable `random` so tests are deterministic and real launches
// vary. Entry shape matches SEED_ROSTER; no support units.
export function randomSeedRoster(random = Math.random) {
  const out = [];
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 4; i++) {
      const pb = randomPick(CHASSIS, random);
      const prototype = randomPick(["longRange", "melee"], random);
      out.push({ name: `${owner.toUpperCase()}${i}`, owner, chassis: pb.id, prototype });
    }
  }
  return out;
}
```

(`randomPick` and `CHASSIS` are module-scoped and resolved at call time — safe despite `randomPick` being declared lower in the file.)

- [ ] **Step 5: Add the `preset` branch in the `seed` verb**

In `shared/game-state.js`, in the `seed` verb handler, replace the roster resolution (currently):

```js
    const roster = Array.isArray(a.roster) && a.roster.length
      ? a.roster
      : [...SEED_ROSTER, ...SEED_SUPPORT];
```

with:

```js
    // An explicit roster wins. Otherwise a `preset` selects a known composition;
    // omitted/unknown preset keeps the full-spread default (rigs + support).
    const preset = String(a.preset || "").toLowerCase();
    const roster = Array.isArray(a.roster) && a.roster.length
      ? a.roster
      : preset === "rigs4"
        ? SEED_ROSTER_4V4
        : preset === "random4"
          ? randomSeedRoster(options.random)
          : [...SEED_ROSTER, ...SEED_SUPPORT];
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test "shared/game-state.test.js"`
Expected: PASS — all new tests plus the existing seed tests (default `support` behavior unchanged).

- [ ] **Step 7: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): seed preset rosters — rigs4 + random4 alongside default"
```

---

## Task 2: Shared `SeedPreset` type + client wiring

**Files:**
- Create: `client/src/v2/screens/seedPreset.ts`
- Modify: `client/src/v2/hooks/useSeedBattle.ts`
- Test: `client/src/v2/hooks/useSeedBattle.test.tsx`
- Modify: `client/src/v2/V2App.tsx`

- [ ] **Step 1: Create the preset module**

Create `client/src/v2/screens/seedPreset.ts`:

```ts
// The three Seed Test Battle presets (spec: 2026-07-14-seed-preset-rosters).
// Shared by the Join picker, V2App dispatch, and useSeedBattle.
export type SeedPreset = "support" | "rigs4" | "random4";

export const SEED_PRESETS: { id: SeedPreset; label: string }[] = [
  { id: "support", label: "Full spread" },
  { id: "rigs4", label: "4v4 rigs" },
  { id: "random4", label: "4v4 random" },
];
```

- [ ] **Step 2: Update the failing hook test**

Replace the body of `client/src/v2/hooks/useSeedBattle.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => send }));

import { useSeedBattle } from "./useSeedBattle";

test("sends the seed verb with the chosen first side and preset", () => {
  const { result } = renderHook(() => useSeedBattle());
  result.current("b", "rigs4");
  expect(send).toHaveBeenCalledWith("seed", { first: "b", preset: "rigs4" });
});
```

- [ ] **Step 3: Run the hook test to verify it fails**

Run: `npx vitest run client/src/v2/hooks/useSeedBattle.test.tsx`
Expected: FAIL — `useSeedBattle`'s callback takes one arg and sends `{ first }` only.

- [ ] **Step 4: Update `useSeedBattle`**

Replace `client/src/v2/hooks/useSeedBattle.ts`:

```ts
import { useCallback } from "react";
import { useCommands } from "../../hooks/useCommands";
import type { SeedPreset } from "../screens/seedPreset";

/** Seed a full test battle. `first` is the side whose turn opens ("a" = your
 *  turn, "b" = enemy). `preset` chooses the roster composition. Callable without
 *  a browser. */
export function useSeedBattle() {
  const send = useCommands();
  return useCallback(
    (first: "a" | "b", preset: SeedPreset) => send("seed", { first, preset }),
    [send],
  );
}
```

- [ ] **Step 5: Run the hook test to verify it passes**

Run: `npx vitest run client/src/v2/hooks/useSeedBattle.test.tsx`
Expected: PASS

- [ ] **Step 6: Update `V2App.onSeed`**

In `client/src/v2/V2App.tsx`:

Add the import near the other screen imports:

```ts
import type { SeedPreset } from "./screens/seedPreset";
```

Change the `onSeed` callback signature and the seed command body:

```ts
  const onSeed = useCallback(async (first: "a" | "b", preset: SeedPreset) => {
```

and the command fetch body line from:

```ts
        body: JSON.stringify({ cmd: { verb: "seed", attrs: { first } }, side: "a" }),
```

to:

```ts
        body: JSON.stringify({ cmd: { verb: "seed", attrs: { first, preset } }, side: "a" }),
```

- [ ] **Step 7: Run the hook test + typecheck**

Run: `npx vitest run client/src/v2/hooks/useSeedBattle.test.tsx && npx tsc --noEmit -p client`
Expected: hook test PASS. `tsc` will report an error in `Join.tsx`/`V2App` wiring for `onSeed` arity — that is fixed in Task 3. If `tsc` passes here (because Join isn't yet retyped), that's fine too; proceed.

- [ ] **Step 8: Commit**

```bash
git add client/src/v2/screens/seedPreset.ts client/src/v2/hooks/useSeedBattle.ts client/src/v2/hooks/useSeedBattle.test.tsx client/src/v2/V2App.tsx
git commit -m "feat(v2): thread seed preset through useSeedBattle + V2App"
```

---

## Task 3: One-panel seed picker in Join

**Files:**
- Modify: `client/src/v2/screens/Join.tsx`
- Test: `client/src/v2/screens/Join.test.tsx`
- Modify: `client/src/v2/styles/join.css`

- [ ] **Step 1: Update the failing Join tests**

Replace the three seed-related tests in `client/src/v2/screens/Join.test.tsx` (the `seed CTA opens…`, `seed 'Your turn'…` tests — keep the first two non-seed tests untouched) with:

```tsx
test("seed defaults to the 'support' preset and fires onSeed(first, preset)", async () => {
  const user = userEvent.setup();
  const onSeed = vi.fn();
  render(<Join onJoin={vi.fn()} error="" onSeed={onSeed} />);

  await user.click(screen.getByRole("button", { name: /Seed Test Battle/i }));
  await user.click(screen.getByRole("button", { name: /Enemies turn/i }));

  expect(onSeed).toHaveBeenCalledWith("b", "support");
});

test("seed forwards the chosen preset and 'Your turn'", async () => {
  const user = userEvent.setup();
  const onSeed = vi.fn();
  render(<Join onJoin={vi.fn()} error="" onSeed={onSeed} />);

  await user.click(screen.getByRole("button", { name: /Seed Test Battle/i }));
  await user.click(screen.getByRole("button", { name: /4v4 random/i }));
  await user.click(screen.getByRole("button", { name: /Your turn/i }));

  expect(onSeed).toHaveBeenCalledWith("a", "random4");
});
```

- [ ] **Step 2: Run the Join tests to verify they fail**

Run: `npx vitest run client/src/v2/screens/Join.test.tsx`
Expected: FAIL — no `4v4 random` button exists and `onSeed` is called with one arg.

- [ ] **Step 3: Update `Join.tsx`**

In `client/src/v2/screens/Join.tsx`:

Add imports at the top:

```tsx
import { SEED_PRESETS, type SeedPreset } from "./seedPreset";
```

Change the `Props.onSeed` type:

```tsx
  onSeed?: (first: "a" | "b", preset: SeedPreset) => void;
```

Add preset state alongside the existing `seeding` state:

```tsx
  const [preset, setPreset] = useState<SeedPreset>("support");
```

Replace the seed-picker block (the `{onSeed && seeding && ( … )}` JSX, lines ~113-126) with:

```tsx
          {onSeed && seeding && (
            <div className="v2-join-seedpick" role="group" aria-label="Seed a test battle">
              <div className="v2-join-label v2-eyebrow">Roster preset</div>
              <div className="v2-join-presets">
                {SEED_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={"v2-join-seedbtn v2-join-preset" + (preset === p.id ? " is-sel" : "")}
                    aria-pressed={preset === p.id}
                    onClick={() => setPreset(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="v2-join-label v2-eyebrow">Who acts first?</div>
              <button type="button" className="v2-join-seedbtn" onClick={() => onSeed("a", preset)}>
                Your turn
              </button>
              <button type="button" className="v2-join-seedbtn" onClick={() => onSeed("b", preset)}>
                Enemies turn
              </button>
              <button type="button" className="v2-join-seedcancel" onClick={() => setSeeding(false)}>
                Cancel
              </button>
            </div>
          )}
```

- [ ] **Step 4: Run the Join tests to verify they pass**

Run: `npx vitest run client/src/v2/screens/Join.test.tsx`
Expected: PASS (all four Join tests).

- [ ] **Step 5: Add preset-row styles**

Append to `client/src/v2/styles/join.css`:

```css
/* Seed preset toggle row — a horizontal band of preset buttons; selected uses
   the shared .is-sel treatment. */
.v2-root .v2-join-presets {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.v2-root .v2-join-preset {
  flex: 1;
}
.v2-root .v2-join-preset.is-sel {
  border-color: var(--v2-oil-deep);
  box-shadow: inset 0 0 0 1px var(--v2-oil-deep);
}
```

- [ ] **Step 6: Full client typecheck + client test suite**

Run: `npx tsc --noEmit -p client && npx vitest run client/src/v2`
Expected: PASS — no arity errors; all v2 tests green.

- [ ] **Step 7: Commit**

```bash
git add client/src/v2/screens/Join.tsx client/src/v2/screens/Join.test.tsx client/src/v2/styles/join.css
git commit -m "feat(v2): one-panel seed picker with roster preset toggles"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — Vitest (client) and `node:test` (shared + server) all green.

- [ ] **Step 2: Browser smoke (verification workflow)**

Start the dev server (via preview_start with the project's launch config), open the Join screen, click **Seed Test Battle**, and for each preset (`Full spread`, `4v4 rigs`, `4v4 random`) launch and confirm:
- `Full spread` → 3 rigs + 3 support per side.
- `4v4 rigs` → 4 rigs, 0 support per side.
- `4v4 random` → 4 rigs, 0 support per side; relaunching yields different chassis.

Capture a screenshot of one launched preset as proof.

- [ ] **Step 3: Confirm nothing else regressed**

Run: `git status` and confirm only the intended files changed. The pre-existing unrelated working-tree changes (RigTerminal, commissionData, etc.) must remain untouched by this work.

---

## Self-Review Notes

- **Spec coverage:** presets table → Task 1 (`SEED_ROSTER_4V4`, `randomSeedRoster`, `preset` branch); UI one-panel → Task 3; wiring (`onSeed`, `useSeedBattle`) → Task 2; testing section → Tasks 1–4. Curated 4th chassis picks (`medium-crossbow-talon`, `light-wreckingball-double`) → Task 1 Step 3.
- **Back-compat:** omitted/`support` preset keeps the default roster; explicit `roster` still overrides (Task 1 tests cover both).
- **Type consistency:** `SeedPreset` = `"support" | "rigs4" | "random4"` defined once in `seedPreset.ts`, imported by hook/V2App/Join. Preset ids match the server branch strings (`rigs4`, `random4`) exactly.
