# Resolution Ledger Implementation Plan (2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the attack panel show every input that fed the outcome — so a player can answer "why 0 damage?" without reading the source.

**Architecture:** The engine currently computes its arithmetic and throws it away: `computeModifiedAim` folds **eleven** inputs into one target number and returns only the number; `computeStr` does the same with **fifteen**. No UI can render what the engine doesn't emit. So this plan is two moves: teach those two functions to emit their terms (without changing a single caller), then replace the flat one-equation `breakdown` with an ordered `steps[]` the panel walks.

**Tech Stack:** Plain ES modules in `shared/` (tests: `node:test`, run `node --test shared/<f>.test.js`). React + TypeScript client (tests: vitest, run `npx vitest run`). `npm test` runs both.

**Spec:** `docs/superpowers/specs/2026-07-14-hit-wound-location-design.md` (§ "UI — the resolution ledger")
**Predecessor:** `docs/superpowers/plans/2026-07-14-wound-engine.md` — DONE. The engine resolves hit d6 → wound d10 → location d12, damage = per-weapon `d`. 938 tests green.

---

## Why this plan exists

The bug that started this whole rewrite was a UI bug as much as a maths bug. A player saw:

> **2** HITS · **4** WEAPON STR → **0** SP → HULL

…and had no way to answer their own question. The impact dice were rolled inside `rollImpacts` and never pushed into `rolls`. The die that decided their damage was **invisible**, in every mode — even physical-dice mode passed `impacts: toHit.map(() => undefined)` and let the server roll them unseen.

Plan 1 fixed the maths and made the wound dice visible. It deliberately left the panel minimal: three fields (`str`, `toughness`, `woundTarget`) bolted onto the old flat shape. **This plan builds the real thing.**

Every rule in the rewrite is inert to a player who cannot see it operate. The wound roll's readability — a flat 10% per point of STR — only pays off if the panel shows the STR, the T, and the number they produced.

## Background for the engineer

**1. V1 is retired — do not touch it.** `client/src/main.tsx` renders only `V2Boot`; `App.tsx`/`AppProviders.tsx` and everything under `client/src/components/` are unreachable. There are two `RollConsole.tsx` files; **only `client/src/v2/overlays/RollConsole.tsx` is live.** The v1 one still renders `breakdown.tier`/`.total` (dead fields) — leave it alone, it is dead code reached by nothing.

**2. `shared/combat.js` is pure.** It imports only from `rules.js` and `unit-kinds.js` — never `game-state.js` (import cycle). Anything from game-state arrives via the injected `ctx` or on the unit objects. Do not break this.

**3. Resolutions flow one way.** `resolveAttack` returns `{ ok, hits, location, impacts, heat }`. The `rolls`/`breakdown` the UI renders go out through `ctx.pushResolution(room, {...})` — they are NOT on the return value. Tests must bind `const ctx = makeCtx()` and read `ctx.resolutions`.

**4. Dice are injectable.** `rollD(sides, provided, random)` uses `provided` verbatim if it's a number. Tests force outcomes with `opts.dice = { toHit: [...], wounds: [...], location: n }`.

**5. Test traps that bit every agent on Plan 1.**
- `makeRig` returns `null` unless BOTH weapon slots are filled.
- `SUPPORTED_RIG_CLASSES` is `["light","medium"]` — `makeRig(..., "heavy"/"colossal", ...)` returns `null`. Use bare `{ weightClass }` doubles.
- `assert` is `node:assert/strict`.
- Light hull is T4 → `woundTarget(8,4)` hits the clamp at 2. Don't let a test pass via the clamp when it means to test arithmetic.

**6. The working tree may be dirty** with unrelated in-flight work. **Never `git add` a directory.** Stage only files you edited, by name. Never `git stash`.

## File structure

