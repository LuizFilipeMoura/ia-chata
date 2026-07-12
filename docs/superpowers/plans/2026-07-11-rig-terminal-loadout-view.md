# Rig Terminal Loadout View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Status` ⇄ `Loadout` toggle to the rig control terminal so a player can inspect any rig's weapon stats, chosen upgrades, and equipment mid-battle.

**Architecture:** Enrich the existing `buildLoadout()` view-model (client/src/lib/loadout.ts) with per-weapon base stats + upgrade deltas sourced from `shared/game-state.js`; render a new presentational `LoadoutView` component; add a two-view toggle inside `RigTerminal` that swaps the existing Status stack for the loadout card. No server changes.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library, plain CSS with V2 design tokens.

---

## Background (read before starting)

- The rig terminal is `client/src/v2/overlays/RigTerminal.tsx`. Today its body is a
  fixed stack: header, modifier chips, component SP rows (`CompRow`), a `HeatGauge`,
  the `ActionConsole` (when the battle is started), and an activation control. It
  shows weapon *names* only, in the subheader.
- `buildLoadout(rig)` in `client/src/lib/loadout.ts` already resolves weapon names,
  the chosen upgrade's name/tag, and the equipment's passive/active. It returns
  `null` when a rig carries no weapons. **Rigs** carry `lr` + `melee`; **flat-pick**
  kinds (Tank/Walker) carry a single `unit` weapon and no equipment.
- `shared/game-state.js` exports the data we need:
  - `WEAPONS.longRange[name]` / `WEAPONS.melee[name]` — base `{ rof, str, sweet,
    minRange, maxRange, perks? }` (ranged) or `{ rof, str, acc, rng:[min,max],
    melee:true }` (melee).
  - `UNIT_WEAPONS[name]` — same shape, for flat-pick weapons.
  - `WEAPON_UPGRADES[name]` — array of `{ id, nature, name, tag, effect }`.
  - `effectiveWeaponProfile(slot, weaponName, rig)` — returns the merged profile
    including `perks` (base + upgrade perks) and `upgradeEffect` (the raw
    `{ rof?, str?, range?, perks? }` deltas). For `slot === "unit"` it returns
    `upgradeEffect: {}`.
- Display glyph/nature helpers live in `client/src/v2/lib/commissionData.ts`:
  `weaponGlyph(name)` and `natureLabel(nature)` (`field`→"Standard",
  `tuned`→"Machined", `prototype`→"Prototype"). Keep these in the v2 layer — the
  `client/src/lib` view-model must NOT import from `client/src/v2` (wrong layering),
  so glyph/nature resolution happens in the component, not the view-model.
- Run tests with: `npx vitest run <path>` (single file) from the repo root.
- V2 CSS is scoped under `.v2-root`; tokens are in `client/src/v2/styles/tokens.css`
  (`--v2-ok` is the green, `--v2-txt-dim` muted text, `--v2-mono`/`--v2-disp` fonts,
  `--v2-line` borders, `--v2-iron-850` chip fill, `--v2-well` inset wells).

## File Structure

- **Modify** `client/src/lib/loadout.ts` — extend `LoadoutWeapon` with stats/deltas;
  change the private `weapon()` helper to take `(rig, slot)` and compute them.
- **Modify** `client/src/lib/loadout.test.ts` — add a test for the new stat/delta
  fields.
- **Create** `client/src/v2/components/LoadoutView.tsx` — presentational card that
  renders the enriched loadout (weapon blocks + equipment block).
- **Create** `client/src/v2/components/LoadoutView.test.tsx` — component tests.
- **Modify** `client/src/v2/overlays/RigTerminal.tsx` — add the Status/Loadout tab
  state and swap the body.
- **Modify** `client/src/v2/overlays/RigTerminal.test.tsx` — add toggle tests.
- **Modify** `client/src/v2/styles/rig-terminal.css` — tab + card styles.

---

## Task 1: Enrich the loadout view-model

**Files:**
- Modify: `client/src/lib/loadout.ts`
- Test: `client/src/lib/loadout.test.ts`

- [ ] **Step 1: Add the failing test**

Append this test inside the existing `describe("buildLoadout", …)` block in
`client/src/lib/loadout.test.ts` (after the "resolves weapon names…" test):

