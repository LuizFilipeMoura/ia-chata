# Aimed Attack (melee-capable) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Aimed action pick a hit location with a **melee** weapon too, and rename "Aimed Shot" → "Aimed Attack" everywhere on the live surfaces.

**Architecture:** The resolution engine (`shared/combat.js`) already routes the location pick off `opts.aimed` with no ranged guard, so the engine core is untouched. The change is (a) removing two "ranged-only" gates — one in the action-console view-model (`shared/battle-view.js`), one in the v2 attack wizard (`AttackWizard.tsx`) — and (b) a cosmetic rename across `rules.js`, `combat.js`'s ledger term, the glossary, the v2 wizard labels, and `rules.md`.

**Tech Stack:** Node ESM (`shared/*.js`, tests via `node --test`), React + Vitest (`client/src/v2/**`).

> ⚠ **Concurrent committer on this branch.** Another session commits with broad `git add`. **Never `git add -A`/`git add .`** — stage only the exact paths each step names. Line numbers below drift; **grep for the quoted anchor string** to find the current line before editing.

---

## Spec

`docs/superpowers/specs/2026-07-19-aimed-melee-design.md`

## File map

- `shared/rules.js` — `ACTIONS.aimed.label` string.
- `shared/combat.js` — the aim-breakdown **ledger term** label (`"aimed shot"` → `"aimed attack"`). No logic change.
- `shared/glossary.js` — the `aimed-shot` glossary entry (term + match + def).
- `shared/battle-view.js` — un-gate `aimed` when a live melee weapon exists.
- `client/src/v2/overlays/AttackWizard.tsx` — show the aim toggle for melee; drop the force-off effect; rename visible labels + the location tooltip.
- `rules.md` — §5 action entry, §5 Exploit Opening prose, §6 heat table row, §13 Precision prose.
- Tests: `shared/battle-view.test.js`, `shared/combat.test.js`, `client/src/v2/overlays/AttackWizard.test.tsx`.

**Out of scope (legacy):** `client/src/components/wizards/AttackWizard.tsx` (v1) is superseded by the v2 overlay on the active `frontend/v2-redesign` branch. Leave it alone. To keep the glossary from silently un-highlighting any lingering v1 "Aimed Shot" text, Task 2 keeps **both** strings in the glossary `match` array.

## Test commands