| File | Responsibility | Change |
|---|---|---|
| `shared/combat.js` | `aimBreakdown`, `strBreakdown`, `steps[]` | Emit terms; build the ledger |
| `client/src/state/types.ts` | The wire contract | `ResolutionStep`; deprecate flat fields |
| `client/src/v2/overlays/RollConsole.tsx` | Render the ledger | Walk `steps[]` |
| `client/src/v2/styles/overlay.css` | Ledger layout | Step rows, chip wrap |
| `client/src/v2/overlays/AttackWizard.tsx` | Manual-dice mode | Prompt for wound dice |
| `shared/glossary.js` | Player-facing rule text | `impact-roll` → wound roll |

---

## Task 1: `computeStr` emits its terms

**Files:**
- Modify: `shared/combat.js` (`computeStr`, ~line 172)
- Test: `shared/combat.test.js`

`computeStr` sums up to fifteen contributions and returns a bare number. The wound step must show which ones fired.

**The refactor that costs nothing:** extract the body into `strBreakdown(attacker, profile, opts)` returning `{ value, terms }`, and make `computeStr` a one-line wrapper returning `.value`. **Every existing caller is untouched.** This is the whole trick — do not change `computeStr`'s signature.

A `term` is `{ label, value }`. **Only push a term when it actually fires** (non-zero). With ~30 possible modifiers, rendering every zero would bury the two that mattered.

- [ ] **Step 1: Write the failing tests**

```js
test("strBreakdown — reports the base weapon STR and the weight modifier", () => {
  const attacker = makeRig(1, "A", "light", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = strBreakdown(attacker, { ...WEAPONS.melee["Sword"] }, {});
  assert.equal(b.value, 4);                       // Sword 5, light -1
  assert.deepEqual(b.terms, [
    { label: "weapon STR", value: 5 },
    { label: "light chassis", value: -1 },
  ]);
});

test("strBreakdown — a modifier that does not fire emits no term", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = strBreakdown(attacker, { ...WEAPONS.melee["Sword"] }, {});
  // medium weight mod is 0 — it must not appear as a term at all.
  assert.deepEqual(b.terms, [{ label: "weapon STR", value: 5 }]);
  assert.equal(b.value, 5);
});

test("strBreakdown — a live upgrade emits a named term", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  attacker.reactorOverdriveActive = true;
  const b = strBreakdown(attacker, { ...WEAPONS.melee["Sword"] }, {});
  assert.equal(b.value, 7);
  assert.ok(b.terms.some((t) => t.label === "Reactor Overdrive" && t.value === 2));
});

test("computeStr — still returns a bare number, callers unchanged", () => {
  const attacker = makeRig(1, "A", "light", "a", { longRange: "Autocannon", melee: "Sword" });
  assert.equal(computeStr(attacker, { ...WEAPONS.melee["Sword"] }, {}), 4);
});
```

**Verify the arithmetic against the real stats before trusting my comments** — check Sword's `str` and `WEIGHT_STR_MOD.light` in the source.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test shared/combat.test.js -t "strBreakdown"`
Expected: FAIL — `strBreakdown is not a function`.

- [ ] **Step 3: Implement**

Rename `computeStr` → `strBreakdown`. Keep **every** existing comment — they explain why each upgrade's number is what it is. Each `bonus += N` becomes a `terms.push({ label, value: N })` alongside. Give each term a **player-facing label**, not a code name: `"Cold Bore"`, not `"coldBore"`.

The `strOverride` early-return (Anvil Boss riposte) returns `{ value: opts.strOverride, terms: [{ label: "forced STR", value: opts.strOverride }] }`.

Then:

```js
// §12/§7 — the shot's effective STR. Thin wrapper over strBreakdown so the ~15
// contributions can be shown in the resolution ledger without changing any
// caller: the engine used to compute this arithmetic and throw it away, which is
// why a player could not tell why a shot did nothing.
export function computeStr(attacker, profile, opts) {
  return strBreakdown(attacker, profile, opts).value;
}
```

- [ ] **Step 4: Run the full suite**

