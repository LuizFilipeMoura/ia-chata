# Commission Wizard Upgrade Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the rig commission flow so choosing a chassis and tuning its upgrades are separate steps, and replace the cramped three-node upgrade rows with a reusable `UpgradeLadder` (volatility slider → Payoff | Catch panel) used for both weapons and equipment.

**Architecture:** A new presentational `UpgradeLadder` component renders one upgrade track from the existing `{id, nature, name, tag, catch?}` data. Pure helpers in `commissionData.ts` derive reward/risk pip counts (from `nature`) and split a tier into Payoff/Catch text (authored `catch` field, or tag-parse fallback). `CommissionWizard` gains a `Weapons` step and stops unfolding the upgrade bay inside the `Chassis` step. An optional additive `catch` field is authored onto the upgrade data. No server/command changes.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react (`npm test` runs `vitest run` then node's test runner over `shared/**` and `server/**`). Styling via existing `client/src/v2/styles/forge.css` and design tokens in `tokens.css` (`--v2-ok` green, `--v2-oil` amber, `--v2-ember` red).

---

## File Structure

- `client/src/v2/lib/commissionData.ts` — add `upgradePips(nature)` and `splitUpgradeTag(tier)` pure helpers (unit tested). Existing exports unchanged.
- `client/src/v2/overlays/UpgradeLadder.tsx` *(new)* — the slider + Payoff/Catch component. One responsibility: render one upgrade track and report selection.
- `client/src/v2/overlays/CommissionWizard.tsx` — restructure rig steps; consume `UpgradeLadder`; delete inline `upgradeBay`/`upgradePath` helpers.
- `client/src/v2/styles/forge.css` — add `.v2-ul-*` rules; remove dead `.v2-fc-bay`, `.v2-fc-weapon*`, `.v2-fc-path`, `.v2-fc-node*`, `.v2-fc-warn` rules.
- `shared/game-state.js` — author optional `catch` strings on Prototype rows (and Tuned rows that carry a real cost). Data-only, additive.

Nature → token map used throughout: `field → --v2-ok` (green/safe), `tuned → --v2-oil` (amber), `prototype → --v2-ember` (red/volatile).

---

## Task 1: Pip + Payoff/Catch helpers

**Files:**
- Modify: `client/src/v2/lib/commissionData.ts`
- Test: `client/src/v2/lib/commissionData.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `client/src/v2/lib/commissionData.test.ts`:

```ts
import { upgradePips, splitUpgradeTag } from "./commissionData";

test("upgradePips climbs reward and risk by nature", () => {
  expect(upgradePips("field")).toEqual({ reward: 1, risk: 0 });
  expect(upgradePips("tuned")).toEqual({ reward: 2, risk: 1 });
  expect(upgradePips("prototype")).toEqual({ reward: 3, risk: 2 });
  expect(upgradePips("bogus")).toEqual({ reward: 1, risk: 0 });
});

test("splitUpgradeTag prefers an authored catch", () => {
  const t = { id: "x", nature: "prototype", name: "N", tag: "Big payoff", catch: "Real cost" };
  expect(splitUpgradeTag(t)).toEqual({ payoff: "Big payoff", catch: "Real cost" });
});

test("splitUpgradeTag parses a delimited tag when no catch is authored", () => {
  const semi = { id: "a", nature: "prototype", name: "N", tag: "Ignores armour; belt cycles slow after" };
  expect(splitUpgradeTag(semi)).toEqual({ payoff: "Ignores armour", catch: "belt cycles slow after" });
  const dash = { id: "b", nature: "prototype", name: "N", tag: "Reel a rig in — runs hot" };
  expect(splitUpgradeTag(dash)).toEqual({ payoff: "Reel a rig in", catch: "runs hot" });
});

test("splitUpgradeTag reports no catch for a clean safe upgrade", () => {
  const t = { id: "c", nature: "field", name: "N", tag: "+2 STR" };
  expect(splitUpgradeTag(t)).toEqual({ payoff: "+2 STR", catch: null });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/v2/lib/commissionData.test.ts`
Expected: FAIL — `upgradePips is not a function` / `splitUpgradeTag is not a function`.

- [ ] **Step 3: Implement the helpers**

Append to `client/src/v2/lib/commissionData.ts`:

```ts
export interface UpgradeTier {
  id: string;
  nature: string;
  name: string;
  tag: string;
  catch?: string;
  effect?: unknown;
}

// Reward/risk climb the tier ladder. Derived purely from nature so no upgrade
// row needs to carry pip counts.
const PIPS: Record<string, { reward: number; risk: number }> = {
  field: { reward: 1, risk: 0 },
  tuned: { reward: 2, risk: 1 },
  prototype: { reward: 3, risk: 2 },
};
export function upgradePips(nature: string): { reward: number; risk: number } {
  return PIPS[nature] || PIPS.field;
}

// Payoff vs Catch text for a tier. Prefer an authored `catch`; otherwise split
// the tag on the first cost delimiter (" — " or ";"). A tag with no delimiter is
// all payoff and has no catch.
export function splitUpgradeTag(tier: UpgradeTier): { payoff: string; catch: string | null } {
  if (tier.catch) return { payoff: tier.tag, catch: tier.catch };
  const m = tier.tag.match(/^(.*?)(?:\s+—\s+|;\s+)(.*)$/);
  if (m) return { payoff: m[1].trim(), catch: m[2].trim() };
  return { payoff: tier.tag, catch: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/v2/lib/commissionData.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/lib/commissionData.ts client/src/v2/lib/commissionData.test.ts
git commit -m "feat(v2): pip + payoff/catch helpers for upgrade ladder"
```

---

## Task 2: `UpgradeLadder` component

**Files:**
- Create: `client/src/v2/overlays/UpgradeLadder.tsx`
- Test: `client/src/v2/overlays/UpgradeLadder.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/overlays/UpgradeLadder.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { UpgradeLadder } from "./UpgradeLadder";
import type { UpgradeTier } from "../lib/commissionData";

const TIERS: UpgradeTier[] = [
  { id: "dep", nature: "field", name: "Depleted Core", tag: "+2 STR" },
  { id: "ap", nature: "tuned", name: "AP Shells", tag: "Gains Armour Piercing" },
  { id: "pen", nature: "prototype", name: "Penetrator", tag: "Every 3rd volley ignores armour; belt cycles slow after" },
];

test("selecting a segment reports its upgrade id", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<UpgradeLadder title="Autocannon" tiers={TIERS} selected="dep" onSelect={onSelect} lockPrototype={false} />);
  await user.click(screen.getByRole("button", { name: /Machined/i }));
  expect(onSelect).toHaveBeenCalledWith("ap");
});

test("selected prototype shows payoff, catch and the gate badge", () => {
  render(<UpgradeLadder title="Autocannon" tiers={TIERS} selected="pen" onSelect={vi.fn()} lockPrototype={false} />);
  expect(screen.getByText(/Every 3rd volley ignores armour/)).toBeInTheDocument();
  expect(screen.getByText(/belt cycles slow after/)).toBeInTheDocument();
  expect(screen.getByText(/1 per rig/i)).toBeInTheDocument();
});

test("a safe tier reports no catch", () => {
  render(<UpgradeLadder title="Autocannon" tiers={TIERS} selected="dep" onSelect={vi.fn()} lockPrototype={false} />);
  expect(screen.getByText(/None — dependable/i)).toBeInTheDocument();
});

test("locking the prototype disables its segment", () => {
  render(<UpgradeLadder title="Autocannon" tiers={TIERS} selected="dep" onSelect={vi.fn()} lockPrototype />);
  expect(screen.getByRole("button", { name: /Prototype/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/overlays/UpgradeLadder.test.tsx`
Expected: FAIL — cannot resolve `./UpgradeLadder`.

- [ ] **Step 3: Implement the component**

Create `client/src/v2/overlays/UpgradeLadder.tsx`:

```tsx
import { natureLabel, upgradePips, splitUpgradeTag, type UpgradeTier } from "../lib/commissionData";

interface UpgradeLadderProps {
  title: string;
  subtitle?: string;
  glyph?: string;
  tiers: UpgradeTier[];
  selected: string | null;
  onSelect: (id: string) => void;
  lockPrototype: boolean;
}

function pips(kind: "rwd" | "rsk", n: number) {
  return Array.from({ length: 3 }, (_, i) => (
    <span key={i} className={"v2-ul-pip" + (i < n ? " on-" + kind : "")} />
  ));
}

export function UpgradeLadder({ title, subtitle, glyph, tiers, selected, onSelect, lockPrototype }: UpgradeLadderProps) {
  const current = tiers.find((t) => t.id === selected) || tiers[0];
  const { payoff, catch: risk } = splitUpgradeTag(current);
  const { reward, risk: riskPips } = upgradePips(current.nature);
  const isProto = current.nature === "prototype";

  return (
    <div className="v2-ul">
      <div className="v2-ul-head">
        {glyph ? <span className="v2-ul-glyph">{glyph}</span> : null}
        <span className="v2-ul-title v2-title">{title}</span>
        {subtitle ? <small className="v2-ul-sub">{subtitle}</small> : null}
      </div>

      <div className="v2-ul-scale v2-eyebrow"><span>◂ safe</span><span>volatile ▸</span></div>
      <div className="v2-ul-seg" role="group">
        {tiers.map((t, i) => {
          const locked = t.nature === "prototype" && lockPrototype && t.id !== selected;
          const on = t.id === current.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={locked}
              data-nature={t.nature}
              className={"v2-ul-tab nat-" + t.nature + (on ? " on" : "") + (locked ? " locked" : "")}
              title={locked ? "A rig may run at most one Prototype upgrade" : t.tag}
              onClick={() => !locked && onSelect(t.id)}
            >
              <span className="v2-ul-tab-n">{["I", "II", "III"][i]}</span>
              <span className="v2-ul-tab-k">{locked ? "🔒 spent" : natureLabel(t.nature)}</span>
            </button>
          );
        })}
      </div>

      <div className={"v2-ul-panel nat-" + current.nature}>
        <div className="v2-ul-panel-hd">
          <b className="v2-title">{current.name}</b>
          {isProto ? <span className="v2-ul-gate v2-eyebrow">1 per rig</span> : null}
        </div>
        <div className="v2-ul-cols">
          <div className="v2-ul-col v2-ul-pay">
            <div className="v2-ul-col-hd v2-eyebrow">Payoff <span className="v2-ul-meter">{pips("rwd", reward)}</span></div>
            {payoff}
          </div>
          <div className="v2-ul-col v2-ul-catch">
            <div className="v2-ul-col-hd v2-eyebrow">Catch {risk ? <span className="v2-ul-meter">{pips("rsk", riskPips)}</span> : null}</div>
            {risk ? <span>⚠ {risk}</span> : <span className="v2-ul-none">None — dependable.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/overlays/UpgradeLadder.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/overlays/UpgradeLadder.tsx client/src/v2/overlays/UpgradeLadder.test.tsx
git commit -m "feat(v2): UpgradeLadder slider + payoff/catch component"
```

---

## Task 3: Ladder styles; remove dead bay/node CSS

**Files:**
- Modify: `client/src/v2/styles/forge.css`

- [ ] **Step 1: Add the ladder styles**

Append to `client/src/v2/styles/forge.css`:

```css
/* Upgrade ladder — volatility slider + payoff/catch panel */
.v2-root .v2-ul { padding: 14px 15px; }
.v2-root .v2-ul + .v2-ul { border-top: 1px solid var(--v2-line-soft); }
.v2-root .v2-ul-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.v2-root .v2-ul-title { font-size: var(--v2-text-base); }
.v2-root .v2-ul-sub { font-family: var(--v2-mono); font-size: var(--v2-text-sm); letter-spacing: .1em; color: var(--v2-txt-faint); }
.v2-root .v2-ul-scale { display: flex; justify-content: space-between; color: var(--v2-txt-faint); margin-bottom: 3px; }

.v2-root .v2-ul-seg { display: flex; border: 1px solid var(--v2-line); border-radius: 6px; overflow: hidden; }
.v2-root .v2-ul-tab {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 7px 4px; background: transparent; border: 0; border-right: 1px solid var(--v2-line);
  color: var(--v2-txt-dim); cursor: pointer;
}
.v2-root .v2-ul-tab:last-child { border-right: 0; }
.v2-root .v2-ul-tab:hover:not(.locked) { background: rgba(255, 255, 255, .04); }
.v2-root .v2-ul-tab-n { font-family: var(--v2-mono); font-weight: 700; font-size: var(--v2-text-sm); }
.v2-root .v2-ul-tab-k { font-size: 10px; letter-spacing: .04em; opacity: .75; }
.v2-root .v2-ul-tab.locked { opacity: .4; cursor: not-allowed; }
.v2-root .v2-ul-tab.on.nat-field { background: var(--v2-ok); color: #08130c; }
.v2-root .v2-ul-tab.on.nat-tuned { background: var(--v2-oil); color: #1a0f02; }
.v2-root .v2-ul-tab.on.nat-prototype { background: var(--v2-ember); color: #fff; }

.v2-root .v2-ul-panel { margin-top: 8px; border: 1px solid var(--v2-line); border-radius: 6px; overflow: hidden; }
.v2-root .v2-ul-panel.nat-field { border-left: 3px solid var(--v2-ok); }
.v2-root .v2-ul-panel.nat-tuned { border-left: 3px solid var(--v2-oil); }
.v2-root .v2-ul-panel.nat-prototype { border-left: 3px solid var(--v2-ember); }
.v2-root .v2-ul-panel-hd { display: flex; align-items: center; gap: 8px; padding: 7px 10px; }
.v2-root .v2-ul-gate { background: var(--v2-ember-wash); color: var(--v2-ember-hi); border: 1px solid var(--v2-ember-deep); padding: 1px 5px; border-radius: 3px; }
.v2-root .v2-ul-cols { display: flex; }
.v2-root .v2-ul-col { flex: 1; padding: 9px 10px; font-size: var(--v2-text-sm); }
.v2-root .v2-ul-catch { border-left: 1px solid var(--v2-line); background: rgba(0, 0, 0, .2); }
.v2-root .v2-ul-col-hd { margin-bottom: 3px; }
.v2-root .v2-ul-pay .v2-ul-col-hd { color: var(--v2-ok); }
.v2-root .v2-ul-catch .v2-ul-col-hd { color: var(--v2-oil-hi); }
.v2-root .v2-ul-none { color: var(--v2-txt-faint); }
.v2-root .v2-ul-meter { display: inline-flex; gap: 2px; vertical-align: middle; margin-left: 4px; }
.v2-root .v2-ul-pip { width: 7px; height: 7px; border-radius: 50%; background: var(--v2-rivet); display: inline-block; }
.v2-root .v2-ul-pip.on-rwd { background: var(--v2-ok); }
.v2-root .v2-ul-pip.on-rsk { background: var(--v2-ember-hi); }
```

- [ ] **Step 2: Remove the dead bay/node rules**

Delete these now-unused rule blocks from `client/src/v2/styles/forge.css` (the inline upgrade bay is being removed in Task 4): every rule whose selector begins with `.v2-root .v2-fc-bay`, `.v2-root .v2-fc-weapon`, `.v2-root .v2-fc-path`, `.v2-root .v2-fc-node`, or `.v2-root .v2-fc-warn` (the contiguous block around lines 148–221, plus the `.v2-fc-equip-slot.is-sel .v2-fc-path` rule). Leave all other `.v2-fc-*` rules (cards, roster, equip grid, cue) intact.

- [ ] **Step 3: Verify the stylesheet still parses and nothing references removed classes**

Run: `npx vitest run client/src/v2/overlays/CommissionWizard.test.tsx`
Expected: build succeeds (tests may fail on step wording — fixed in Task 4). Then:
Run: `grep -rn "v2-fc-bay\|v2-fc-node\|v2-fc-path\|v2-fc-warn\|v2-fc-weapon" client/src`
Expected: no matches once Task 4 lands; at this point only `CommissionWizard.tsx` may still reference them.

- [ ] **Step 4: Commit**

```bash
git add client/src/v2/styles/forge.css
git commit -m "style(v2): upgrade ladder CSS; drop inline bay/node rules"
```

---

## Task 4: Restructure the wizard steps

**Files:**
- Modify: `client/src/v2/overlays/CommissionWizard.tsx`
- Test: `client/src/v2/overlays/CommissionWizard.test.tsx`

- [ ] **Step 1: Update existing tests and add step-order + gate tests**

In `client/src/v2/overlays/CommissionWizard.test.tsx`, the rig flow now has 5 steps (`Kind → Chassis → Weapons → Equipment → Confirm`), so the rig-commission test needs one more `Next`. Replace the `"commissioning a rig dispatches add"` test body's click sequence with four Nexts:

```tsx
test("commissioning a rig dispatches add with the rig field set", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  open();
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // Kind → Chassis
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // Chassis → Weapons
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // Weapons → Equipment
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // Equipment → Confirm
  await user.click(await screen.findByRole("button", { name: /Commission/i }));
  expect(sendCommand).toHaveBeenCalledWith("add", expect.objectContaining({
    kind: "rig", chassis: expect.any(String), owner: "a",
    lr: expect.any(String), melee: expect.any(String), equipment: expect.any(String),
    longRangeUpgrade: expect.any(String), meleeUpgrade: expect.any(String),
  }));
});
```

Add two new tests:

```tsx
test("rig flow shows a Weapons step between Chassis and Equipment", async () => {
  const user = userEvent.setup();
  open();
  expect(await screen.findByText("Weapons")).toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Chassis
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Weapons
  // Both weapon ladders render; each has a Prototype segment.
  expect(screen.getAllByRole("button", { name: /Prototype/i }).length).toBeGreaterThanOrEqual(2);
});

test("choosing a Prototype on one weapon locks the other weapon's Prototype", async () => {
  const user = userEvent.setup();
  open();
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Chassis
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Weapons
  const protos = screen.getAllByRole("button", { name: /Prototype/i });
  expect(protos[1]).not.toBeDisabled();
  await user.click(protos[0]);
  // After spending the prototype on the first weapon, the second weapon's is gated.
  expect(screen.getAllByRole("button", { name: /Prototype|spent/i })[1]).toBeDisabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/v2/overlays/CommissionWizard.test.tsx`
Expected: FAIL — no "Weapons" step text; rig test stops one step short.

- [ ] **Step 3: Update `stepsFor` and the header import**

In `client/src/v2/overlays/CommissionWizard.tsx`, change `stepsFor`:

```tsx
function stepsFor(kind: Kind): string[] {
  if (kind === "rig") return ["Kind", "Chassis", "Weapons", "Equipment", "Confirm"];
  return ["Kind", "Loadout", "Confirm"];
}
```

Add the component import near the other v2 imports:

```tsx
import { UpgradeLadder } from "./UpgradeLadder";
```

- [ ] **Step 4: Strip the upgrade bay out of the Chassis step**

In the `state.step === 1` rig branch, remove the `{sel ? upgradeBay() : null}` line that follows the chassis `<button>` (the card no longer unfolds a bay). Then delete the now-unused `upgradeBay` and `upgradePath` helper functions and the `NODE_MARK` import. Update the Chassis-step hint text:

```tsx
<div className="v2-fw-hint">
  Weapons and weight class are fixed by the chassis. Pick a frame — you'll tune its weapons next.
</div>
```

- [ ] **Step 5: Add the Weapons step (new `state.step === 2` for rigs)**

The rig branches shift down by one step. Insert a Weapons body and renumber the equipment/confirm branches. Replace the whole `let body …` step ladder with this structure (rig equipment moves to step 3, confirm to step 4; tank/walker keep steps 1 and 2):

```tsx
  let body: React.ReactNode;
  const weaponProto =
    upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype"
    || upgradeNature(state.melee, state.meleeUpgrade) === "prototype";
  const equipProto = equipmentUpgradeNature(state.equipment, state.equipmentUpgrade) === "prototype";

  if (state.step === 0) {
    body = ( /* …unchanged Kind body… */ );
  } else if (state.step === 1 && state.kind === "rig") {
    body = ( /* …unchanged Chassis roster body, minus upgradeBay… */ );
  } else if (state.step === 1) {
    body = ( /* …unchanged tank/walker Loadout body… */ );
  } else if (state.step === 2 && state.kind === "rig") {
    const lr = WEAPONS.longRange[state.longRange];
    const ml = WEAPONS.melee[state.melee];
    body = (
      <div className="v2-fw-body">
        <div className="v2-fc-cue">
          <span className="v2-fc-cue-lead">◈ Tune your weapons</span>
          <span className="v2-fc-cue-sub v2-eyebrow">— climb each track; one Prototype per rig</span>
        </div>
        <UpgradeLadder
          title={state.longRange}
          glyph={weaponGlyph(state.longRange)}
          subtitle={`ROF ${lr.rof} · STR ${lr.str} · ${lr.minRange}–${lr.maxRange}"`}
          tiers={WEAPON_UPGRADES[state.longRange] || []}
          selected={state.longRangeUpgrade}
          onSelect={(id) => patch({ longRangeUpgrade: id })}
          lockPrototype={
            upgradeNature(state.melee, state.meleeUpgrade) === "prototype" || equipProto
          }
        />
        <UpgradeLadder
          title={state.melee}
          glyph={weaponGlyph(state.melee)}
          subtitle={`ROF ${ml.rof} · STR ${ml.str} · RNG ${ml.rng?.[0]}/${ml.rng?.[1]}"`}
          tiers={WEAPON_UPGRADES[state.melee] || []}
          selected={state.meleeUpgrade}
          onSelect={(id) => patch({ meleeUpgrade: id })}
          lockPrototype={
            upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype" || equipProto
          }
        />
      </div>
    );
  } else if (state.step === 2) {
    body = ( /* …unchanged tank/walker Confirm body… */ );
  } else if (state.step === 3 && state.kind === "rig") {
    // Equipment step: card grid + selected card's UpgradeLadder
    body = (
      <div className="v2-fw-body">
        <div className="v2-fc-cue">
          <span className="v2-fc-cue-lead">◈ Fit equipment</span>
          <span className="v2-fc-cue-sub v2-eyebrow">— one slot per rig</span>
        </div>
        <div className="v2-fc-grid v2-grid-2">
          {Object.entries(EQUIPMENT).map(([id, e]) => {
            const suggestion = (content[state.chassis]?.suggestedEquipment || []).find((s) => s.id === id);
            const sel = id === state.equipment;
            return (
              <div key={id} className={"v2-fc-equip-slot" + (sel ? " is-sel" : "")}>
                <button
                  type="button"
                  className={"v2-fc-equip" + (sel ? " is-sel" : "") + (suggestion ? " is-suggested" : "")}
                  onClick={() => patch({ equipment: id, equipmentUpgrade: firstEquipmentUpgradeId(id) })}
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
                {sel ? (
                  <UpgradeLadder
                    title={e.label}
                    tiers={EQUIPMENT_UPGRADES[id] || []}
                    selected={state.equipmentUpgrade}
                    onSelect={(uid) => patch({ equipmentUpgrade: uid })}
                    lockPrototype={weaponProto}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  } else {
    body = ( /* …unchanged rig Confirm body (was state.step === 3)… */ );
  }
```

When filling the `/* …unchanged… */ ` slots, copy the exact JSX from the current file's corresponding branches — Kind body (lines 248–272), rig Chassis roster (275–324, dropping only the `{sel ? upgradeBay() : null}` line), tank/walker Loadout (327–365), tank/walker Confirm (420–434), and rig Confirm (436–451). Do not paraphrase them.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run client/src/v2/overlays/CommissionWizard.test.tsx`
Expected: PASS — including the two new step-order/gate tests and the updated four-Next rig test. Tank/walker tests unchanged and still pass.

- [ ] **Step 7: Verify no dead references remain**

Run: `grep -rn "upgradeBay\|upgradePath\|v2-fc-bay\|v2-fc-node\|v2-fc-path\|v2-fc-warn\|NODE_MARK" client/src`
Expected: no matches.

- [ ] **Step 8: Commit**

```bash
git add client/src/v2/overlays/CommissionWizard.tsx client/src/v2/overlays/CommissionWizard.test.tsx
git commit -m "feat(v2): split chassis pick from weapon tuning; ladder-driven upgrades"
```

---

## Task 5: Author `catch` copy on the upgrade data

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/upgrade-catch.test.js` *(new)*

The parse fallback already splits delimited tags, so this task only adds an authored `catch` where the tag has no clean delimiter (e.g. Prototypes whose downside is implied, and Tuned rows with a real cost like Extended Belt "dice showing 1 add heat"). Author the field for every `prototype` row so the Catch column never falls back to guesswork.

- [ ] **Step 1: Write the failing test**

Create `shared/upgrade-catch.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { WEAPON_UPGRADES } = require("./game-state.js");

test("every weapon Prototype row carries an authored catch", () => {
  for (const [weapon, tiers] of Object.entries(WEAPON_UPGRADES)) {
    const proto = tiers.find((t) => t.nature === "prototype");
    assert.ok(proto, `${weapon} has no prototype`);
    assert.equal(typeof proto.catch, "string", `${weapon} prototype missing catch`);
    assert.ok(proto.catch.length > 0, `${weapon} prototype catch is empty`);
  }
});
```

> Note: `shared/game-state.js` is ESM (`export const`). If `require` fails in this repo's node test setup, use a dynamic `await import("./game-state.js")` inside the test instead — check a sibling `shared/*.test.js` for the established import style and match it.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/upgrade-catch.test.js`
Expected: FAIL — prototype rows have no `catch`.

- [ ] **Step 3: Author the `catch` field on each Prototype row**

For each `prototype` entry in `WEAPON_UPGRADES`, add a `catch` string naming its downside. Where the tag already states a cost after `;` or ` — `, mirror that phrase; where it's implied, make it explicit. Examples (apply the same pattern to all rows):

```js
// Autocannon
{ id: "penetrator-rounds", nature: "prototype", name: "Penetrator Rounds", tag: "Every 3rd volley ignores armour", catch: "Belt cycles slow after — no fire next turn", effect: { penetrator: true } },
// Crossbow
{ id: "pinning-bolt", nature: "prototype", name: "Pinning Bolt", tag: "Pin a rig in place until your next turn", catch: "Runs +2 heat", effect: { pinningBolt: true } },
// Arc Gun
{ id: "ion-storm", nature: "prototype", name: "Ion Storm", tag: "EMP a rig's systems for a turn", catch: "Overloads your own gun", effect: { ionStorm: true } },
// Flamethrower
{ id: "conflagration", nature: "prototype", name: "Conflagration", tag: "Stack burns for escalating damage-over-time", catch: "Runs you hot", effect: { burn: 1, burnStacks: true } },
```

Do this for all Prototype rows across every weapon in `WEAPON_UPGRADES`. Keep `tag` as the payoff clause and move/duplicate the cost clause into `catch`. Do not change `id`, `nature`, `name`, or `effect`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/upgrade-catch.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/upgrade-catch.test.js
git commit -m "content: authored risk 'catch' copy on weapon Prototype upgrades"
```

---

## Task 6: Full suite + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — vitest suite (including the new component, helper, and wizard tests) and the node `shared/**` / `server/**` tests all green.

- [ ] **Step 2: Manually drive the wizard in the browser**

Start the dev server and open the app; commission a rig. Confirm: Chassis step shows only the frame roster (no inline bay); a dedicated Weapons step shows two ladders; selecting a Prototype on one weapon greys the other's (and the equipment) Prototype segment with a `🔒 spent` label; the Equipment step's selected card reveals its own ladder; Confirm and Commission still produce a rig with both weapon upgrades and the equipment upgrade. Verify tank/walker flows are unchanged (`Kind → Loadout → Confirm`).

- [ ] **Step 3: Final commit if any polish was needed**

```bash
git add -A
git commit -m "chore(v2): commission wizard redesign polish"
```

---

## Self-Review Notes

- **Spec coverage:** two-page split (Task 4), reusable risk×reward ladder for weapons (Task 4) and equipment (Task 4), pip/payoff-catch logic (Task 1), component (Task 2), styles + dead-CSS removal (Task 3), optional additive `catch` data (Task 5), gate logic preserved and relocated (Task 4 tests), tests + manual verify (Tasks 1–6). No server/command change — matches non-goals.
- **Type consistency:** `UpgradeTier` defined in Task 1, imported by Task 2 and used as the `tiers` prop; `upgradePips`/`splitUpgradeTag` names match across tasks; `lockPrototype`, `weaponProto`, `equipProto` used consistently in Task 4.
- **Gate note:** both weapon ladders and the equipment ladder derive `lockPrototype` from shared wizard state, so a Prototype chosen on any track locks the Prototype segment on the others — the existing "one Prototype per rig" rule, unchanged.
