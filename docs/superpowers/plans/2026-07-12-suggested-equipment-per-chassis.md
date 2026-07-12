# Suggested Equipment per Chassis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each rig chassis 1–2 suggested equipment picks, highlighted in the Commission Wizard's Equipment step, with the top pick auto-selected when the chassis is chosen.

**Architecture:** Suggestions are authored per chassis in `content/chassis.json`, validated and capped server-side in the hot-reloaded chassis store, and served through the existing `/api/chassis` endpoint. The V2 Commission Wizard consumes them to highlight matching equipment cards (badge + reason) and auto-preselect the top pick. UI + content only — no combat-rule change.

**Tech Stack:** Node.js ESM (server + shared game-state), React + TypeScript (V2 wizard), plain CSS (forge.css), `node:test` for server tests, Vitest for client.

---

## File structure

- `server/chassis.js` — chassis store; add `suggestedEquipment` to defaults + a validated array-merge branch. **Responsibility:** turn on-disk content into safe, merged catalogue entries.
- `server/chassis.test.js` — add coverage for the new merge branch.
- `content/chassis.json` — author 1–2 suggestions per rig chassis. **Responsibility:** the editable suggestion data.
- `client/src/v2/overlays/CommissionWizard.tsx` — type, fetch mapping, highlight/badge/reason render, auto-preselect. **Responsibility:** surface + apply suggestions in the wizard.
- `client/src/v2/styles/forge.css` — `is-suggested` card state + badge/reason styling. **Responsibility:** the visual highlight.

Equipment ids (canonical `EQUIPMENT` keys, for reference in every task):
`ablative-plating`, `radiator-array`, `servo-actuators`, `overclock-core`, `field-repair-suite`.

---

### Task 1: Server — validate & merge `suggestedEquipment`

**Files:**
- Modify: `server/chassis.js`
- Test: `server/chassis.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `server/chassis.test.js` (uses the existing `tmpFile` helper and imports already at the top):

```js
test("merges suggestedEquipment from disk", () => {
  const fp = tmpFile("suggest.json");
  const id = CHASSIS[0].id;
  fs.writeFileSync(fp, JSON.stringify([
    { id, suggestedEquipment: [{ id: "radiator-array", reason: "runs hot" }] },
  ]));
  const store = createChassisStore(fp);
  assert.deepEqual(store.get(id).suggestedEquipment, [{ id: "radiator-array", reason: "runs hot" }]);
});

test("defaults suggestedEquipment to an empty array", () => {
  const fp = tmpFile("suggest-default.json");
  const store = createChassisStore(fp);
  assert.deepEqual(store.all()[0].suggestedEquipment, []);
});

test("drops suggestions with unknown equipment ids and caps at 2", () => {
  const fp = tmpFile("suggest-bad.json");
  const id = CHASSIS[0].id;
  fs.writeFileSync(fp, JSON.stringify([
    { id, suggestedEquipment: [
      { id: "not-a-real-eq", reason: "x" },
      { id: "radiator-array", reason: "a" },
      { id: "servo-actuators", reason: "b" },
      { id: "ablative-plating", reason: "c" },
    ] },
  ]));
  const store = createChassisStore(fp);
  const out = store.get(id).suggestedEquipment;
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.id), ["radiator-array", "servo-actuators"]);
});