Run: `node --test "shared/**/*.test.js"`
Expected: **0 failures.** The wrapper means nothing else moved. If anything else fails, you changed behaviour — find it.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "refactor(combat): computeStr emits its terms via strBreakdown"
```

---

## Task 2: `computeModifiedAim` emits its terms

**Files:**
- Modify: `shared/combat.js` (`computeModifiedAim`, ~line 39)
- Test: `shared/combat.test.js`

Same trick, bigger payoff. `computeModifiedAim` folds **eleven** inputs into one `modAim` (`combat.js:75`): base AIM by weight class, weapon ACC at the measured range, cover, aimed penalty, wrecked-hull penalty, engagement penalty, recon paint, smoke, ballistic sweet-band, predictive tracking. A player has never seen any of them.

Note the sign convention: `modAim = base - accTotal`. Higher ACC **lowers** the target number. Terms should read in ACC space (a bonus is positive), and the step's target number is the resulting `modAim`.

- [ ] **Step 1: Write the failing tests**

```js
test("aimBreakdown — reports the base aim and the weapon's ACC at range", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] }, { distance: 12 });
  assert.equal(b.value, 3);                          // AIM 4 - ACC 1 at the sweet spot
  assert.deepEqual(b.terms, [
    { label: "base aim", value: 4 },
    { label: "weapon ACC at 12\"", value: 1 },
  ]);
});

test("aimBreakdown — cover and smoke each emit a named term", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] },
    { distance: 12, cover: 2, targetSmoke: true });
  assert.ok(b.terms.some((t) => t.label === "cover" && t.value === -2));
  assert.ok(b.terms.some((t) => t.label === "target in smoke" && t.value === -2));
});

test("computeModifiedAim — still returns a bare number, callers unchanged", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  assert.equal(computeModifiedAim(attacker, { ...WEAPONS.longRange["Autocannon"] }, { distance: 12 }), 3);
});
```

**Verify against the source.** `weaponAccAt` computes ACC from `peak`/`sweet`/`dropoff`; check Autocannon's real values rather than trusting my `1`. If my numbers are wrong, fix them and TELL ME.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test shared/combat.test.js -t "aimBreakdown"`

- [ ] **Step 3: Implement**

Rename `computeModifiedAim` → `aimBreakdown`, returning `{ value, terms }`. Keep every existing comment. Push a term per contribution, **only when non-zero**. Labels are player-facing: `"cover"`, `"aimed shot"`, `"hull wrecked"`, `"locked in melee"`, `"recon paint"`, `"target in smoke"`, `"ballistic processor"`, `"predictive tracking"`.

The `coverEff`/`engagedEff` cancellations (Targeting Computer's first-fire, Predictive Tracking) are the interesting case: when a cancel fires, the *cancelled* term must not appear, and the canceller should. Emit `{ label: "targeting computer (ignores cover)", value: 0 }` — a zero-valued term that is nonetheless informative. **This is the one place a zero term is worth showing**, because it explains an absence.

```js
// §7.4 — the D6 target number. Thin wrapper over aimBreakdown so the eleven
// inputs folded in here can be shown in the resolution ledger without changing
// any caller.
export function computeModifiedAim(attacker, profile, opts) {
  return aimBreakdown(attacker, profile, opts).value;
}
```

- [ ] **Step 4: Run the full suite**

Run: `node --test "shared/**/*.test.js"`
Expected: **0 failures.**

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "refactor(combat): computeModifiedAim emits its terms via aimBreakdown"
```

---

## Task 3: `resolveAttack` builds the ledger

**Files:**
- Modify: `shared/combat.js` (`resolveAttack`, ~line 630)
- Test: `shared/combat.test.js`

Replace the flat `terms`/`sp`/`str`/`toughness`/`woundTarget` breakdown with an ordered `steps[]`.

**The shape:**

```js
breakdown: {
  actor, weapon, target,          // target is the unit's NAME — do not reuse this key
  steps: [
    { kind: "hit",      target: 4,  terms: [...], dice: [...], out: "2 of 3 hit" },
    { kind: "wound",    target: 7,  str: 4, toughness: 5, terms: [...], dice: [...], out: "1 of 2 wounded" },
    { kind: "location", die: 2,     out: "hull" },
    { kind: "damage",   terms: [...], out: "2 SP → hull" },
  ],
}
```

`dice` on a step is `[{ value, ok }]`. `terms` is `[{ label, value }]`.

**Non-negotiables:**
- **`breakdown.target` stays the target's NAME.** A previous draft collided it with the wound TN in the same object literal, where the later key silently won and a rig's name rendered as "→ 6". The TN lives on the wound step.
- **Auto-fails are steps, not absences.** A negating shield or Raking front-arc must emit a wound step saying so (`out: "shield negates — no wound roll"`), with `target: null`. A step that silently vanishes is the same failure as a hidden die.
- **A zero-hit attack still emits a wound step** — `out: "no hits to wound"`. The player must see the chain stopped, not infer it.

- [ ] **Step 1: Write the failing tests**

```js
test("ledger — every step appears in resolution order", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6, 1], wounds: [10], location: 1 } },
    () => 0, ctx);
  const bd = ctx.resolutions.find((r) => r.kind === "attack").breakdown;
  assert.deepEqual(bd.steps.map((s) => s.kind), ["hit", "wound", "location", "damage"]);
  assert.equal(bd.target, "B");                 // the NAME, not a number
});

