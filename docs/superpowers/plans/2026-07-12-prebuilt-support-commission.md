# Pre-built Tank & Walker Commissioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commission Tanks and Walkers by picking a named pre-built template (kind + gun + two modules) instead of flat-picking a single weapon, mirroring how Rigs pick a chassis.

**Architecture:** Introduce one owner-neutral `SUPPORT_TEMPLATES` catalog in `shared/game-state.js` as the single source of truth; rebuild the existing `SUPPORT_UNITS` and `SEED_SUPPORT` rosters from it via an owner-tagging expander (runtime-identical to today). Rewire `CommissionWizard.tsx` so the Tank/Walker "Weapon" step becomes a "Loadout" step that picks a template and forwards `unit` + `modules` to the already-capable `add` verb. No combat or server-logic changes.

**Tech Stack:** JavaScript (shared, ES modules, `node:test`), React + TypeScript (client, Vitest), Vite.

**Spec:** `docs/superpowers/specs/2026-07-12-prebuilt-support-commission-design.md`

**Test commands:**
- Shared: `node --test shared/game-state.test.js` and `node --test shared/support-units.test.js`
- Client: `npx vitest run client/src/v2/lib/commissionData.test.ts`

---

## File Structure

- `shared/game-state.js` — add `SUPPORT_TEMPLATES` + `templ()` expander + `templateById()` + `templatesForKind()`; rebuild `SUPPORT_UNITS` and `SEED_SUPPORT` from the catalog. (Currently the rosters are hand-written literals at lines ~121–140.)
- `shared/game-state.test.js` — new coverage for the catalog + lookups. (`SUPPORT_UNITS` shape is already guarded in `shared/support-units.test.js:224`; keep that green.)
- `client/src/v2/lib/commissionData.ts` — add `MODULE_BLURB` map for the loadout cards.
- `client/src/v2/lib/commissionData.test.ts` — assert `MODULE_BLURB` covers the ally-verb modules.
- `client/src/v2/overlays/CommissionWizard.tsx` — replace `WizardState.unit` with `WizardState.template`; Tank/Walker step 1 becomes a template-card grid; submit + confirm read the template; delete the flat-pick grid.
- `client/src/v2/styles/forge.css` — module-chip styling for the loadout cards (only if the reused chassis-card classes need a chip variant).

---

## Task 1: Owner-neutral `SUPPORT_TEMPLATES` catalog + lookups

**Files:**
- Modify: `shared/game-state.js` (replace the `SUPPORT_UNITS` / `SEED_SUPPORT` literals at ~121–140)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`. First extend the import line (line 3 block) to include the new names, then append the tests:

```js
// add to the existing import from "./game-state.js":
//   SUPPORT_TEMPLATES, templateById, templatesForKind, SUPPORT_UNITS, SEED_SUPPORT

test("SUPPORT_TEMPLATES is an owner-neutral catalog of named tank/walker loadouts", () => {
  for (const t of SUPPORT_TEMPLATES) {
    assert.ok(t.id && t.name, "each template has an id and name");
    assert.ok(t.kind === "tank" || t.kind === "walker", `${t.id} is tank or walker`);
    assert.equal(t.owner, undefined, `${t.id} carries no owner`);
    assert.ok(Array.isArray(t.modules) && t.modules.length === 2, `${t.id} has two modules`);
  }
  const ids = SUPPORT_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "template ids are unique");
});

test("templateById resolves case-insensitively, else null", () => {
  assert.equal(templateById("MARKSMAN-TANK").name, "Marksman Tank");
  assert.equal(templateById("nope"), null);
});

test("templatesForKind filters by kind", () => {
  assert.ok(templatesForKind("tank").every((t) => t.kind === "tank"));
  assert.ok(templatesForKind("walker").every((t) => t.kind === "walker"));
  assert.equal(templatesForKind("tank").length, 2);
  assert.equal(templatesForKind("walker").length, 5);
});