test("coerces a missing reason to a string and a non-array to []", () => {
  const fp = tmpFile("suggest-coerce.json");
  const id = CHASSIS[0].id;
  const id2 = CHASSIS[1].id;
  fs.writeFileSync(fp, JSON.stringify([
    { id, suggestedEquipment: [{ id: "overclock-core" }] },
    { id: id2, suggestedEquipment: "nope" },
  ]));
  const store = createChassisStore(fp);
  assert.deepEqual(store.get(id).suggestedEquipment, [{ id: "overclock-core", reason: "" }]);
  assert.deepEqual(store.get(id2).suggestedEquipment, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/chassis.test.js`
Expected: the four new tests FAIL (e.g. `suggestedEquipment` is `undefined`, not `[]`/the merged array).

- [ ] **Step 3: Implement the merge branch**

In `server/chassis.js`, add `EQUIPMENT` to the game-state import:

```js
import { CHASSIS, EQUIPMENT } from "../shared/game-state.js";
```

Add a helper above `defaults()` that sanitises a raw suggestion array:

```js
// Keep only well-formed suggestions pointing at a real equipment id; coerce
// reason to a string; cap at 2. Anything else (non-array, junk rows) → [].
function cleanSuggestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s.id === "string" && EQUIPMENT[s.id])
    .map((s) => ({ id: s.id, reason: typeof s.reason === "string" ? s.reason : "" }))
    .slice(0, 2);
}
```

In `defaults()`, seed the field to an empty array:

```js
function defaults() {
  return CHASSIS.map((p) => ({
    ...p,
    ...Object.fromEntries(CONTENT_FIELDS.map((f) => [f, ""])),
    suggestedEquipment: [],
  }));
}
```

In `mergeFromDisk()`, extend the per-row merge to carry the cleaned suggestions.
Replace the `byId.set(row.id, { ... })` block with:

```js
      byId.set(row.id, {
        ...base,
        label: typeof row.label === "string" && row.label.trim() ? row.label : base.label,
        ...Object.fromEntries(
          CONTENT_FIELDS.map((f) => [f, typeof row[f] === "string" ? row[f] : base[f]]),
        ),
        suggestedEquipment: "suggestedEquipment" in row
          ? cleanSuggestions(row.suggestedEquipment)
          : base.suggestedEquipment,
      });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/chassis.test.js`
Expected: all tests PASS (new four + the existing nine).

- [ ] **Step 5: Commit**

```bash
git add server/chassis.js server/chassis.test.js
git commit -m "feat(chassis): serve validated per-chassis suggestedEquipment"
```

---

### Task 2: Content — author suggestions for all 11 rig chassis

**Files:**
- Modify: `content/chassis.json`

- [ ] **Step 1: Add a `suggestedEquipment` array to each entry**

Insert a `"suggestedEquipment"` key into every object in `content/chassis.json`
(after `"personality"`, remembering the comma). Use exactly these values:

```jsonc
// light-claw-autocannon
"suggestedEquipment": [
  { "id": "ablative-plating", "reason": "Duels heavies at close range — survive the trade." },
  { "id": "field-repair-suite", "reason": "Patch the plate the claw-work costs you." }
]

// light-missile-flamethrower
"suggestedEquipment": [
  { "id": "radiator-array", "reason": "Volleys and flame stack heat fast — vent harder." }
]

// light-saw-minigun
"suggestedEquipment": [
  { "id": "servo-actuators", "reason": "Stay latched on the target you're grinding." },
  { "id": "radiator-array", "reason": "Sustained fire runs the frame hot." }
]

// light-wreckingball-double
"suggestedEquipment": [
  { "id": "servo-actuators", "reason": "A flanker lives or dies on mobility." }
]

// light-sword-arc
"suggestedEquipment": [
  { "id": "radiator-array", "reason": "The Arc Gun cooks your own heat too." },
  { "id": "servo-actuators", "reason": "Fence in and out of reach on demand." }
]

// medium-lance-mortar
"suggestedEquipment": [
  { "id": "servo-actuators", "reason": "Reposition between the shelling and the charge." },
  { "id": "radiator-array", "reason": "Keep the mortar firing without cooking off." }
]

// medium-shield-siege
"suggestedEquipment": [
  { "id": "ablative-plating", "reason": "An objective-holder wants every extra plate." },
  { "id": "field-repair-suite", "reason": "Weld the shield back up and refuse to die." }
]

// medium-sniper-chainsaw
"suggestedEquipment": [
  { "id": "overclock-core", "reason": "Extra actions to snipe then close in one turn." },
  { "id": "radiator-array", "reason": "Big shots and the chainsaw both run hot." }
]

// light-harpoon-anchor
"suggestedEquipment": [
  { "id": "servo-actuators", "reason": "Close the gap to spear, then never let go." },
  { "id": "ablative-plating", "reason": "Fragile hull needs the extra armour to hold the lock." }
]

// light-rivet-pressureclaw
"suggestedEquipment": [
  { "id": "ablative-plating", "reason": "A short-range grinder must stay close and alive." },
  { "id": "field-repair-suite", "reason": "Outlast the target you're chewing apart." }
]

// medium-crossbow-talon
"suggestedEquipment": [
  { "id": "radiator-array", "reason": "The Shrike runs hot holding the sweet spot." },
  { "id": "servo-actuators", "reason": "Reposition to the band, then pounce." }
]
```

- [ ] **Step 2: Verify the file is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('content/chassis.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Verify the server serves the suggestions**

Run: `node -e "import('./server/chassis.js').then(({createChassisStore})=>{const s=createChassisStore('content/chassis.json');console.log(JSON.stringify(s.get('medium-crossbow-talon').suggestedEquipment))})"`
Expected: prints the two crossbow-talon suggestions (radiator-array, servo-actuators).

- [ ] **Step 4: Commit**

```bash
git add content/chassis.json
git commit -m "content(chassis): author suggested equipment per rig chassis"
```

---

### Task 3: Client — consume, highlight, and auto-preselect

**Files:**
- Modify: `client/src/v2/overlays/CommissionWizard.tsx`

- [ ] **Step 1: Extend the `ChassisContent` type**

Replace the interface at `client/src/v2/overlays/CommissionWizard.tsx:20-23` with:

```tsx
// Authored content layered onto a chassis by the server (content/chassis.json).
interface EquipSuggestion { id: string; reason: string; }
interface ChassisContent {
  description?: string; focus?: string; balance?: string; personality?: string;
  suggestedEquipment?: EquipSuggestion[];
}
```

- [ ] **Step 2: Carry `suggestedEquipment` through the fetch mapping**

In the `/api/chassis` effect, update the mapped object (currently
`client/src/v2/overlays/CommissionWizard.tsx:98`) to include the suggestions:

```tsx
          map[p.id] = {
            description: p.description, focus: p.focus, balance: p.balance, personality: p.personality,
            suggestedEquipment: Array.isArray(p.suggestedEquipment) ? p.suggestedEquipment : [],
          };
```

- [ ] **Step 3: Auto-preselect the top pick when content resolves**

Still inside the `.then((data) => { ... })` callback, right after `setContent(map)`,
apply the current chassis's top suggestion (covers the initial default chassis):

```tsx
        setContent(map);
        const top = map[state.chassis]?.suggestedEquipment?.[0]?.id;
        if (top) setState((s) => ({ ...s, equipment: top }));
```

Note: `state.chassis` here is the value captured at mount (the default chassis),
which is correct — this only fires once on load.

- [ ] **Step 4: Auto-preselect the top pick when a chassis is selected**

Update `selectChassis` (`client/src/v2/overlays/CommissionWizard.tsx:72-83`) to also
patch equipment when the selected chassis has a suggestion:

```tsx
  const selectChassis = (id: string) => {
    const pb = CHASSIS.find((p) => p.id === id);
    if (!pb) return;
    const top = content[id]?.suggestedEquipment?.[0]?.id;
    patch({
      chassis: pb.id,
      cls: pb.class,
      longRange: pb.longRange,
      melee: pb.melee,
      longRangeUpgrade: firstUpgradeId(pb.longRange),
      meleeUpgrade: firstUpgradeId(pb.melee),
      ...(top ? { equipment: top } : {}),
    });
  };
```

- [ ] **Step 5: Highlight suggested equipment cards in step 2**

In the Equipment step (`state.step === 2`, `state.kind === "rig"` branch), build a
suggestion lookup just before the `return (` of that `body`, and use it in the map.
Replace the equipment `.map(...)` button block
(`client/src/v2/overlays/CommissionWizard.tsx:340-354`) with:

```tsx
            {Object.entries(EQUIPMENT).map(([id, e]) => {
              const suggestion = (content[state.chassis]?.suggestedEquipment || [])
                .find((s) => s.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  className={"v2-fc-equip"
                    + (id === state.equipment ? " is-sel" : "")
                    + (suggestion ? " is-suggested" : "")}
                  onClick={() => patch({ equipment: id })}
                >
                  {suggestion && (
                    <div className="v2-fc-equip-suggest">
                      <span className="v2-fc-equip-suggest-tag v2-eyebrow">◈ Suggested</span>
                      <span className="v2-fc-equip-suggest-why">{suggestion.reason}</span>
                    </div>
                  )}
                  <div className="v2-fc-equip-family v2-eyebrow">{e.family}</div>
                  <div className="v2-fc-equip-label v2-title">{e.label}</div>
                  <div className="v2-fc-equip-passive">Passive · {e.passive}</div>
                  <div className="v2-fc-equip-active">
                    Active · <b>{e.active.label}</b> ({e.active.heat >= 0 ? "+" : ""}{e.active.heat} heat) — {e.active.text}
                  </div>
                </button>
              );
            })}
```

- [ ] **Step 6: Verify the client typechecks and builds**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors from `CommissionWizard.tsx`.

- [ ] **Step 7: Commit**

```bash
git add client/src/v2/overlays/CommissionWizard.tsx
git commit -m "feat(v2): highlight + auto-preselect suggested equipment per chassis"
```

---

### Task 4: Styling — the suggested-card highlight

**Files:**
- Modify: `client/src/v2/styles/forge.css`

- [ ] **Step 1: Add the highlight + badge rules**

Append after the equipment grid block (after
`client/src/v2/styles/forge.css:209`, the `.v2-fc-equip-active b` rule):

```css
/* suggested-for-this-chassis highlight (distinct from .is-sel selection) */
.v2-root .v2-fc-equip.is-suggested {
  border-color: var(--v2-oil);
  box-shadow: 0 0 10px color-mix(in srgb, var(--v2-oil) 35%, transparent);
}
.v2-root .v2-fc-equip-suggest {
  display: flex; flex-direction: column; gap: 2px;
  margin-bottom: 4px; padding-bottom: 6px;
  border-bottom: 1px solid var(--v2-line);
}
.v2-root .v2-fc-equip-suggest-tag { color: var(--v2-oil-hi); }
.v2-root .v2-fc-equip-suggest-why {
  font-family: var(--v2-disp); font-size: var(--v2-text-sm);
  line-height: 1.4; color: var(--v2-txt-dim);
}
```

- [ ] **Step 2: Visually verify in the running wizard**

Start the app, open the Commission Wizard, pick a chassis, advance to the
Equipment step. Confirm: the chassis's suggested card(s) show the accent
border/glow + "◈ Suggested" badge + reason line, and the top suggestion is
already selected. Switch chassis and confirm the highlight + preselect follow.

(Use the preview/verification workflow — `preview_start` the dev server, drive
the wizard, screenshot the Equipment step.)

- [ ] **Step 3: Commit**

```bash
git add client/src/v2/styles/forge.css
git commit -m "style(v2): accent + badge for suggested equipment cards"
```

---

## Self-review notes

- **Spec coverage:** data model → Task 1 (server) + Task 2 (content); server validation/cap → Task 1; auto-preselect → Task 3 steps 3–4; highlight/badge/reason → Task 3 step 5 + Task 4; styling → Task 4; tests → Task 1. All spec sections mapped.
- **Types consistent:** `EquipSuggestion { id, reason }` defined in Task 3 step 1 and used verbatim in steps 3–5; server emits `{ id, reason }` (Task 1 `cleanSuggestions`) — shapes match.
- **No placeholders:** every code step is complete; content strings are final wording.
- **Cross-task naming:** `suggestedEquipment` key identical across chassis.js, chassis.json, fetch mapping, and render. `is-suggested` / `v2-fc-equip-suggest*` class names identical in TSX (Task 3 step 5) and CSS (Task 4 step 1).