```ts
  it("carries base weapon stats and upgrade deltas", () => {
    const rig = baseRig({
      weapons: { longRange: "Autocannon", melee: "Claw" },
      weaponUpgrades: { longRange: "depleted-core", melee: "vice-grip" },
      equipment: null,
    });
    const lo = buildLoadout(rig)!;
    // Autocannon: base ROF 4 / STR 8, range 0–26"; Depleted Core is +2 STR.
    expect(lo.lr!.rof).toEqual({ base: 4, delta: 0 });
    expect(lo.lr!.str).toEqual({ base: 8, delta: 2 });
    expect(lo.lr!.range.text).toBe('0–26"');
    expect(lo.lr!.upNature).toBe("field");
    // Claw: base STR 8, melee reach 2"; Vice Grip adds the Impale perk (no numeric delta).
    expect(lo.melee!.melee).toBe(true);
    expect(lo.melee!.str).toEqual({ base: 8, delta: 0 });
    expect(lo.melee!.range.text).toBe('RNG 2"');
    expect(lo.melee!.addedPerks).toContain("Impale");
  });
```

Note: the `–` in `0–26"` is an en-dash (U+2013), matching the commission wizard.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/lib/loadout.test.ts`
Expected: FAIL — `lo.lr.rof` is `undefined` (property does not exist yet).

- [ ] **Step 3: Update the imports and `LoadoutWeapon` interface**

In `client/src/lib/loadout.ts`, replace the first import line and the
`LoadoutWeapon` interface.

Replace:

```ts
import { EQUIPMENT, WEAPON_UPGRADES, CHASSIS, randomEquipment } from "/shared/game-state.js";
import type { Rig } from "../state/types";

export interface LoadoutWeapon { name: string; upName: string; upTag: string; }
```

with:

```ts
import {
  EQUIPMENT, WEAPON_UPGRADES, CHASSIS, randomEquipment,
  WEAPONS, UNIT_WEAPONS, effectiveWeaponProfile,
} from "/shared/game-state.js";
import type { Rig } from "../state/types";

type Slot = "longRange" | "melee" | "unit";

export interface LoadoutWeapon {
  slot: Slot;
  name: string;
  melee: boolean;
  rof: { base: number; delta: number };
  str: { base: number; delta: number };
  range: { text: string; delta: number };
  perks: string[];       // base perks
  addedPerks: string[];  // perks added by the upgrade (rendered green)
  upName: string;        // "" when no/unknown upgrade
  upTag: string;
  upNature: string;      // "" when no/unknown upgrade
}
```

- [ ] **Step 4: Replace the `weapon()` helper**

Replace the whole `weapon()` function:

```ts
function weapon(name: string | undefined, upId: string | undefined): LoadoutWeapon {
  const up = (WEAPON_UPGRADES[name as string] || []).find((u: { id: string }) => u.id === upId);
  return { name: name || "", upName: up?.name || "", upTag: up?.tag || "" };
}
```

with:

```ts
// Resolve one weapon slot into display-ready base stats + upgrade deltas.
// Base numbers come straight from the weapon table; deltas from the chosen
// upgrade's `effect`; the merged perk list (for `addedPerks`) from
// `effectiveWeaponProfile`. Unknown weapon/upgrade names degrade to zeros/"".
function weapon(rig: Rig, slot: Slot): LoadoutWeapon {
  const name = (rig.weapons as Record<string, string | undefined>)?.[slot] || "";
  const table = slot === "unit" ? UNIT_WEAPONS : WEAPONS[slot];
  const base = table?.[name];
  const prof = base ? effectiveWeaponProfile(slot, name, rig) : null;
  const effect = prof?.upgradeEffect || {};
  const up = slot === "unit"
    ? null
    : (WEAPON_UPGRADES[name] || []).find(
        (u: { id: string }) => u.id === rig.weaponUpgrades?.[slot as "longRange" | "melee"],
      );
  const isMelee = !!base?.melee;
  const rangeText = isMelee
    ? `RNG ${base?.rng?.[0] ?? 0}"`
    : `${base?.minRange ?? 0}–${base?.maxRange ?? 0}"`;
  const basePerks: string[] = base?.perks || [];
  const effPerks: string[] = prof?.perks || basePerks;
  const addedPerks = effPerks.filter((p: string) => !basePerks.includes(p));
  return {
    slot,
    name,
    melee: isMelee,
    rof: { base: base?.rof ?? 0, delta: effect.rof || 0 },
    str: { base: base?.str ?? 0, delta: effect.str || 0 },
    range: { text: rangeText, delta: effect.range || 0 },
    perks: basePerks,
    addedPerks,
    upName: up?.name || "",
    upTag: up?.tag || "",
    upNature: up?.nature || "",
  };
}
```

- [ ] **Step 5: Update the three `weapon()` call sites in `buildLoadout`**

In `buildLoadout`, replace:

```ts
  // Cold kinds (Tank / Walker) store a single flat-pick weapon under `unit`.
  if (rig.weapons.unit) {
    return { flat: true, unit: weapon(rig.weapons.unit, undefined), equipment };
  }
  return {
    flat: false,
    lr: weapon(rig.weapons.longRange, rig.weaponUpgrades?.longRange),
    melee: weapon(rig.weapons.melee, rig.weaponUpgrades?.melee),
    equipment,
  };