test("SUPPORT_UNITS and SEED_SUPPORT are rebuilt unchanged from the catalog", () => {
  assert.deepEqual(SUPPORT_UNITS, [
    { name: "Marksman Tank",  owner: "a", kind: "tank",   unit: "Tank Cannon", modules: ["damage", "recon"] },
    { name: "Radiator Walker", owner: "a", kind: "walker", unit: "Coaxial MG",  modules: ["damage", "coolant"] },
    { name: "Field Welder",   owner: "b", kind: "walker", modules: ["repair", "recon"] },
    { name: "Depot Tank",     owner: "b", kind: "tank",   modules: ["repair", "coolant"] },
  ]);
  assert.deepEqual(SEED_SUPPORT, [
    { name: "Marksman Tank",   owner: "a", kind: "tank",   unit: "Tank Cannon",      modules: ["damage", "recon"] },
    { name: "Radiator Walker", owner: "a", kind: "walker", unit: "Coaxial MG",       modules: ["damage", "coolant"] },
    { name: "Medic Walker",    owner: "a", kind: "walker", modules: ["repair", "recon"] },
    { name: "Depot Tank",      owner: "b", kind: "tank",   modules: ["repair", "coolant"] },
    { name: "Rocket Walker",   owner: "b", kind: "walker", unit: "Rocket Pod",       modules: ["damage", "recon"] },
    { name: "Gun Walker",      owner: "b", kind: "walker", unit: "Autocannon Mount", modules: ["damage", "coolant"] },
  ]);
});
```

> Note: `assert.deepEqual` ignores property order, so the expander may emit keys in any order. Sidearm-only entries omit `unit` entirely (no `unit: undefined` key), matching the existing literals and the `unit === undefined` assertion in `shared/support-units.test.js:230`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `SUPPORT_TEMPLATES`, `templateById`, `templatesForKind` are not exported (import resolves them to `undefined`).

- [ ] **Step 3: Implement the catalog, expander, lookups, and rebuilt rosters**

In `shared/game-state.js`, replace the current `SUPPORT_UNITS` block and the `SEED_SUPPORT` block (the literals spanning roughly lines 119–140) with:

```js
// Owner-neutral pre-built Tank/Walker templates (spec:
// 2026-07-12-prebuilt-support-commission). Single source of truth: the
// owner-tagged rosters below (SUPPORT_UNITS, SEED_SUPPORT) and the commission
// wizard all read from this. `unit: null` = sidearm-only (makeUnit fits Sidearm).
export const SUPPORT_TEMPLATES = [
  { id: "marksman-tank",   name: "Marksman Tank",   kind: "tank",   unit: "Tank Cannon",      modules: ["damage", "recon"] },
  { id: "depot-tank",      name: "Depot Tank",      kind: "tank",   unit: null,               modules: ["repair", "coolant"] },
  { id: "radiator-walker", name: "Radiator Walker", kind: "walker", unit: "Coaxial MG",       modules: ["damage", "coolant"] },
  { id: "field-welder",    name: "Field Welder",    kind: "walker", unit: null,               modules: ["repair", "recon"] },
  { id: "medic-walker",    name: "Medic Walker",    kind: "walker", unit: null,               modules: ["repair", "recon"] },
  { id: "rocket-walker",   name: "Rocket Walker",   kind: "walker", unit: "Rocket Pod",       modules: ["damage", "recon"] },
  { id: "gun-walker",      name: "Gun Walker",      kind: "walker", unit: "Autocannon Mount", modules: ["damage", "coolant"] },
];

export function templateById(id) {
  if (!id) return null;
  const ref = String(id).trim().toLowerCase();
  return SUPPORT_TEMPLATES.find((t) => t.id === ref) || null;
}

export function templatesForKind(kind) {
  const k = String(kind || "").trim().toLowerCase();
  return SUPPORT_TEMPLATES.filter((t) => t.kind === k);
}

// Expand a template id + owner into the add-shape used by the seed/exemplar
// rosters. Omits `unit` when the template is sidearm-only so the emitted object
// is identical to the previously hand-written literals.
function supportEntry(id, owner) {
  const t = templateById(id);
  const out = { name: t.name, owner, kind: t.kind, modules: t.modules };
  if (t.unit) out.unit = t.unit;
  return out;
}