test("ledger — the hit step shows the inputs that made the target number", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "longRange", arc: "front", distance: 12, cover: 2,
      dice: { toHit: [6, 6, 6, 6], wounds: [10, 10, 10, 10], location: 1 } },
    () => 0, ctx);
  const hit = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[0];
  assert.ok(hit.terms.some((t) => t.label === "cover" && t.value === -2));
  assert.equal(hit.dice.length, 4);             // Autocannon ROF 4
});

test("ledger — the wound step shows effective STR against toughness", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6], wounds: [9], location: 1 } },
    () => 0, ctx);
  const w = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[1];
  assert.equal(w.str, 5);
  assert.equal(w.toughness, 5);
  assert.equal(w.target, 6);
  assert.deepEqual(w.dice, [{ value: 9, ok: true }]);
});

test("ledger — an earned zero is a step that says so, not a missing step", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Bulwark Shield" });
  target.preparation = { type: "raise-shield" };
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6], wounds: [10], location: 1 } },
    () => 0, ctx);
  const w = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[1];
  assert.equal(w.kind, "wound");
  assert.equal(w.target, null);
  assert.match(w.out, /shield/i);
});

test("ledger — a volley that lands no hits still emits a wound step", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [1, 1], wounds: [10, 10], location: 1 } },
    () => 0, ctx);
  const bd = ctx.resolutions.find((r) => r.kind === "attack").breakdown;
  const w = bd.steps.find((s) => s.kind === "wound");
  assert.ok(w, "the chain must show where it stopped");
  assert.match(w.out, /no hits/i);
});

test("ledger — the damage step multiplies wounds by the weapon's D", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Wrecking Ball" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6], wounds: [10], location: 1 } },
    () => 0, ctx);
  const d = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[3];
  assert.ok(d.terms.some((t) => t.label === "weapon D" && t.value === 5));
  assert.match(d.out, /5 SP/);
});
```

**Verify every fixture and number against the source before trusting it.** I have got these wrong before on this rewrite.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test shared/combat.test.js -t "ledger"`

- [ ] **Step 3: Implement**

Build `steps` in `resolveAttack`. `rollToHit` already computes `modAim` — have it also return the aim terms (it calls `computeModifiedAim`; switch it to `aimBreakdown`). `rollWounds` already returns per-wound `{ die, target, str, toughness, sp }`. The `terms` for the wound step come from `strBreakdown` plus the arc/defender modifiers `rollWounds` computes — you will need to thread those out; add them to the objects `rollWounds` already returns rather than recomputing.

**Do not recompute anything for display.** If the ledger's number and the engine's number are computed separately they will drift, and the ledger's whole purpose is to be true.

Keep `sp` and `location` on the breakdown (other code reads them). Delete `terms`, `str`, `toughness`, `woundTarget` from the top level — they move onto the steps.

- [ ] **Step 4: Run the full suite**