```

with:

```ts
  // Cold kinds (Tank / Walker) store a single flat-pick weapon under `unit`.
  if (rig.weapons.unit) {
    return { flat: true, unit: weapon(rig, "unit"), equipment };
  }
  return {
    flat: false,
    lr: weapon(rig, "longRange"),
    melee: weapon(rig, "melee"),
    equipment,
  };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run client/src/lib/loadout.test.ts`
Expected: PASS — all tests, including the pre-existing "resolves weapon names…"
and "degrades gracefully…" cases (still non-breaking: `name`/`upName`/`upTag`
remain).

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/loadout.ts client/src/lib/loadout.test.ts
git commit -m "feat(v2): enrich loadout view-model with weapon stats + upgrade deltas"
```

---

## Task 2: LoadoutView component

**Files:**
- Create: `client/src/v2/components/LoadoutView.tsx`
- Test: `client/src/v2/components/LoadoutView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/components/LoadoutView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { LoadoutView } from "./LoadoutView";
import { buildLoadout } from "../../lib/loadout";
import type { Rig } from "../../state/types";

const base = (over: Partial<Rig>): Rig => ({
  id: 1, name: "STALKER", owner: "a", weightClass: "medium",
  hull: { sp: 7, max: 7, destroyed: false },
  arms: { sp: 6, max: 6, destroyed: false },
  legs: { sp: 6, max: 6, destroyed: false },
  engine: { sp: 5, max: 5, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, ...over,
});

test("shows weapon names, base stats, upgrade delta and equipment", () => {
  const rig = base({
    weapons: { longRange: "Autocannon", melee: "Claw" },
    weaponUpgrades: { longRange: "depleted-core", melee: "vice-grip" },
    equipment: "ablative-plating",
  });
  render(<LoadoutView loadout={buildLoadout(rig)!} />);
  expect(screen.getByText("Autocannon")).toBeInTheDocument();
  expect(screen.getByText("Claw")).toBeInTheDocument();
  expect(screen.getByText("+2")).toBeInTheDocument();                  // STR delta mark
  expect(screen.getByText(/Depleted Core/)).toBeInTheDocument();       // upgrade name
  expect(screen.getByText(/Ablative Plating/)).toBeInTheDocument();
  expect(screen.getByText(/\+1 max SP to Hull/)).toBeInTheDocument();  // passive
  expect(screen.getByText(/Harden/)).toBeInTheDocument();              // active
});

test("flat-pick weapon: one block, no upgrade line, no equipment", () => {
  const tank = base({ kind: "tank", weapons: { unit: "Tank Cannon" }, equipment: null });
  render(<LoadoutView loadout={buildLoadout(tank)!} />);
  expect(screen.getByText("Tank Cannon")).toBeInTheDocument();
  expect(screen.queryByText(/⬡/)).not.toBeInTheDocument();      // no upgrade line
  expect(screen.queryByText(/Passive —/)).not.toBeInTheDocument(); // no equipment
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/v2/components/LoadoutView.test.tsx`
Expected: FAIL — cannot resolve `./LoadoutView` (module does not exist).

- [ ] **Step 3: Write the component**

Create `client/src/v2/components/LoadoutView.tsx`:

```tsx
import "../styles/rig-terminal.css";
import { weaponGlyph, natureLabel } from "../lib/commissionData";
import type { Loadout, LoadoutWeapon } from "../../lib/loadout";

// One base stat term, with an optional green "+N" upgrade mark beside it.
function Stat({ label, base, delta }: { label: string; base: number | string; delta: number }) {
  return (
    <span className="v2-rt-lo-stat">
      <em className="v2-eyebrow">{label}</em> {base}
      {delta ? <span className="v2-rt-delta">+{delta}</span> : null}
    </span>
  );
}

function WeaponBlock({ w }: { w: LoadoutWeapon }) {
  return (
    <div className="v2-rt-lo-weapon">
      <div className="v2-rt-lo-weapon-head">
        <span className="v2-rt-lo-glyph" aria-hidden="true">{weaponGlyph(w.name)}</span>
        <span className="v2-rt-lo-name v2-title">{w.name}</span>
      </div>
      <div className="v2-rt-lo-stats">
        <Stat label="ROF" base={w.rof.base} delta={w.rof.delta} />
        <Stat label="STR" base={w.str.base} delta={w.str.delta} />
        <span className="v2-rt-lo-stat">
          <em className="v2-eyebrow">{w.melee ? "RNG" : "RANGE"}</em>{" "}
          {w.range.text.replace(/^RNG /, "")}
          {w.range.delta ? <span className="v2-rt-delta">+{w.range.delta}</span> : null}
        </span>
      </div>
      {(w.perks.length > 0 || w.addedPerks.length > 0) && (
        <div className="v2-rt-lo-perks">
          {w.perks.map((p) => <span key={p} className="v2-rt-lo-perk">{p}</span>)}
          {w.addedPerks.map((p) => <span key={p} className="v2-rt-lo-perk is-added">{p}</span>)}
        </div>
      )}
      {w.upName && (
        <div className="v2-rt-lo-up">
          <span className="v2-rt-lo-up-name">⬡ {w.upName}</span>
          {w.upNature && <span className="v2-rt-lo-up-nature v2-eyebrow">{natureLabel(w.upNature)}</span>}
          {w.upTag && <span className="v2-rt-lo-up-tag">{w.upTag}</span>}
        </div>
      )}
    </div>
  );
}

export function LoadoutView({ loadout }: { loadout: Loadout }) {
  const eq = loadout.equipment;
  return (
    <div className="v2-rt-lo">
      {loadout.flat
        ? loadout.unit && <WeaponBlock w={loadout.unit} />
        : (
          <>
            {loadout.lr && <WeaponBlock w={loadout.lr} />}
            {loadout.melee && <WeaponBlock w={loadout.melee} />}
          </>
        )}
      {eq && (
        <div className="v2-rt-lo-equip">
          <div className="v2-rt-lo-equip-head">
            <span aria-hidden="true">🛠</span>
            <span className="v2-rt-lo-name v2-title">{eq.label}</span>
            <span className="v2-rt-lo-equip-family v2-eyebrow">{eq.family}</span>
          </div>
          <div className="v2-rt-lo-equip-line">Passive — {eq.passive}</div>
          <div className="v2-rt-lo-equip-line">
            Active — {eq.activeLabel} ({eq.activeHeat >= 0 ? "+" : ""}{eq.activeHeat} heat): {eq.activeText}
          </div>
        </div>
      )}
    </div>
  );
}
```

Note on the range stat: the view-model stores melee reach as `"RNG 2\""`, so the
block strips the leading `RNG ` and relabels via the `<em>` for a consistent
`LABEL value` layout across weapons. The `getByText("+2")` in the test matches the
STR mark because the `+N` mark is the span's entire text (the space sits outside).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run client/src/v2/components/LoadoutView.test.tsx`
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/components/LoadoutView.tsx client/src/v2/components/LoadoutView.test.tsx
git commit -m "feat(v2): add LoadoutView card (weapon stats, upgrades, equipment)"
```

---

## Task 3: Status/Loadout toggle in RigTerminal

**Files:**
- Modify: `client/src/v2/overlays/RigTerminal.tsx`
- Test: `client/src/v2/overlays/RigTerminal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `client/src/v2/overlays/RigTerminal.test.tsx` (the shared `rig` at the
top of that file already has `weapons`, so `buildLoadout` returns non-null and the
tabs render):