- Shared: `node --test shared/battle-view.test.js shared/combat.test.js`
- Full shared suite: `node --test shared/`
- Client: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`

> **No value-pinning** (project rule): assert enablement booleans, routed location strings, action names, and label text — never ACC/damage/SP numbers.

---

### Task 1: Rename the action label + ledger term (data layer)

**Files:**
- Modify: `shared/rules.js` (anchor: `aimed:    { label: "Aimed Shot"`)
- Modify: `shared/combat.js` (anchor: `label: "aimed shot", value: aimedPenalty`)
- Test: `shared/combat.test.js` (anchor: `t.label === "aimed shot"`)

- [ ] **Step 1: Update the failing ledger-term test**

In `shared/combat.test.js`, find the test `aimBreakdown — aimed shot, wrecked hull and ballistic processor each name themselves` (anchor `t.label === "aimed shot"`). Change that assertion to the new label:

```js
  assert.ok(aimed.terms.some((t) => t.label === "aimed attack" && t.value === -2));
```

- [ ] **Step 2: Run it — verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — the term is still emitted as `"aimed shot"`.

- [ ] **Step 3: Rename the ledger term in the engine**

In `shared/combat.js`, find `terms.push({ label: "aimed shot", value: aimedPenalty });` and change the string:

```js
  if (aimedPenalty) terms.push({ label: "aimed attack", value: aimedPenalty });
```

- [ ] **Step 4: Rename the action label**

In `shared/rules.js`, change the `aimed` entry's label (keep heat/slot):

```js
  aimed:    { label: "Aimed Attack", heat: 1, slot: 1 },
```

- [ ] **Step 5: Run — verify green**

Run: `node --test shared/combat.test.js shared/rules.test.js`
Expected: PASS. (`rules.test.js` only pins `ACTIONS.aimed.heat`, so the label rename doesn't touch it.)

- [ ] **Step 6: Commit**

```bash
git add shared/rules.js shared/combat.js shared/combat.test.js
git commit -m "refactor(rules): rename Aimed Shot action + ledger term to Aimed Attack"
```

---

### Task 2: Rename the glossary entry (keep both match strings)

**Files:**
- Modify: `shared/glossary.js` (anchor: `id: "aimed-shot"`)

- [ ] **Step 1: Rewrite the glossary entry**

In `shared/glossary.js`, find the entry with `id: "aimed-shot"` and replace the three fields. Keep the `id` (stable anchor) and keep `"Aimed Shot"` in `match` so any lingering legacy text still highlights:

```js
  {
    id: "aimed-shot", term: "Aimed Attack", match: ["Aimed Attack", "Aimed Shot"],
    def: "A Fire Weapon action, usable with any weapon, where you choose the hit location instead of rolling for it, at −2 Accuracy (Precision removes the penalty) (§5, §13).",
  },
```

- [ ] **Step 2: Run the shared suite — verify nothing broke**

Run: `node --test shared/`
Expected: PASS. (No test pins the glossary term string; if one does, update it to `"Aimed Attack"`.)

- [ ] **Step 3: Commit**

```bash
git add shared/glossary.js
git commit -m "docs(glossary): rename Aimed Shot entry to Aimed Attack (keep legacy match)"
```

---

### Task 3: Un-gate Aimed in the action-console view-model

**Files:**
- Modify: `shared/battle-view.js` (anchor: `if (key === "aimed") enabled = false;`)
- Test: `shared/battle-view.test.js` (anchors: `a spent ranged weapon keeps Fire live and disables Aimed`, `Flat-pick fired`)

- [ ] **Step 1: Update the two enablement tests**

In `shared/battle-view.test.js`, find the test `a spent ranged weapon keeps Fire live and disables Aimed`. It currently asserts Aimed is disabled with a spent ranged weapon; the rig fixture has a live melee `"Sword"`. Rename the test and flip that assertion, then add a no-melee case:

```js
test("a spent ranged weapon keeps Fire live; Aimed follows the live melee", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const ready = availableActions(rig(), turn).find((a) => a.key === "fire");
  assert.equal(ready.cost, 1);
  assert.equal(ready.enabled, true);
  // Ranged spent, but a live melee weapon remains — Aimed stays live to aim a swing.
  const acts = availableActions(rig({ loaded: { longRange: false, melee: true } }), turn);
  assert.equal(acts.find((a) => a.key === "fire").enabled, true);      // opens the reload/melee drawer
  assert.equal(acts.find((a) => a.key === "aimed").enabled, true);     // aim the melee weapon
  assert.ok(!acts.some((a) => a.key === "reload"));                    // reload is a drawer-only path now
  // Ranged spent AND no live melee — nothing to aim, so Aimed shuts (Fire still opens the drawer).
  const noMelee = availableActions(
    rig({ weapons: { longRange: "Autocannon", melee: null }, loaded: { longRange: false, melee: true } }),
    turn,
  );
  assert.equal(noMelee.find((a) => a.key === "fire").enabled, true);
  assert.equal(noMelee.find((a) => a.key === "aimed").enabled, false);
});
```

In the same file, find the test `Flat-pick fired: Fire stays live (drawer reload) and reload is not a tile`. A flat-pick tank has no melee slot, so its Aimed stays disabled — assertion unchanged, only the stale comment updates:

```js
  assert.equal(actions.find((a) => a.key === "aimed").enabled, false); // no melee to aim + ranged spent