Run: `node --test "shared/**/*.test.js"`
Expected: 0 failures. Tests asserting the old flat `breakdown.terms`/`str`/`toughness`/`woundTarget` must be **rewritten to read the steps**, not deleted — they cover live behaviour.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): resolveAttack emits a per-step resolution ledger"
```

---

## Task 4: The wire contract

**Files:**
- Modify: `client/src/state/types.ts` (`ResolutionBreakdown`, ~line 84)
- Test: none (types only; `npx tsc --noEmit` is the check)

- [ ] **Step 1: Implement**

```ts
/** One resolution step. The panel walks these in order and renders each. */
export interface ResolutionStep {
  kind: "hit" | "wound" | "location" | "damage";
  /** The number the dice had to beat. Null on an auto-fail (shield negate, blind arc). */
  target?: number | null;
  /** Wound step only: the effective STR and the struck location's Toughness. */
  str?: number | null;
  toughness?: number | null;
  /** Location step only. */
  die?: number;
  /** Every input that FIRED. A modifier resolving to 0 is omitted — with ~30
   *  possible, rendering the zeroes would bury the two that mattered. */
  terms?: ResolutionTerm[];
  dice?: Array<{ value: number; ok: boolean }>;
  /** Human-readable outcome, e.g. "2 of 3 hit". Always present. */
  out: string;
}

export interface ResolutionBreakdown {
  actor?: string;
  weapon?: string;
  /** The target unit's NAME. Never a number — the wound TN lives on the wound step. */
  target?: string;
  /** The ordered ledger: hit → wound → location → damage. */
  steps?: ResolutionStep[];
  /** Structure points dealt. */
  sp?: number;
  location?: string;
}
```

Delete `terms`, `total`, `tier` from `ResolutionBreakdown` — nothing emits them. Keep `ResolutionTerm`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: errors ONLY in the v1 `client/src/components/overlays/RollConsole.tsx` (dead code — Task 5 note) and any pre-existing `sprintMult` errors (someone else's in-flight work; leave them).

- [ ] **Step 3: Commit**

```bash
git add client/src/state/types.ts
git commit -m "feat(v2): ResolutionStep replaces the flat breakdown contract"
```

---

## Task 5: Render the ledger

**Files:**
- Modify: `client/src/v2/overlays/RollConsole.tsx` (~line 370-418), `client/src/v2/styles/overlay.css`
- Test: `client/src/v2/overlays/RollConsole.test.tsx`

The live panel renders one equation: a `terms` row, then `= total`, a tier badge, and `sp`. Replace with a step list.

**Mobile first.** The originating screenshot is a phone (~390px). Four stacked term-lists will not fit. Each step is a compact row — target number + dice + outcome — with its terms as a **wrapped chip row** beneath. Long modifier lists must never push the OK button off-screen; the step list scrolls inside its own container.

**Reveal in resolution order.** `RollConsole` already settles dice sequentially. Steps should appear hit → wound → location → damage so the panel *narrates* the rule rather than presenting a finished sum. Respect `prefers-reduced-motion` — the existing `reduced` flag does this.

- [ ] **Step 1: Write the failing tests**

```tsx
it("renders every step of the ledger in order", async () => {
  // ...render RollConsole, playResolution with a 4-step breakdown fixture...
  const steps = screen.getAllByTestId("v2-roll-step");
  expect(steps).toHaveLength(4);
  expect(steps[0]).toHaveTextContent(/hit/i);
  expect(steps[1]).toHaveTextContent(/wound/i);
});

it("shows the wound step's STR against toughness and the resulting target", async () => {
  // wound step: { str: 4, toughness: 5, target: 7 }
  const wound = screen.getByTestId("v2-roll-step-wound");
  expect(wound).toHaveTextContent("4");   // effective STR
  expect(wound).toHaveTextContent("5");   // toughness
  expect(wound).toHaveTextContent("7+");  // the target number
});

it("renders an auto-fail step rather than omitting it", async () => {
  // wound step: { target: null, out: "shield negates — no wound roll" }
  expect(screen.getByTestId("v2-roll-step-wound")).toHaveTextContent(/shield negates/i);
});