```ts
test("defaults to the Status view with component rows visible", () => {
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started mine myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Hull")).toBeInTheDocument();
});

test("Loadout tab swaps in the loadout card; Status restores the rows", async () => {
  const user = userEvent.setup();
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started mine myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  await user.click(screen.getByRole("tab", { name: "Loadout" }));
  expect(screen.getByText("Autocannon")).toBeInTheDocument();
  expect(screen.queryByText("Hull")).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Status" }));
  expect(screen.getByText("Hull")).toBeInTheDocument();
});

test("enemy rig still exposes the Loadout tab", async () => {
  const user = userEvent.setup();
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started mine={false} myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  await user.click(screen.getByRole("tab", { name: "Loadout" }));
  expect(screen.getByText("Autocannon")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client/src/v2/overlays/RigTerminal.test.tsx`
Expected: FAIL — no `tab` role element named "Status"/"Loadout" exists yet.

- [ ] **Step 3: Add the imports, state, and toggle**

In `client/src/v2/overlays/RigTerminal.tsx`:

Add `useState` to the React import and add the `LoadoutView` import. Change:

```ts
import { useEffect, type ReactNode } from "react";
```

to:

```ts
import { useEffect, useState, type ReactNode } from "react";
```

and add, next to the other component imports:

```ts
import { LoadoutView } from "../components/LoadoutView";
```

Inside the component body, add the view state right after the existing
`const lo = buildLoadout(rig);` line:

```ts
  const [view, setView] = useState<"status" | "loadout">("status");
```

- [ ] **Step 4: Swap the body on the toggle**

In the returned JSX, replace this block:

```tsx
        <div className="v2-rt-comps">
          {locs.map((loc) => {
            const comp = (rig as unknown as Record<string, Component>)[loc];
            if (!comp) return null;
            return <CompRow key={loc} rigName={rig.name} loc={loc} comp={comp} onCommand={onCommand} />;
          })}
        </div>

        {!cold && <HeatGauge rig={rig} />}

        {started && <ActionConsole rig={rig} />}

        {activation && <div className="v2-rt-actions">{activation}</div>}
```

with:

```tsx
        {lo && (
          <div className="v2-rt-tabs" role="tablist" aria-label="Terminal view">
            <button type="button" role="tab" aria-selected={view === "status"}
              className={"v2-rt-tab" + (view === "status" ? " is-on" : "")}
              onClick={() => setView("status")}>Status</button>
            <button type="button" role="tab" aria-selected={view === "loadout"}
              className={"v2-rt-tab" + (view === "loadout" ? " is-on" : "")}
              onClick={() => setView("loadout")}>Loadout</button>
          </div>
        )}

        {view === "loadout" && lo ? (
          <LoadoutView loadout={lo} />
        ) : (
          <>
            <div className="v2-rt-comps">
              {locs.map((loc) => {
                const comp = (rig as unknown as Record<string, Component>)[loc];
                if (!comp) return null;
                return <CompRow key={loc} rigName={rig.name} loc={loc} comp={comp} onCommand={onCommand} />;
              })}
            </div>

            {!cold && <HeatGauge rig={rig} />}

            {started && <ActionConsole rig={rig} />}

            {activation && <div className="v2-rt-actions">{activation}</div>}
          </>
        )}
```

Rationale: when `lo` is `null` (a minimal rig with no weapons), no tablist renders
and `view` stays `"status"`, so the body is exactly today's stack — non-breaking.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run client/src/v2/overlays/RigTerminal.test.tsx`
Expected: PASS — new toggle tests plus all pre-existing tests (they assert on the
default Status view).

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/overlays/RigTerminal.tsx client/src/v2/overlays/RigTerminal.test.tsx
git commit -m "feat(v2): add Status/Loadout toggle to the rig terminal"
```

---

## Task 4: Style the tabs and card, then verify live

**Files:**
- Modify: `client/src/v2/styles/rig-terminal.css`

- [ ] **Step 1: Append the styles**

Add to the end of `client/src/v2/styles/rig-terminal.css`:

```css
/* --- Status / Loadout toggle ------------------------------------------- */
.v2-root .v2-rt-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px 0;
}
.v2-root .v2-rt-tab {
  flex: 1;
  padding: 7px 10px;
  font-family: var(--v2-mono);
  font-size: var(--v2-text-sm);
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--v2-txt-dim);
  background: var(--v2-iron-850);
  border: 1px solid var(--v2-line);
  cursor: pointer;
}
.v2-root .v2-rt-tab.is-on {
  color: var(--v2-ok);
  border-color: var(--v2-ok);
  background: var(--v2-ok-wash);
}