// The four shipped support-unit exemplars (spec: Support Units).
export const SUPPORT_UNITS = [
  supportEntry("marksman-tank", "a"),
  supportEntry("radiator-walker", "a"),
  supportEntry("field-welder", "b"),
  supportEntry("depot-tank", "b"),
];

// Support units the default `seed` battle deploys alongside the 6 rigs.
export const SEED_SUPPORT = [
  supportEntry("marksman-tank", "a"),
  supportEntry("radiator-walker", "a"),
  supportEntry("medic-walker", "a"),
  supportEntry("depot-tank", "b"),
  supportEntry("rocket-walker", "b"),
  supportEntry("gun-walker", "b"),
];
```

Also add the four new names (`SUPPORT_TEMPLATES, templateById, templatesForKind`, plus `SEED_SUPPORT` if not already imported) to the import block at the top of `shared/game-state.test.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js shared/support-units.test.js`
Expected: PASS — new catalog tests pass and the existing `SUPPORT_UNITS defines the four shipped exemplars` test (support-units.test.js:224) still passes.

- [ ] **Step 5: Run the full suite to confirm no roster consumer broke**

Run: `npm test`
Expected: PASS — every vitest + node test green (seed/add paths consume the rebuilt rosters unchanged).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "refactor(shared): SUPPORT_TEMPLATES as single source for support rosters"
```

---

## Task 2: `MODULE_BLURB` for the loadout cards

**Files:**
- Modify: `client/src/v2/lib/commissionData.ts`
- Test: `client/src/v2/lib/commissionData.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `client/src/v2/lib/commissionData.test.ts`:

```ts
import { MODULE_BLURB } from "./commissionData";

test("MODULE_BLURB describes each ally-verb module", () => {
  expect(MODULE_BLURB.repair).toMatch(/weld/i);
  expect(MODULE_BLURB.coolant).toMatch(/heat/i);
  expect(MODULE_BLURB.recon).toMatch(/mark/i);
  // Damage is shown as the gun itself, so it has no blurb.
  expect(MODULE_BLURB.damage).toBeUndefined();
});
```

> If the test file uses Vitest globals already, no new import of `test`/`expect` is needed; match the file's existing style (check its top for `import { test, expect } from "vitest"`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/lib/commissionData.test.ts`
Expected: FAIL — `MODULE_BLURB` is not exported.

- [ ] **Step 3: Implement the map**

Add to `client/src/v2/lib/commissionData.ts`:

```ts
// One-line summaries of the ally-targeting support modules, shown on the
// commission loadout cards. Damage is represented by the gun itself, so it is
// intentionally absent here.
export const MODULE_BLURB: Record<string, string> = {
  repair:  'Field Weld — heal an ally or self within 2".',
  coolant: 'Vent — cool a friendly Rig within 2" by 2 heat.',
  recon:   'Paint — mark an enemy; allies ignore its cover and gain +1 Aim.',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/lib/commissionData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/lib/commissionData.ts client/src/v2/lib/commissionData.test.ts
git commit -m "feat(v2): MODULE_BLURB one-liners for support loadout cards"
```

---

## Task 3: Rewire the wizard to template state

**Files:**
- Modify: `client/src/v2/overlays/CommissionWizard.tsx`

This task has no unit test (the wizard is verified end-to-end in the browser in Task 4). Each step is a focused edit; compile after the last.

- [ ] **Step 1: Update imports and step labels**

In `client/src/v2/overlays/CommissionWizard.tsx`:

Change the import from `/shared/game-state.js` to add `SUPPORT_TEMPLATES` and `templatesForKind`, and (optionally) drop `UNIT_WEAPONS` from the import only if it ends up unused — it is still used to render gun stats on the cards, so **keep `UNIT_WEAPONS`**.

Replace `stepsFor`:

```ts
function stepsFor(kind: Kind): string[] {
  if (kind === "rig") return ["Kind", "Chassis", "Equipment", "Confirm"];
  return ["Kind", "Loadout", "Confirm"];
}
```

Update `KIND_DESC` for tank/walker to reflect templates (no longer "one flat-pick weapon"):