it("omits a term that did not fire", async () => {
  // hit step terms: [{label:"base aim",value:4}] only
  expect(screen.getByTestId("v2-roll-step-hit")).not.toHaveTextContent(/cover/i);
});
```

Read the existing `RollConsole.test.tsx` first and follow its render/act patterns — it drives the imperative `playResolution` handle.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run client/src/v2/overlays/RollConsole.test.tsx`

- [ ] **Step 3: Implement**

Replace the `breakdown ? (...)` block. Delete the `v2-rx-tier` and `v2-rx-total` render paths and their CSS in `overlay.css` — nothing emits those fields.

Each step renders: an eyebrow label (`HIT` / `WOUND` / `LOCATION` / `DAMAGE`), the target number as `N+` when present, its dice, its `out` string, and its terms as chips. Keep the existing `v2-` class convention and the `--rivet`/eyebrow visual language.

`verdictLabel`'s tone→word map (`CRIT!`/`HIT!`/`FAILED!`) is to-hit vocabulary being reused for every die. Each step should name its own outcome — the wound step's dice are not "hits".

- [ ] **Step 4: Verify**

Run: `npx vitest run client/src/v2/overlays/RollConsole.test.tsx`
Then the whole client suite: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/overlays/RollConsole.tsx client/src/v2/overlays/RollConsole.test.tsx client/src/v2/styles/overlay.css
git commit -m "feat(v2): the roll console renders the full resolution ledger"
```

---

## Task 6: Manual-dice mode prompts for wound dice

**Files:**
- Modify: `client/src/v2/overlays/AttackWizard.tsx` (~lines 396-431)
- Test: `client/src/v2/overlays/AttackWizard.test.tsx`

`game.autoResolve === false` is physical-dice mode. It builds `promptDice` specs from ROF and asks for **hit dice and a location d12 only** — then passes `impacts: toHit.map(() => undefined)` and lets the server roll the impacts unseen. **A physical-dice player has never rolled the die that decides their damage.** That is the same invisibility that produced the original bug report, in the one mode where it is most insulting.

- [ ] **Step 1: Write the failing test**

```tsx
it("prompts for a wound die per landed hit in manual-dice mode", async () => {
  // game.autoResolve === false, weapon with ROF 3
  // ...open the wizard, fire...
  const specs = promptDiceSpy.mock.calls[0][0];
  expect(specs.filter((s) => s.sides === 10)).toHaveLength(3);
  expect(specs.filter((s) => s.sides === 6)).toHaveLength(3);   // hit dice
  expect(specs.filter((s) => s.sides === 12)).toHaveLength(1);  // location
});

it("sends the entered wound dice, not undefined", async () => {
  // ...enter dice...
  expect(sendAction).toHaveBeenCalledWith(expect.objectContaining({
    dice: expect.objectContaining({ wounds: [10, 1, 5] }),
  }));
});
```

Read the existing `AttackWizard.test.tsx` first for its setup patterns.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`

- [ ] **Step 3: Implement**

Add a `w{i}` spec per potential wound (`sides: 10`) alongside the `h{i}` hit specs, and stop passing `impacts: toHit.map(() => undefined)` — send `wounds`.

**Design question you must resolve, and tell me your call:** the player rolls to-hit and wound dice in one prompt, but *how many* wounds are needed depends on how many hits landed — which isn't known until the hit dice are entered. Options: (a) prompt for ROF wound dice up-front and let the engine consume only the ones it needs; (b) two-stage prompt. (a) is simpler and matches how the existing prompt already asks for all ROF hit dice regardless. Prefer (a) unless you find a reason it breaks — and if you take (a), make sure the engine ignores the surplus rather than misindexing them.

