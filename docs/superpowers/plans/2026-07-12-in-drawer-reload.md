# In-Drawer Reload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Fire drawer's dead "Reload first" button into a live Reload that re-arms the ranged weapon in place, and rebalance reload to cost heat (a d6 roll) instead of an action.

**Architecture:** Reload becomes a dedicated server branch that bypasses the action-budget gate: heat kinds pay a d6 heat roll (1-3 → +2, 4-6 → +1) for 0 actions; cold kinds keep 1 action / 0 heat. The console's standalone Reload tile is removed and the Fire tile stays live while spent, so the Fire drawer is the single reload path. The drawer disables the spent weapon in its picker and offers a Reload button that arms + auto-selects the long-range weapon.

**Tech Stack:** Node (shared game logic, `node --test`), React + TypeScript (V2 client, Vitest), plain CSS.

**Spec:** `docs/superpowers/specs/2026-07-12-in-drawer-reload-design.md`

---

## File Structure

- `shared/game-state.js` — `performAction`: new `reload` branch (free + d6 heat for heat kinds; 1 action for cold), placed before the budget gate; old reload clause removed.
- `shared/game-state.test.js` — reload cost/heat tests; fix the one existing test that asserts the old 3-action count.
- `shared/rules.js` — comment that `ACTIONS.reload` heat/slot are non-authoritative.
- `rules.md` — §7 reload rule text.
- `shared/battle-view.js` — unify spent to `loaded.longRange`; drop `reload` from `ACTION_ORDER`; keep `fire` enabled while spent, disable `aimed`; remove now-dead `meleeReady`/`reload` code.
- `shared/battle-view.test.js` — update the reload/spent/flat-pick tests to the new behavior.
- `client/src/v2/battle/ActionConsole.tsx` — remove `reload` from the Attack group keys + glyph map.
- `client/src/v2/overlays/AttackWizard.tsx` — `Field` `optDisabled`; live-rig + `justReloaded`; `rangedSpent`; reload banner + CTA adaptation; manual-dice reload; picker disabling; auto-select on reload.
- `client/src/v2/overlays/AttackWizard.test.tsx` — spent → disabled chip + Reload dispatch; no-melee → Reload CTA.
- `client/src/v2/styles/wizards.css` — disabled weapon chip + reload banner/button.

---

## Task 1: Server reload cost model

**Files:**
- Modify: `shared/game-state.js` (insert branch before `const def = ACTIONS[act];` at ~line 2063; remove old reload clause at ~line 2265)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add these tests near the existing reload test (search for `test("reload reloads all weapons`):

```js
test("reload is free for heat kinds and rolls a D6 for heat (1-3 = +2)", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.loaded.longRange = false;              // just fired
  const heat0 = b1.engine.heat;
  const used0 = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "reload", dice: { reload: 2 } } });
  assert.equal(b1.loaded.longRange, true);  // armed
  assert.equal(r.game.turn.actionsUsed, used0); // 0 actions spent
  assert.equal(b1.engine.heat - heat0, 2);  // roll 2 -> +2 heat
});

test("reload heat is +1 on a D6 of 4-6", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.loaded.longRange = false;
  const heat0 = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "reload", dice: { reload: 5 } } });
  assert.equal(b1.engine.heat - heat0, 1);  // roll 5 -> +1 heat
});

test("a heat kind can reload with no actions left (reload is free)", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.loaded.longRange = false;
  r.game.turn.actionsUsed = r.game.turn.actionsMax; // budget exhausted
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "reload", dice: { reload: 6 } } });
  assert.equal(b1.loaded.longRange, true);  // still reloads
});

test("cold kinds pay 1 action to reload and take no heat", () => {
  const room = createRoom("COLD1");
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Foe", class: "medium", owner: "b", longRange: "Autocannon", melee: "Sword" } });
  const tank = makeUnit("tank", 99, "Bulwark", "a", { unit: "Tank Cannon" });
  tank.loaded = { longRange: false, melee: true };
  room.rigs.push(tank);
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: tank.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 1 };
  const heat0 = tank.engine.heat;
  applyCommand(room, { verb: "action", attrs: { name: "Bulwark", action: "reload" } });
  assert.equal(tank.loaded.longRange, true);
  assert.equal(room.game.turn.actionsUsed, 1);   // paid an action
  assert.equal(tank.engine.heat, heat0);         // no heat charged
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-name-pattern="reload is free for heat|reload heat is \+1|can reload with no actions|cold kinds pay 1 action" shared/game-state.test.js`
Expected: FAIL — heat kinds currently spend an action (actionsUsed changes) and add only the flat `def.heat`; cold reload hits the budget-gated old path.