```ts
const KIND_DESC: Record<Kind, string> = {
  rig: "Heat + weight class + two weapon slots + equipment. 3 actions.",
  tank: "Cold single-model machine. Pre-built loadout + two modules. 2 actions.",
  walker: "Cold walker chassis. Pre-built loadout + two modules. 3 actions, mobile.",
};
```

- [ ] **Step 2: Swap `unit` for `template` in `WizardState` and initial state**

Change the `WizardState` field:

```ts
  // was: unit: string;  // flat-pick weapon for Tank / Walker
  template: string; // chosen SUPPORT_TEMPLATES id for Tank / Walker
```

In the `useState` initializer, replace `unit: Object.keys(UNIT_WEAPONS)[0]` with:

```ts
      template: templatesForKind("tank")[0].id,
```

- [ ] **Step 3: Default the template when the kind changes**

The Kind step buttons currently call `patch({ kind: k, step: 0 })`. For tank/walker we must also reset `template` to the first template of that kind (rig ignores it). Replace that onClick:

```tsx
              onClick={() => patch({
                kind: k,
                step: 0,
                ...(k !== "rig" ? { template: templatesForKind(k)[0].id } : {}),
              })}
```

- [ ] **Step 4: Replace the Tank/Walker step-1 body (flat-pick grid → template cards)**

Find the `else` branch of `state.step === 1` (the block rendering `Object.entries(UNIT_WEAPONS)` under the `◈ Unit weapon` cue). Replace the entire `else { body = ( … ); }` with:

```tsx
    } else {
      const templates = templatesForKind(state.kind);
      body = (
        <div className="v2-fw-body">
          <div className="v2-fc-cue">
            <span className="v2-fc-cue-lead">◈ Choose a loadout</span>
            <span className="v2-fc-cue-sub v2-eyebrow">— gun &amp; two support modules are fixed by the frame</span>
          </div>
          <div className="v2-fc-grid v2-grid-2">
            {templates.map((t) => {
              const w = t.unit ? UNIT_WEAPONS[t.unit] : null;
              const sel = t.id === state.template;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={"v2-fc-equip" + (sel ? " is-sel" : "")}
                  onClick={() => patch({ template: t.id })}
                >
                  <div className="v2-fc-equip-family v2-eyebrow">{UNIT_KINDS[t.kind].label}</div>
                  <div className="v2-fc-equip-label v2-title">{t.name}</div>
                  <div className="v2-fc-equip-passive">
                    {w
                      ? <>{weaponGlyph(t.unit!)} {t.unit} · STR {w.str} · ROF {w.rof}</>
                      : <>⚙ Sidearm · STR 4 · ROF 2 — light plinker</>}
                  </div>
                  <div className="v2-fc-equip-active">
                    {t.modules.map((m) => (
                      <div key={m} className="v2-fc-module">
                        <b>{MODULES[m].label}</b>
                        {MODULE_BLURB[m] ? <> — {MODULE_BLURB[m]}</> : null}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }
```

Add the needed imports at the top of the file:
- from `/shared/unit-kinds.js`: add `MODULES` alongside the existing `UNIT_KINDS`.
- from `../lib/commissionData`: add `MODULE_BLURB` alongside the existing named imports.

- [ ] **Step 5: Replace the Tank/Walker confirm body (step 2)**

Find the `else` branch of `state.step === 2` (the block that reads `const w = UNIT_WEAPONS[state.unit];` and renders the confirm). Replace that entire `else { … }` with:

```tsx
    } else {
      const t = templateById(state.template);
      const w = t?.unit ? UNIT_WEAPONS[t.unit] : null;
      body = (
        <div className="v2-fw-body v2-fc-confirm">
          <div className="v2-fc-confirm-name v2-title">{unitName()} — {UNIT_KINDS[state.kind].label}</div>
          <div className="v2-fc-confirm-row">
            {w
              ? <>{weaponGlyph(t!.unit!)} {t!.unit} · STR {w.str} · ROF {w.rof}</>
              : <>⚙ Sidearm · STR 4 · ROF 2</>}
          </div>
          {t?.modules.map((m) => (
            <div key={m} className="v2-fc-confirm-row">🔧 {MODULES[m].label}</div>
          ))}
        </div>
      );
    }
```