/* --- Loadout card ------------------------------------------------------- */
.v2-root .v2-rt-lo {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.v2-root .v2-rt-lo-weapon,
.v2-root .v2-rt-lo-equip {
  padding: 12px 14px;
  background: var(--v2-well);
  border: 1px solid var(--v2-line);
}
.v2-root .v2-rt-lo-weapon-head,
.v2-root .v2-rt-lo-equip-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.v2-root .v2-rt-lo-glyph { font-size: 1.1em; }
.v2-root .v2-rt-lo-name { font-size: var(--v2-text-md); }
.v2-root .v2-rt-lo-equip-family { color: var(--v2-txt-dim); margin-left: auto; }
.v2-root .v2-rt-lo-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-family: var(--v2-mono);
  font-size: var(--v2-text-sm);
}
.v2-root .v2-rt-lo-stat em { color: var(--v2-txt-dim); margin-right: 4px; font-style: normal; }
.v2-root .v2-rt-delta { color: var(--v2-ok); margin-left: 3px; font-weight: 700; }
.v2-root .v2-rt-lo-perks { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.v2-root .v2-rt-lo-perk {
  font-family: var(--v2-mono);
  font-size: var(--v2-text-xs, var(--v2-text-sm));
  letter-spacing: .06em;
  padding: 2px 7px;
  border: 1px solid var(--v2-line);
  color: var(--v2-txt-dim);
}
.v2-root .v2-rt-lo-perk.is-added { color: var(--v2-ok); border-color: var(--v2-ok); }
.v2-root .v2-rt-lo-up {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--v2-line);
}
.v2-root .v2-rt-lo-up-name { font-family: var(--v2-disp); letter-spacing: .04em; }
.v2-root .v2-rt-lo-up-nature { color: var(--v2-txt-dim); }
.v2-root .v2-rt-lo-up-tag {
  flex-basis: 100%;
  font-size: var(--v2-text-sm);
  color: var(--v2-txt-dim);
}
.v2-root .v2-rt-lo-equip-line {
  font-size: var(--v2-text-sm);
  color: var(--v2-txt-dim);
  margin-top: 4px;
}
```

If `--v2-text-md` or `--v2-text-xs` are absent in `tokens.css`, the `var(…, fallback)`
already covers `-xs`; for `-md` grep `tokens.css` and substitute the nearest
existing size token (e.g. `--v2-text-sm`).

- [ ] **Step 2: Run the full V2 test suite to confirm nothing regressed**

Run: `npx vitest run client/src/v2 client/src/lib/loadout.test.ts`
Expected: PASS — no failures.

- [ ] **Step 3: Verify live in the seeded app**

The dev server (vite :5173 + node :8000) is running with a seeded 3v3 battle.
In the browser preview, open rig **A1**'s terminal, then:

1. `read_page` the open dialog — confirm a `tab` "Status" (selected) and a `tab`
   "Loadout" appear under the header.
2. Click the **Loadout** tab; `read_page` again — confirm the weapon name
   (e.g. "Mortar"), a `ROF/STR/RANGE` stat row, and the equipment `Passive —` /
   `Active —` lines are present, and that the `Hull/Arms/Legs/Engine` rows are gone.
3. Click **Status**; confirm the component rows and action console return.

(Screenshots of this terminal hang on its ember/lamp animations — verify via the
`read_page` accessibility tree, not a screenshot.)

- [ ] **Step 4: Commit**

```bash
git add client/src/v2/styles/rig-terminal.css
git commit -m "feat(v2): style the rig terminal loadout card + tabs"
```

---

## Self-review notes

- **Spec coverage:** view-model enrichment (Task 1) → §Design 1; card (Task 2) →
  §Design 2; toggle placement (Task 3) → §Design 3; styling (Task 4) → §Design 4;
  tests spread across Tasks 1–3 → §Design 5. Base+green-delta stat basis → Task 2
  `Stat`/`v2-rt-delta`. Enemy symmetry → Task 3 enemy test. Flat-pick handling →
  Tasks 1 & 2 flat-pick tests.
- **Non-breaking:** `LoadoutWeapon` keeps `name`/`upName`/`upTag`, so the existing
  loadout tests and the terminal subheader `loadoutText` keep working.
- **Naming consistency:** `LoadoutView` (component), `v2-rt-lo*` (card classes),
  `v2-rt-tab`/`v2-rt-tabs` (toggle), `v2-rt-delta` (green mark) used identically in
  component and CSS.
```