- [ ] **Step 3: Insert the new reload branch before the budget gate**

In `shared/game-state.js`, find (~line 2062-2063):

```js
    return true;
  }
  const def = ACTIONS[act];
  if (!def || t.actionsUsed >= t.actionsMax) return false;
```

Insert the reload branch between the closing `}` and `const def`:

```js
    return true;
  }
  // Reload (§7) — arm the ranged weapon so it can fire again. RULE: reload no
  // longer spends an action. Heat kinds pay heat instead — a d6 gamble (1-3 →
  // +2, 4-6 → +1). Heatless cold kinds (Tank / Walker) can't be charged heat, so
  // they keep the old 1-action price. Sits BEFORE the budget gate below so a free
  // heat-kind reload works even at 0 actions left.
  if (act === "reload") {
    const heatKind = !!UNIT_KINDS[kindOf(rig)].hasHeat;
    if (!heatKind && t.actionsUsed >= t.actionsMax) return false;
    rig.loaded = { longRange: true, melee: true };
    let roll = 0;
    let heat = 0;
    if (heatKind) {
      roll = rollD(6, a.dice?.reload, random);
      heat = roll <= 3 ? 2 : 1;
      bumpHeat(rig, heat);
    } else {
      t.actionsUsed += 1;
    }
    pushResolution(room, {
      kind: "reload", actor: rig.owner, rigId: rig.id,
      rolls: heatKind ? [{ sides: 6, value: roll, label: "D6" }] : [],
      summary: heatKind
        ? `${rig.name} reloads — rolled ${roll} → +${heat} heat`
        : `${rig.name} reloads (1 action).`,
      effects: [],
    });
    return true;
  }
  const def = ACTIONS[act];
  if (!def || t.actionsUsed >= t.actionsMax) return false;
```

- [ ] **Step 4: Remove the old reload clause**

Find (~line 2265):

```js
  if (act === "reload") {
    rig.loaded = { longRange: true, melee: true };
  } else if (act === "repair") {
```

Replace with (drop the reload clause so the chain starts at repair):

```js
  if (act === "repair") {
```

- [ ] **Step 5: Fix the existing second-shot test's action count**

The rule change makes the reload between two shots free. Find `test("a second ranged shot costs 1 slot but runs the barrel hot: +1 heat"` (~line 1710). Change its final assertion:

```js
  assert.equal(r.game.turn.actionsUsed, 3);                // fire + reload + fire = 3 slots
```

to:

```js
  assert.equal(r.game.turn.actionsUsed, 2);                // fire + free reload + fire = 2 slots
```

- [ ] **Step 6: Run the reload tests to verify they pass**

Run: `node --test --test-name-pattern="reload is free for heat|reload heat is \+1|can reload with no actions|cold kinds pay 1 action|second ranged shot" shared/game-state.test.js`
Expected: PASS (5 tests).

- [ ] **Step 7: Run the full game-state suite for regressions**

Run: `node --test shared/game-state.test.js`
Expected: PASS — no failures.

- [ ] **Step 8: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(reload): free action + d6 heat cost; cold kinds keep 1 action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Rules documentation

**Files:**
- Modify: `shared/rules.js` (~line 15)
- Modify: `rules.md` (§7 reload)

- [ ] **Step 1: Annotate the ACTIONS.reload entry**

In `shared/rules.js`, find:

```js
  reload:   { label: "Reload",      heat: 1, slot: 1 },
```

Replace with:

```js
  // heat/slot below are NON-authoritative for reload: performAction owns the cost
  // (heat kinds pay a d6 heat roll for 0 actions; cold kinds pay 1 action).
  reload:   { label: "Reload",      heat: 1, slot: 1 },
```

- [ ] **Step 2: Update rules.md §7**

Open `rules.md`, locate the §7 reload rule (search for `reload`). Replace the reload cost description with:

```markdown
Reloading a spent ranged weapon no longer costs an action. Instead a Rig rolls
a d6 for heat when it reloads: **1-3 → +2 heat, 4-6 → +1 heat**. Cold units
(Tank / Walker) have no heat track, so they reload for **1 action** instead. A
reloaded shot is still the activation's second ranged shot, so it also runs
**+1 heat** hot.
```

(If §7's exact wording differs, preserve surrounding prose and swap only the cost sentence.)

- [ ] **Step 3: Commit**

```bash
git add shared/rules.js rules.md
git commit -m "docs(rules): reload is a free heat-gamble action (cold kinds 1 action)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: battle-view — single reload path

**Files:**
- Modify: `shared/battle-view.js` (lines ~7, ~14-22, ~40-55)
- Test: `shared/battle-view.test.js`

- [ ] **Step 1: Update the failing tests first**

In `shared/battle-view.test.js`:

Remove the reload assertion from the "capped" test (search for `capped.find((a) => a.key === "reload")`):

```js
  assert.equal(capped.find((a) => a.key === "reload").enabled, false);
```

Delete that single line.

Delete the whole test `test("reload is disabled until a ranged weapon has actually been fired", ...)` (reload is no longer in the action list).

Replace `test("a spent ranged weapon keeps Fire live for melee but disables Aimed", ...)` with:

```js
test("a spent ranged weapon keeps Fire live and disables Aimed", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const ready = availableActions(rig(), turn).find((a) => a.key === "fire");
  assert.equal(ready.cost, 1);
  assert.equal(ready.enabled, true);
  const acts = availableActions(rig({ loaded: { longRange: false, melee: true } }), turn);
  const fire = acts.find((a) => a.key === "fire");
  assert.equal(fire.enabled, true);      // opens the reload drawer (melee strike too)
  const aimed = acts.find((a) => a.key === "aimed");
  assert.equal(aimed.enabled, false);    // Aimed is a ranged-only shot
  assert.ok(!acts.some((a) => a.key === "reload")); // reload is a drawer-only path now
  // Even with no melee, Fire stays live so the drawer (and its Reload) is reachable.
  const noMelee = availableActions(
    rig({ weapons: { longRange: "Autocannon", melee: null }, loaded: { longRange: false, melee: true } }),
    turn,
  ).find((a) => a.key === "fire");
  assert.equal(noMelee.enabled, true);
});
```

Replace `test("Flat-pick fired: 'reload' enabled, 'fire' disabled", ...)` with:

```js
test("Flat-pick fired: Fire stays live (drawer reload) and reload is not a tile", () => {
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  tank.loaded = { longRange: false }; // just fired — spent signal is loaded.longRange
  const actions = availableActions(tank, { actionsMax: 2, actionsUsed: 1, longRangeShots: 1 });
  const fire = actions.find((a) => a.key === "fire");
  assert.equal(fire.enabled, true);                  // opens the reload drawer
  assert.ok(!actions.some((a) => a.key === "reload")); // no standalone reload tile
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — production still lists `reload`, still gates flat-pick spent on `loaded.unit`, and still disables `fire` when spent with no melee.

- [ ] **Step 3: Drop `reload` from ACTION_ORDER**

In `shared/battle-view.js` (~line 7):

```js
const ACTION_ORDER = ["move", "sprint", "disengage", "fire", "aimed", "reload", "repair", "douse", "prepare", "shutdown"];
```

Replace with:

```js
const ACTION_ORDER = ["move", "sprint", "disengage", "fire", "aimed", "repair", "douse", "prepare", "shutdown"];
```

- [ ] **Step 4: Unify the spent signal and drop `meleeReady`**

Find (~line 14-22):

```js
  // Rig uses two slots (longRange + melee); flat-pick uses one "unit" slot.
  const rangedSpent = cfg.weaponMode === "flat-pick"
    ? rig.loaded?.unit === false
    : rig.loaded?.longRange === false;
  // Melee never reloads, so a spent ranged weapon still leaves a melee strike on
  // the table — Fire stays live (flat-pick kinds carry no separate melee slot).
  const meleeReady = cfg.weaponMode !== "flat-pick"
    && !!rig.weapons?.melee
    && !(rig.weaponsDestroyed || []).includes(rig.weapons.melee);
```

Replace with:

```js
  // Spent is one universal flag: firing any ranged weapon (Rig longRange OR a
  // cold-kind "unit" weapon, which resolves under the longRange slot) clears
  // loaded.longRange, and reload re-sets it. Reload is now a drawer-only path,
  // so a spent-but-reloadable weapon keeps Fire live (Fire opens that drawer).
  const rangedSpent = rig.loaded?.longRange === false;
```

- [ ] **Step 5: Remove the dead reload-enable block**

Find (~line 40-42):

```js
      if (key === "reload") {
        enabled = left > 0 && rangedSpent;
      }
```

Delete those three lines.

- [ ] **Step 6: Keep Fire live while spent, disable Aimed**

Find (~line 47-55):

```js
      if (key === "fire" || key === "aimed") {
        if (rangedSpent) {
          // Fire falls back to the melee weapon; Aimed stays a ranged-only shot.
          if (!(key === "fire" && meleeReady)) enabled = false;
        } else if (firedRanged) {
          heat = def.heat + 1;
          note = "Second shot — +1 heat"; // surcharge rule, not obvious from the total
        }
      }
```

Replace with:

```js
      if (key === "fire" || key === "aimed") {
        if (rangedSpent) {
          // Ranged is spent. Fire still opens the drawer (which offers Reload,
          // plus a melee strike if one is live); Aimed is ranged-only, so shut it.
          if (key === "aimed") enabled = false;
        } else if (firedRanged) {
          heat = def.heat + 1;
          note = "Second shot — +1 heat"; // surcharge rule, not obvious from the total
        }
      }
```

- [ ] **Step 7: Run the battle-view suite to verify it passes**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "feat(battle-view): unify spent signal; reload is drawer-only; Fire stays live when spent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Remove the console Reload tile

**Files:**
- Modify: `client/src/v2/battle/ActionConsole.tsx` (lines ~37, ~45)

- [ ] **Step 1: Drop reload from the Attack group keys**

Find (~line 37):

```js
  { id: "attack", label: "Attack", tone: "ember", glyph: "▶", keys: ["fire", "aimed", "reload"] },
```

Replace with:

```js
  { id: "attack", label: "Attack", tone: "ember", glyph: "▶", keys: ["fire", "aimed"] },
```

- [ ] **Step 2: Drop the reload glyph**

Find (~line 45):

```js
  move: "⇢", sprint: "⇉", disengage: "⇲", reload: "⟳", fire: "▶", aimed: "◎",
```

Replace with:

```js
  move: "⇢", sprint: "⇉", disengage: "⇲", fire: "▶", aimed: "◎",
```

- [ ] **Step 3: Run the ActionConsole test for regressions**

Run: `npx vitest run client/src/v2/battle/ActionConsole.test.tsx`
Expected: PASS (the suite makes no reload-tile assertions).

- [ ] **Step 4: Commit**

```bash
git add client/src/v2/battle/ActionConsole.tsx
git commit -m "feat(v2): remove standalone Reload tile from the Attack group

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Field gains a per-option disabled predicate

**Files:**
- Modify: `client/src/v2/overlays/AttackWizard.tsx` (the `Field` component, lines ~41-88)
- Modify: `client/src/v2/styles/wizards.css`

- [ ] **Step 1: Add `optDisabled` to the Field props and render**

In `AttackWizard.tsx`, update the `Field` signature. Find:

```jsx
function Field({
  label, options, selected, onChange, icon, optIcon, desc, optDesc, hidden,
}: {
  label: string;
  options: string[];
  selected: string;
  onChange: (v: string) => void;
  icon?: string;
  optIcon?: IconMap;
  desc?: string;
  optDesc?: IconMap;
  hidden?: boolean;
}) {
```

Replace with:

```jsx
function Field({
  label, options, selected, onChange, icon, optIcon, desc, optDesc, hidden, optDisabled,
}: {
  label: string;
  options: string[];
  selected: string;
  onChange: (v: string) => void;
  icon?: string;
  optIcon?: IconMap;
  desc?: string;
  optDesc?: IconMap;
  hidden?: boolean;
  optDisabled?: (opt: string) => boolean;
}) {
```

- [ ] **Step 2: Render disabled options**

In the same component, find the option button:

```jsx
          return (
            <button
              key={opt}
              type="button"
              className={"v2-aw-opt v2-opt" + (opt === selected ? " is-sel" : "")}
              onClick={() => onChange(opt)}
            >
```

Replace with:

```jsx
          const isDisabled = optDisabled?.(opt) ?? false;
          return (
            <button
              key={opt}
              type="button"
              disabled={isDisabled}
              className={"v2-aw-opt v2-opt" + (opt === selected ? " is-sel" : "") + (isDisabled ? " is-disabled" : "")}
              onClick={() => { if (!isDisabled) onChange(opt); }}
            >
```

- [ ] **Step 3: Style the disabled chip**

In `client/src/v2/styles/wizards.css`, append:

```css
/* A spent weapon can't be picked until it's reloaded — read it as inert iron. */
.v2-aw-opt.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(0.7);
}
.v2-aw-opt.is-disabled .v2-aw-opt-desc { color: var(--v2-ember, #c8552b); }
```

- [ ] **Step 4: Verify the wizard still renders**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`
Expected: PASS (existing test unaffected — `optDisabled` is optional).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/overlays/AttackWizard.tsx client/src/v2/styles/wizards.css
git commit -m "feat(v2): Field supports a per-option disabled predicate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Drawer reload flow

**Files:**
- Modify: `client/src/v2/overlays/AttackWizard.tsx` (component body + render block + CTA + Weapon field)
- Test: `client/src/v2/overlays/AttackWizard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the top of `client/src/v2/overlays/AttackWizard.test.tsx` (the mock line and `mk`) so commands are capturable and audio is stubbed. Change:

```js
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

const mk = (id: number, owner: "a" | "b"): Rig => ({ id, name: owner === "a" ? "MINE" : "FOE", owner, weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false }, legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 }, weapons: { longRange: "Autocannon", melee: "Claw" },
  weaponUpgrades: { longRange: "field", melee: "field" }, equipment: "ablative-plating", activated: false, destroyed: false, loaded: { longRange: true, melee: true } } as unknown as Rig);
```

to:

```js
const { sent } = vi.hoisted(() => ({ sent: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sent }));
vi.mock("../audio/actionAudio", () => ({ playAction: vi.fn() }));

const mk = (id: number, owner: "a" | "b", over: Partial<Rig> = {}): Rig => ({ id, name: owner === "a" ? "MINE" : "FOE", owner, weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false }, legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 }, weapons: { longRange: "Autocannon", melee: "Claw" },
  weaponUpgrades: { longRange: "field", melee: "field" }, equipment: "ablative-plating", activated: false, destroyed: false, loaded: { longRange: true, melee: true }, ...over } as unknown as Rig);
```

Add these tests at the end of the file:

```js
test("spent long-range weapon is disabled and a Reload button appears", async () => {
  sent.mockClear();
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
  expect(await screen.findByRole("button", { name: /Autocannon/i })).toBeDisabled();
  const reload = await screen.findByRole("button", { name: /Reload/i });
  reload.click();
  expect(sent).toHaveBeenCalledWith("action", expect.objectContaining({ action: "reload" }));
});

test("spent with no melee makes the primary CTA a Reload", async () => {
  sent.mockClear();
  const rigs = [mk(1, "a", { weapons: { longRange: "Autocannon" }, loaded: { longRange: false, melee: true } }), mk(2, "b")];
  render(
    <AppProviders>
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
        <Seed rigs={rigs}>
          <AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />
        </Seed>
      </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </AppProviders>,
  );
  const go = await screen.findByRole("button", { name: /Reload/i });
  go.click();
  expect(sent).toHaveBeenCalledWith("action", expect.objectContaining({ action: "reload" }));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`
Expected: FAIL — no disabled Autocannon button and no Reload button yet (the drawer opens on melee, CTA reads "Fire").

- [ ] **Step 3: Add live-rig, justReloaded, heatKind, rangedSpent**

In `AttackWizard.tsx`, find the top of the component:

```jsx
  const { rigs, game } = useRoomState();
  const sendCommand = useV2Commands();
  const { sendReact } = useV2BattleActions();
  const { promptDice } = useV2Roll();
```

Replace with:

```jsx
  const { rigs, game } = useRoomState();
  const sendCommand = useV2Commands();
  const { sendReact } = useV2BattleActions();
  const { promptDice } = useV2Roll();

  // The `rig` prop is a snapshot from open time. Derive the live rig so a reload
  // echo (loaded flips true) is reflected; `justReloaded` gives instant feedback
  // before the server round-trip lands.
  const liveRig = rigs.find((r) => r.id === rig.id) ?? rig;
  const [justReloaded, setJustReloaded] = useState(false);
  const heatKind = !!UNIT_KINDS[kindOf(rig)]?.hasHeat;
```

- [ ] **Step 4: Compute rangedSpent and the reload affordance near `weapons`**

First relocate `actionsLeft` so it is initialized before the reload affordance reads it (avoids a temporal-dead-zone crash). Find its declaration (search for `const actionsLeft = () => {`):

```jsx
  const actionsLeft = () => {
    const t = game?.turn;
    return t ? Math.max(0, t.actionsMax - t.actionsUsed) : 0;
  };
```

Cut it from its current spot and paste it immediately after the `const weapons = ...` line (so it sits above the reload affordance below).

Then find:

```jsx
  const weapons = (rig.weapons ?? {}) as Partial<Record<WeaponSlot, string>>;
```

Replace with (note `actionsLeft` now lives here from the move above):

```jsx
  const weapons = (rig.weapons ?? {}) as Partial<Record<WeaponSlot, string>>;

  const actionsLeft = () => {
    const t = game?.turn;
    return t ? Math.max(0, t.actionsMax - t.actionsUsed) : 0;
  };

  // One spent flag: the ranged weapon (Rig longRange OR flat-pick unit) clears
  // loaded.longRange when fired. It's disabled in the picker until reloaded.
  const rangedSpent = liveRig.loaded?.longRange === false && !justReloaded;
  const rangedWeaponName = flat ? weapons.unit : weapons.longRange;
  const hasMelee = !flat && !!weapons.melee
    && !(rig.weaponsDestroyed || []).includes(weapons.melee as string);
  // With no live melee, the drawer has nothing to fire — Reload becomes the CTA.
  const reloadIsPrimary = rangedSpent && !hasMelee;
  const reloadEnabled = heatKind ? true : actionsLeft() > 0;
  const reloadLabel = heatKind
    ? "⟳ Reload · +1–2 heat"
    : reloadEnabled ? "⟳ Reload · 1 action" : "Reload · Need 1 action";

  const doReload = async () => {
    const attrs: Record<string, unknown> = { name: rig.name, action: "reload" };
    if (heatKind && game?.autoResolve === false) {
      const d = await promptDice([{ key: "reload", label: "Reload heat", sides: 6 }], "Reload heat");
      attrs.dice = { reload: d.reload };
    }
    sendCommand("action", attrs);
    setJustReloaded(true);
    patch({ weapon: flat ? "unit" : "longRange" }); // arm + auto-select the ranged weapon
  };
```

- [ ] **Step 5: Replace the range/CTA computation block**

Find the block that starts with `// Effective-range readout + go button — mirrors update()...` and ends at the close of the `{ ... }` scope (the block computing `rangeHtml`, `rangeState`, `goText`, `goDisabled`, `dicePreview` — through the line that sets `goText = outOfRange ? "Out of range" : spent ? "Reload first" : ...`). Replace the entire block with:

```jsx
  // Effective-range readout + go button. The spent ranged weapon can't be the
  // selected slot (it's disabled in the picker), so this only ever describes a
  // live weapon — except the no-melee case, where the CTA becomes Reload.
  let rangeHtml: React.ReactNode = null;
  let rangeState = "ok";
  let goText = "Fire";
  let goDisabled = false;
  let goIsReload = false;

  const modeLabel = mode === "aimed" ? "Aimed Shot" : "Fire";
  let dicePreview = "";

  {
    const slot = state.weapon;
    const profile = profileOf(slot);
    const cost = 1;
    const left = actionsLeft();
    const outOfRange = !isMelee && !inRange;
    const rof = profile?.rof || ROF_BY_NAME[weapons[slot] || ""] || 1;
    // A reloaded long-range shot is the activation's SECOND ranged shot, so it
    // runs the barrel hot (+1 heat) — surfaced honestly on the dice line.
    const firedRanged = (game?.turn?.longRangeShots || 0) >= 1;
    const secondShot = !isMelee && firedRanged;

    dicePreview =
      `🎲 Rolls ${rof} hit ${rof === 1 ? "die" : "dice"} (d6)` +
      (mode === "fire" ? " + 1 location die (d12)" : "") +
      (mode === "aimed" ? " · +1 to hit" : "") +
      (secondShot ? " · +1 heat (second shot)" : "");

    if (isMelee) {
      const reach = profile?.rng?.[0] ?? 2;
      rangeHtml = (
        <>
          <span className="v2-aw-range-ic">📏</span>Reach <b>{reach}"</b> · melee never needs reloading
        </>
      );
      rangeState = outOfRange ? "bad" : "ok";
    } else if (profile) {
      const accLabel =
        penalty <= 0 ? `Sweet spot +${peak}` : `${accHere >= 0 ? "+" : ""}${accHere} · falloff`;
      const gate =
        state.inches < minRange
          ? <span className="v2-aw-range-warn">Too close — out of range</span>
          : state.inches > maxRange
            ? <span className="v2-aw-range-warn">Target is out of range — this shot will fail</span>
            : null;
      rangeHtml = (
        <>
          <span className="v2-aw-range-ic">📏</span>
          Sweet spot <b>{sweet}"</b> · usable <b>{minRange}"–{maxRange}"</b> · at {state.inches}": <b>{accLabel}</b>
          {gate}
        </>
      );
      rangeState = outOfRange ? "bad" : "ok";
    }

    const unaffordable = cost > left;
    if (reloadIsPrimary) {
      goIsReload = true;
      goText = reloadLabel;
      goDisabled = !reloadEnabled;
    } else {
      goDisabled = outOfRange || unaffordable;
      goText = outOfRange
        ? "Out of range"
        : unaffordable
          ? `Need ${cost} action${cost === 1 ? "" : "s"} · ${left} left`
          : modeLabel;
    }
  }
```

- [ ] **Step 6: Disable the spent option in the Weapon field**

Find the Weapon `<Field ... />` (search for `label="Weapon"`). Add two props — `optDisabled` and a spent-aware `optDesc`. Change:

```jsx
                icon={FIELD_ICONS.weapon}
                optIcon={(opt) => (isMelee || opt === weapons.melee ? "🗡️" : "🎯")}
                desc={flat ? "One flat-pick weapon — no weight-class STR scaling." : FIELD_DESC.weapon}
                optDesc={weaponDesc}
              />
```

to:

```jsx
                icon={FIELD_ICONS.weapon}
                optIcon={(opt) => (isMelee || opt === weapons.melee ? "🗡️" : "🎯")}
                desc={flat ? "One flat-pick weapon — no weight-class STR scaling." : FIELD_DESC.weapon}
                optDisabled={(opt) => rangedSpent && opt === rangedWeaponName}
                optDesc={(opt) => (rangedSpent && opt === rangedWeaponName ? "Spent · reload" : weaponDesc(opt))}
              />
```

- [ ] **Step 7: Add the reload banner after the Weapon field**

Immediately after the closing `/>` of the Weapon `<Field>` (before the Arc `<Field>`), insert:

```jsx
              {rangedSpent && hasMelee && (
                <div className="v2-aw-reload" role="status">
                  <div className="v2-aw-reload-text">
                    <b>Ranged weapon spent.</b> Reload is mandatory before it can fire again.
                  </div>
                  <button
                    type="button"
                    className="v2-aw-reload-btn"
                    disabled={!reloadEnabled}
                    onClick={doReload}
                  >
                    {reloadLabel}
                  </button>
                </div>
              )}
```

- [ ] **Step 8: Route the primary CTA to reload when appropriate**

Find the final CTA button:

```jsx
          <button className="v2-aw-go v2-cta v2-cta--ember" disabled={goDisabled} onClick={submit}>
            {goText}
          </button>
```

Replace with:

```jsx
          <button
            className="v2-aw-go v2-cta v2-cta--ember"
            disabled={goDisabled}
            onClick={goIsReload ? doReload : submit}
          >
            {goText}
          </button>
```

- [ ] **Step 9: Run the drawer tests to verify they pass**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`
Expected: PASS (existing render test + the two new reload tests).

- [ ] **Step 10: Typecheck the client**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors in `AttackWizard.tsx`.

- [ ] **Step 11: Commit**

```bash
git add client/src/v2/overlays/AttackWizard.tsx client/src/v2/overlays/AttackWizard.test.tsx
git commit -m "feat(v2): in-drawer Reload arms the spent ranged weapon in place

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Reload banner + button styling

**Files:**
- Modify: `client/src/v2/styles/wizards.css`

- [ ] **Step 1: Add the banner/button styles**

Append to `client/src/v2/styles/wizards.css`:

```css
/* Spent-weapon reload prompt — an ember-toned iron strip under the weapon picker. */
.v2-aw-reload {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0 4px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--v2-ember, #c8552b) 55%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--v2-ember, #c8552b) 12%, transparent);
}
.v2-aw-reload-text { flex: 1; font-size: 0.85rem; line-height: 1.3; }
.v2-aw-reload-btn {
  flex: none;
  padding: 8px 14px;
  border: 1px solid var(--v2-ember, #c8552b);
  border-radius: 6px;
  background: var(--v2-ember, #c8552b);
  color: #120a06;
  font: inherit;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
}
.v2-aw-reload-btn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 2: Verify in the browser**

Start the app and drive a rig to a spent ranged state:

1. `preview_start` with the dev server (`{name}` from `.claude/launch.json`; create it if missing per the tool docs, e.g. `npm run dev`).
2. Open a battle, activate a Rig, Fire its long-range weapon once.
3. Open Fire again. Confirm: the long-range weapon chip is greyed with `Spent · reload`; the ember reload banner shows `⟳ Reload · +1–2 heat`; the melee Fire CTA still works.
4. Click Reload. Confirm the long-range chip re-enables and becomes selected, the banner disappears, and the CTA becomes the long-range Fire.
5. `read_console_messages` (level error) — expect none related to the drawer.
6. `computer {action: "screenshot"}` to capture the spent-and-reload state.

- [ ] **Step 3: Commit**

```bash
git add client/src/v2/styles/wizards.css
git commit -m "style(v2): ember reload banner + button in the Fire drawer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npm test`
Expected: Vitest suites pass and `node --test` shared/server suites pass.

- [ ] **Confirm the three-shot loop by hand (auto-resolve)**

In the running app, give a heat Rig 3 actions: Fire → (drawer) Reload → Fire → (drawer) Reload → Fire. Confirm three ranged shots land in one activation, actions spent = 3, and heat climbs from the two reload rolls plus the second/third-shot surcharges.