Add `templateById` to the `/shared/game-state.js` import.

- [ ] **Step 6: Update `unitName` and `submit`**

Replace `unitName`:

```ts
  const unitName = () =>
    state.kind === "rig"
      ? (CHASSIS_NAME[state.chassis] || state.cls)
      : (templateById(state.template)?.name || state.cls);
```

In `submit`, replace the tank/walker `else` branch:

```ts
    } else {
      const t = templateById(state.template);
      sendCommand("add", {
        name: unitName(),
        kind: state.kind,
        owner: state.owner,
        ...(t?.unit ? { unit: t.unit } : {}),
        modules: t?.modules,
      });
    }
```

- [ ] **Step 7: Typecheck / build the client**

Run: `npx tsc -p client --noEmit` (or `npx vitest run` to trigger the TS transform; if the project has no `client/tsconfig` target, run `npm run build`).
Expected: no type errors. Common fixes: ensure `WizardState.template` is typed `string`, and that `t.unit!` non-null assertions sit behind the `w`/`t.unit` guards shown above.

- [ ] **Step 8: Commit**

```bash
git add client/src/v2/overlays/CommissionWizard.tsx
git commit -m "feat(v2): commission tanks/walkers from pre-built loadout templates"
```

---

## Task 4: Browser verification + module-chip polish

**Files:**
- Modify (only if styling is needed): `client/src/v2/styles/forge.css`

- [ ] **Step 1: Start the dev server and open the app**

Use the preview tool: `preview_start` with the dev server from `.claude/launch.json` (or create one running `npm run dev` on its port). Open the battle/roster view that hosts the Commission button.

- [ ] **Step 2: Commission a gun template**

Open the Commission wizard → Kind = **Tank** → Loadout shows exactly 2 cards (Marksman Tank, Depot Tank). Select **Marksman Tank** → Confirm shows "Tank Cannon · STR 12 · ROF 1", "Recon". Commission.

Verify with `read_page` that the new unit appears in the roster with its gun and module chips. Check `read_console_messages` for errors.

- [ ] **Step 3: Commission a sidearm-only template**

Kind = **Walker** → Loadout shows 5 cards. Select **Field Welder** (Repair + Recon, sidearm) → Confirm shows the Sidearm line + "Repair"/"Recon". Commission. Confirm the roster unit deploys with the Sidearm (not a null/blank weapon).

- [ ] **Step 4: Style the module rows if they look cramped**

If the `v2-fc-module` rows are unstyled/cramped, add to `client/src/v2/styles/forge.css`:

```css
.v2-fc-module { display: block; line-height: 1.35; }
.v2-fc-module + .v2-fc-module { margin-top: 2px; }
```

Reload and re-check. Skip this step if the reused card classes already read cleanly.

- [ ] **Step 5: Screenshot proof**

Take a `computer` screenshot of the Loadout step (walker grid) and the Confirm step, and share with the user.

- [ ] **Step 6: Commit any CSS**

```bash
git add client/src/v2/styles/forge.css
git commit -m "style(v2): tidy support loadout module rows"
```

(Skip the commit if Step 4 was not needed.)

---

## Self-Review notes

- **Spec coverage:** Task 1 → data layer (catalog + lookups + rebuilt rosters); Task 2 → module blurbs; Task 3 → wizard steps/state/submit + flat-pick removal; Task 4 → testing + optional CSS. All spec sections mapped.
- **Type consistency:** `template` (string id) is used consistently across `WizardState`, init, kind-change, step bodies, `unitName`, and `submit`. `templateById`/`templatesForKind`/`SUPPORT_TEMPLATES`/`MODULE_BLURB`/`MODULES` are all defined before use.
- **Roster-equivalence guard:** Task 1 Step 1 pins `SUPPORT_UNITS`/`SEED_SUPPORT` deep-equality so the refactor cannot silently drift; `npm test` (Step 5) proves seed/add consumers are unaffected.