```

- [ ] **Step 2: Run — verify the renamed test fails**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — Aimed is still hard-disabled whenever the ranged weapon is spent, so the `enabled === true` assertion fails.

- [ ] **Step 3: Un-gate Aimed in the view-model**

In `shared/battle-view.js`, inside `availableActions`, locate the block that currently reads (anchor `if (key === "aimed") enabled = false;`):

```js
      if (key === "fire" || key === "aimed") {
        if (rangedSpent) {
          // Ranged is spent. Fire still opens the drawer (which offers Reload,
          // plus a melee strike if one is live); Aimed is ranged-only, so shut it.
          if (key === "aimed") enabled = false;
        } else if (firedRanged) {
```

Replace the inner `if (key === "aimed") enabled = false;` so Aimed only shuts when there is no live melee weapon to aim. Add a `meleeLive` computation near the top of the function (next to the existing `rangedSpent` line):

```js
  // A melee weapon can be aimed even after the ranged weapon is spent. It counts
  // as "live" only if the rig actually has a melee slot that isn't destroyed.
  const meleeName = rig.weapons?.melee;
  const meleeLive = !!meleeName && !(rig.weaponsDestroyed || []).includes(meleeName);
```

and change the branch to:

```js
      if (key === "fire" || key === "aimed") {
        if (rangedSpent) {
          // Ranged is spent. Fire still opens the drawer (Reload + a melee strike
          // if one is live). Aimed stays live only while a melee weapon can aim.
          if (key === "aimed" && !meleeLive) enabled = false;
        } else if (firedRanged) {
```

- [ ] **Step 4: Run — verify green**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "feat(battle-view): keep Aimed live for a melee weapon after the ranged shot is spent"
```

---

### Task 4: Lock in engine location-routing for an aimed melee attack

The engine already routes an aimed hit to the chosen location regardless of weapon slot. This task adds a **guard test** proving the melee path routes correctly (it should pass on first run — no engine change). It protects the feature the UI now exposes.

**Files:**
- Test: `shared/combat.test.js` (model on the existing `Kneecapper — hull and engine are never valid targets, aimed or not` test; helper `makeCtx()` is at the top of the file)

- [ ] **Step 1: Add the aimed-melee routing test**

Append to `shared/combat.test.js`:

```js
test("an aimed MELEE attack routes the hit to the chosen location", () => {
  const attacker = makeRig(1, "M", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  // toHit 6 lands; no location die is consumed because the player named the part.
  const res = resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", range: "near", aimed: true, aimedLoc: "legs",
      dice: { toHit: [6], wounds: [10] } }, () => 0, makeCtx());
  assert.equal(res.location, "legs");
});
```

- [ ] **Step 2: Run — verify it passes (guard, not red)**

Run: `node --test shared/combat.test.js`
Expected: PASS immediately. If it FAILS, stop — the engine has a melee-aim guard the spec assumed absent; re-check `shared/combat.js` around `location = opts.aimed ? opts.aimedLoc : hitLocation(...)` before proceeding.

- [ ] **Step 3: Commit**

```bash
git add shared/combat.test.js
git commit -m "test(combat): guard that an aimed melee attack routes to the chosen location"
```

---

### Task 5: Show the aim toggle for melee in the v2 wizard + rename labels

**Files:**
- Modify: `client/src/v2/overlays/AttackWizard.tsx`
- Test: `client/src/v2/overlays/AttackWizard.test.tsx`

Anchors in `AttackWizard.tsx` (grep each — lines drift):
- Render guard: `{!react && !isMelee && (` (the aim toggle button)
- Force-off effect: `if (isMelee && aimed) setAimed(false);`
- Visible label span: `<span className="v2-aw-aim-label">Aimed Shot</span>`
- Mode label: `const modeLabel = aimed ? "Aimed Shot" : "Fire";`
- Card title: `const title = aimed ? "◎ Aimed Shot"`
- Location tooltip: `location: "Component to hit — an Aimed Shot takes −2 Accuracy"`

- [ ] **Step 1: Update the two UI tests + add the melee-aim test**

In `client/src/v2/overlays/AttackWizard.test.tsx`, rename the switch/button queries in the existing test `Aimed Shot toggle reveals the location field and fires an aimed action` from `/Aimed Shot/i` to `/Aimed Attack/i`, and rename the test title. Then add a new test that opens the wizard on the melee weapon (a spent ranged weapon makes the wizard open on melee) and confirms Aimed now works there:

```js
test("Aimed Attack toggle reveals the location field and fires an aimed action", async () => {
  sent.mockClear();
  const rigs = [mk(1, "a"), mk(2, "b")];
  render(
    <AppProviders>
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
        <Seed rigs={rigs}>
          <AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />
        </Seed>
      </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </AppProviders>,
  );
  const aim = await screen.findByRole("switch", { name: /Aimed Attack/i });
  expect(aim).toHaveAttribute("aria-checked", "false");
  expect(screen.queryByText(/Component to hit/i)).not.toBeInTheDocument();
  fireEvent.click(aim);
  expect(await screen.findByText(/Component to hit/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Aimed Attack/i }));
  expect(sent).toHaveBeenCalledWith("action", expect.objectContaining({ action: "aimed", loc: expect.any(String) }));
});

test("Aimed Attack is available with a melee weapon (ranged spent, opens on melee)", async () => {
  sent.mockClear();
  // A spent ranged weapon makes the wizard open on the melee weapon slot.
  const rigs = [mk(1, "a", { loaded: { longRange: false, melee: true } }), mk(2, "b")];
  render(
    <AppProviders>
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
        <Seed rigs={rigs}>
          <AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />
        </Seed>
      </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </AppProviders>,
  );
  // The aim toggle now appears for a melee weapon (previously hidden by !isMelee).
  const aim = await screen.findByRole("switch", { name: /Aimed Attack/i });
  fireEvent.click(aim);
  expect(await screen.findByText(/Component to hit/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Aimed Attack/i }));
  expect(sent).toHaveBeenCalledWith("action", expect.objectContaining({
    action: "aimed", weapon: "Claw", loc: expect.any(String),
  }));
});
```

- [ ] **Step 2: Run — verify failures**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`
Expected: FAIL — the toggle renders "Aimed Shot" (name mismatch) and is hidden entirely for the melee-weapon case.

- [ ] **Step 3: Show the toggle for melee**

In `AttackWizard.tsx`, change the render guard so the aim toggle is not hidden for melee weapons:

```jsx
          {!react && (
```

(Remove the `&& !isMelee` from `{!react && !isMelee && (`.)

- [ ] **Step 4: Drop the force-off effect**

Find the effect body containing `if (isMelee && aimed) setAimed(false);` and delete that one line (keep the sibling `if (isMelee && state.range === "out") patch({ range: "near" });`). Update the adjacent comment `// Aimed Shot is ranged-only — a melee weapon forces the shot back to Fire.` — remove it.

- [ ] **Step 5: Rename the visible strings**

Make these four replacements (grep each anchor):

```jsx
<span className="v2-aw-aim-label">Aimed Attack</span>
```
```jsx
  const modeLabel = aimed ? "Aimed Attack" : "Fire";
```
```jsx
  const title = aimed ? "◎ Aimed Attack" : "🎯 Fire Weapon";
```
```jsx
  location: "Component to hit — an Aimed Attack takes −2 Accuracy",
```

- [ ] **Step 6: Run — verify green**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/v2/overlays/AttackWizard.tsx client/src/v2/overlays/AttackWizard.test.tsx
git commit -m "feat(v2-wizard): offer Aimed Attack for melee weapons; rename Aimed Shot label"
```

---

### Task 6: Rename in the rulebook prose

**Files:**
- Modify: `rules.md`

- [ ] **Step 1: §5 action entry**

Find (anchor `**Aimed Shot [1]**`) and reword so it no longer says "Shot" and covers any weapon:

```markdown
- **Aimed Attack [1]** — a Fire Weapon action, usable with **any** weapon (ranged or melee), where you **choose the hit location** instead of rolling for it, at **−2 ACC**.
```

- [ ] **Step 2: §5 Exploit Opening counter prose**

Find `free **Aimed** counter-shot` and change `counter-shot` → `counter-attack`.

- [ ] **Step 3: §6 heat table row**

Find the table row `| Aimed Shot / Prepare | 1 |` and rename the cell to `| Aimed Attack / Prepare | 1 |`.

- [ ] **Step 4: §13 Precision perk prose**

Find `may make an Aimed Shot **without**` and change `Aimed Shot` → `Aimed Attack`.

- [ ] **Step 5: Verify no stray "Aimed Shot" remains in rules.md**

Run: `git --no-pager grep -n "Aimed Shot" -- rules.md`
Expected: no output (every occurrence renamed).

- [ ] **Step 6: Commit**

```bash
git add rules.md
git commit -m "docs(rules): rename Aimed Shot to Aimed Attack; state it works with any weapon"
```

---

### Task 7: Full-suite verification

- [ ] **Step 1: Run the shared suite**

Run: `node --test shared/`
Expected: PASS.

- [ ] **Step 2: Run the v2 wizard + battle-view client tests**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`
Expected: PASS.

- [ ] **Step 3: Sweep for stray live-surface references**

Run: `git --no-pager grep -n "Aimed Shot" -- shared/ client/src/v2/ rules.md`
Expected: no output. (Legacy `client/src/components/wizards/` may still contain it — out of scope; the glossary `match` array keeps highlighting it.)

- [ ] **Step 4: Manual smoke (optional but recommended)**

Launch the app, open a battle where a Rig with a melee weapon has spent its ranged shot, open its Fire drawer, toggle **Aimed Attack**, pick a location, confirm the swing routes to that part. See `/run` or the digital-room entry point.

---

## Self-review notes

- **Spec coverage:** rename (rules.js ✔ Task 1, combat.js term ✔ Task 1, glossary ✔ Task 2, rules.md ✔ Task 6, v2 labels ✔ Task 5); enablement (battle-view ✔ Task 3, wizard toggle+force-off ✔ Task 5); engine-safe routing (✔ Task 4 guard); interaction audit (Brace/Riposte/Enfilade/Precision) needs no code — covered by the engine leaving those paths untouched.
- **Type consistency:** `meleeLive`/`meleeName` introduced and used only in Task 3. Wizard uses the existing `isMelee`/`aimed`/`setAimed` symbols. Action key stays `aimed`; the payload `action: "aimed"` is unchanged (Task 5 tests assert it).
- **No value-pinning:** every assertion is a boolean, a routed location string, an action name, or label text.