- [ ] **Step 4: Verify**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/overlays/AttackWizard.tsx client/src/v2/overlays/AttackWizard.test.tsx
git commit -m "feat(v2): manual-dice mode prompts for the wound roll"
```

---

## Task 7: The glossary lies

**Files:**
- Modify: `shared/glossary.js` (`impact-roll`, ~line 77)
- Test: `shared/glossary.test.js`

The in-game glossary still teaches the deleted model:

> **Impact Roll** — "D6 + STR (plus arc bonus for ranged attacks), compared against the target location's Impact Table to find damage severity (§2, §7)."

Every clause is now false: it's a d10 not a D6, melee gets an arc bonus too, there is no Impact Table, and there is no severity.

- [ ] **Step 1: Write the failing test**

```js
test("the glossary teaches the wound roll, not the deleted impact table", () => {
  const entry = GLOSSARY.find((g) => g.id === "wound-roll");
  assert.ok(entry, "wound-roll entry must exist");
  assert.match(entry.def, /d10/i);
  assert.ok(!GLOSSARY.some((g) => g.id === "impact-roll"), "impact-roll must be gone");
  // No entry anywhere may still teach the deleted vocabulary.
  for (const g of GLOSSARY) {
    assert.ok(!/impact table|severity tier/i.test(g.def), `stale: ${g.id}`);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/glossary.test.js`

- [ ] **Step 3: Implement**

Replace the entry. Read the neighbours first and match their register (they cite §-sections and stay one or two sentences):

```js
  {
    id: "wound-roll", term: "Wound Roll", match: ["Wound Roll", "Wound Rolls"],
    def: "One D10 per landed hit, needing 6 + the location's Toughness − your effective STR (§7.5). Each wound deals the weapon's Damage. A natural 10 always wounds, so no target is ever immune.",
  },
```

Grep the whole repo for other prose teaching the dead model, and fix what is player-facing:
```
grep -rn "Impact Roll\|Impact Table\|severity" shared/ client/src rules.md --include=*.js --include=*.ts --include=*.tsx --include=*.md | grep -v node_modules
```
`rules.md` is the player-facing rulebook — if it teaches the impact table, that is in scope. Historical files under `docs/superpowers/` are archival; leave them.

Check `match:` — if any UI links the phrase "Impact Roll", those call sites need the new term.

- [ ] **Step 4: Verify**

Run: `node --test "shared/**/*.test.js"`

- [ ] **Step 5: Commit**

```bash
git add shared/glossary.js shared/glossary.test.js
git commit -m "docs(combat): the glossary teaches the wound roll"
```

---

## Task 8: Verification

- [ ] **Step 1: Everything green**

Run: `npm test`
Expected: 0 failures, no skips.

- [ ] **Step 2: No stale references**

```
grep -rn "impactSeverity\|impactRow\|RIG_IMPACT\|breakdown.tier\|breakdown.total\|Impact Table" shared/ server/ client/src --include=*.js --include=*.ts --include=*.tsx | grep -v node_modules
```
Expected: only `client/src/components/` (retired v1, unreachable from `main.tsx`).

- [ ] **Step 3: Drive the app — this is the actual acceptance test**

Use the `verify` skill, or start the dev server via the Browser pane's `preview_start` (**never** `npm run dev` in a shell).

**Reproduce the original bug report:** commission a **light** Rig with a **Circular Saw**, attack a **medium** Rig's **hull**, and open the dice panel.

It must now show: the hit dice and what they needed; a **wound die** with `STR 4 vs T5 → 7+`; the location; and the damage. The player must be able to read *why* the outcome was what it was — that is the entire point of this plan, and a green test suite does not prove it.

Take a screenshot at ~390px width. If it doesn't fit, or the OK button is pushed off-screen, the task is not done.

- [ ] **Step 4: Commit any fixes, then report**

---

## Notes

**Retired v1.** `client/src/components/overlays/RollConsole.tsx` still renders `breakdown.tier`/`.total` and will render nothing once those fields die. It is unreachable from `main.tsx` (V2 is the only frontend), so this plan leaves it. Deleting the v1 tree is a separate cleanup worth doing.

**`client/shared.d.ts` is a hand-maintained mirror** of the JS modules in `shared/`, with no compile-time link to them. It described `impactRow`, `armour` and `ramStr` long after all three were deleted, and carries wrong `sprintMult` types right now from an unrelated feature. It will drift again. Pointing TS at `shared/` via `allowJs` + `paths` would turn every future rename into a compile error instead of a silent lie — worth its own task.
