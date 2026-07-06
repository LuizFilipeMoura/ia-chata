# Rig Control Terminal — Design Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the live Rig Control Terminal UI back in line with the refreshed `Rig Control Terminal.dc.html` design, fixing every genuine visual/layout/interaction drift while keeping the evolved multiplayer, rules engine, AI chat, and expanded glossary intact.

**Architecture:** The live app is a React + Vite + TS client (`client/src/`) over an Express + WS server that owns authoritative room state (`shared/`, `server/`). This plan is 14 tasks across 9 workstreams from the spec. 12 tasks are client-only (styling + view logic). 2 tasks make **additive** server changes (per-die dice tones in `shared/combat.js`; a `reset` command in `shared/game-state.js`) — additive, never replacing engine behavior.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (client), `node --test` (server/shared), plain CSS with design tokens in `client/src/styles/tokens.css`.

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-07-05-rig-terminal-reconciliation-design.md`
- Design source of truth (read-only): the imported `Rig Control Terminal.dc.html` (copied to the session scratchpad). Line refs in tasks below (e.g. "design L116–143") point at it.

**Conventions for this plan:**
- Run all tests with `npm test` (Vitest + node --test) unless a narrower command is given.
- Commit after each task with the message shown. Commits go on the current branch `reconcile-rig-terminal-design`.
- Design color tokens already exist in `tokens.css` (verified 1:1 by audit). Use the CSS variables (e.g. `var(--oil)` = `#e79a3d`, `var(--oil-hi)` = `#ffbf6a`, `var(--teal)`/`--hp-ok-a` = greens, `var(--ember)`/`--ember-hi`, `var(--rivet)` = `#3a424e`, `var(--line)` = `#2b323d`, `var(--txt-faint)` = `#616a76`). Grep `tokens.css` to confirm a variable name before using it.
- **Styling steps have no unit test** — their verification is visual, via the preview server (`preview_start` → the app's dev config). Each such step ends with a **Verify** action and a **Commit**.
- **Keep live rulebook copy** (guardrail): do NOT reword accurate strings; only add missing lines / fix wrong labels where the task says so explicitly.

---

## Task 1: Rig-card Loadout panel — extract `buildLoadout` helper

**Workstream:** WS-1. **Files:**
- Create: `client/src/lib/loadout.ts`
- Create: `client/src/lib/loadout.test.ts`

The rig card currently renders a flat one-line weapon summary (`RigItem.tsx:134-143`). We first extract a pure, tested helper that resolves a Rig's stored `weapons` / `weaponUpgrades` / `equipment` (ids/names) into the structured shape the design panel needs, using the catalogs already exported from `shared/game-state.js` (`WEAPONS`, `WEAPON_UPGRADES`, `EQUIPMENT`).

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/loadout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLoadout } from "./loadout";
import type { Rig } from "../state/types";

const baseRig = (over: Partial<Rig>): Rig => ({
  id: 1, name: "Stalker", weightClass: "medium", owner: "a",
  hull: { sp: 7, max: 7, destroyed: false },
  arms: { sp: 6, max: 6, destroyed: false },
  legs: { sp: 6, max: 6, destroyed: false },
  engine: { sp: 5, max: 5, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, ...over,
});

describe("buildLoadout", () => {
  it("returns null when the rig has no weapons", () => {
    expect(buildLoadout(baseRig({}))).toBeNull();
  });

  it("resolves weapon names, upgrade name+tag, and equipment passive/active", () => {
    const rig = baseRig({
      weapons: { longRange: "Autocannon", melee: "Combat Knife" },
      weaponUpgrades: { longRange: "extended-belt", melee: "keen-edge" },
      equipment: "ablative-plating",
    });
    const lo = buildLoadout(rig)!;
    expect(lo).not.toBeNull();
    expect(lo.lr.name).toBe("Autocannon");
    expect(lo.lr.upName).toBe("Extended Belt");
    expect(lo.lr.upTag).toBe("+2 ROF; dice showing 1 add heat");
    expect(lo.melee.name).toBe("Combat Knife");
    expect(lo.equipment).toEqual({
      family: "Armor",
      label: "Ablative Plating",
      passive: "+1 max SP to Hull",
      activeLabel: "Harden",
      activeHeat: 1,
      activeText: expect.any(String),
    });
  });

  it("degrades gracefully when an upgrade id is unknown", () => {
    const rig = baseRig({
      weapons: { longRange: "Autocannon", melee: "Combat Knife" },
      weaponUpgrades: { longRange: "nope", melee: "nope" },
      equipment: null,
    });
    const lo = buildLoadout(rig)!;
    expect(lo.lr.upName).toBe("");
    expect(lo.equipment).toBeNull();
  });
});
```

Note: the exact weapon/upgrade/equipment ids in the test (`"Autocannon"`, `"extended-belt"`, `"ablative-plating"`, `"keen-edge"`, `"Combat Knife"`) must match real keys in `shared/game-state.js` (`WEAPONS`, `WEAPON_UPGRADES`, `EQUIPMENT`). **Before writing the test, grep those objects** and substitute real ids if any differ:
Run: `grep -nE "^\s*\"|id:|label:|passive:" shared/game-state.js | sed -n '1,80p'`

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/lib/loadout.test.ts`
Expected: FAIL — "Failed to resolve import './loadout'".

- [ ] **Step 3: Implement `buildLoadout`**

Create `client/src/lib/loadout.ts`:

```ts
import { EQUIPMENT, WEAPON_UPGRADES } from "/shared/game-state.js";
import type { Rig } from "../state/types";

export interface LoadoutWeapon {
  name: string;
  upName: string;
  upTag: string;
}
export interface LoadoutEquipment {
  family: string;
  label: string;
  passive: string;
  activeLabel: string;
  activeHeat: number;
  activeText: string;
}
export interface Loadout {
  lr: LoadoutWeapon;
  melee: LoadoutWeapon;
  equipment: LoadoutEquipment | null;
}

function weapon(name: string | undefined, upId: string | undefined): LoadoutWeapon {
  const up = (WEAPON_UPGRADES[name as string] || []).find((u: { id: string }) => u.id === upId);
  return { name: name || "", upName: up?.name || "", upTag: up?.tag || "" };
}

/** Resolve a rig's stored loadout ids into display-ready names/tags/passive/active.
 *  Returns null when the rig carries no weapons (e.g. a minimal AI-added rig). */
export function buildLoadout(rig: Rig): Loadout | null {
  if (!rig.weapons) return null;
  const eqDef = rig.equipment ? EQUIPMENT[rig.equipment] : undefined;
  return {
    lr: weapon(rig.weapons.longRange, rig.weaponUpgrades?.longRange),
    melee: weapon(rig.weapons.melee, rig.weaponUpgrades?.melee),
    equipment: eqDef
      ? {
          family: eqDef.family,
          label: eqDef.label,
          passive: eqDef.passive,
          activeLabel: eqDef.active.label,
          activeHeat: eqDef.active.heat,
          activeText: eqDef.active.text,
        }
      : null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run client/src/lib/loadout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/loadout.ts client/src/lib/loadout.test.ts
git commit -m "feat: buildLoadout helper resolving rig loadout for display"
```

---

## Task 2: Rig-card Loadout panel — render it

**Workstream:** WS-1. **Files:**
- Modify: `client/src/components/rig/RigItem.tsx` (replace the flat `.rig-weapons`/`.rig-equipment` block, lines 88–143)
- Modify: `client/src/styles/rig-sheet.css` (add `.rig-loadout*` rules)

Target design: `Rig Control Terminal.dc.html` L116–143. A bordered panel with 🎯 Long Range, 🗡️ Melee, and a dashed-divided 🛠 Equipment block; every description line runs through the existing `GlossaryText` component (glossify).

- [ ] **Step 1: Replace the weapon-summary block in `RigItem.tsx`**

Remove the local `lrUpgrade` / `meleeUpgrade` / `eq` computation (lines 88–94) and the `{rig.weapons && (…)}` block (lines 134–143). Replace with a call to the helper + a new panel. At the top of the file, replace the `heatMeter, EQUIPMENT, WEAPON_UPGRADES` import with just `heatMeter`, and add:

```tsx
import { buildLoadout } from "../../lib/loadout";
import { GlossaryText } from "../chat/GlossaryText";
```

Then, where the removed block was (after the `.rig-mods` block, before the `LOCS.map`), insert:

```tsx
{(() => {
  const lo = buildLoadout(rig);
  if (!lo) return null;
  return (
    <div className="rig-loadout">
      <div className="rig-loadout-hd">Loadout</div>
      <div className="rig-loadout-row">
        <span className="rig-loadout-ic">🎯</span>
        <div className="rig-loadout-main">
          <div className="rig-loadout-slot">Long Range</div>
          <div className="rig-loadout-name">{lo.lr.name}</div>
          <div className="rig-loadout-up">
            Upgrade · {lo.lr.upName} — <GlossaryText text={lo.lr.upTag} />
          </div>
        </div>
      </div>
      <div className="rig-loadout-row">
        <span className="rig-loadout-ic">🗡️</span>
        <div className="rig-loadout-main">
          <div className="rig-loadout-slot">Melee</div>
          <div className="rig-loadout-name">{lo.melee.name}</div>
          <div className="rig-loadout-up">
            Upgrade · {lo.melee.upName} — <GlossaryText text={lo.melee.upTag} />
          </div>
        </div>
      </div>
      {lo.equipment && (
        <div className="rig-loadout-row rig-loadout-row--eq">
          <span className="rig-loadout-ic">🛠</span>
          <div className="rig-loadout-main">
            <div className="rig-loadout-slot">Equipment · {lo.equipment.family}</div>
            <div className="rig-loadout-name">{lo.equipment.label}</div>
            <div className="rig-loadout-passive">
              Passive · <GlossaryText text={lo.equipment.passive} />
            </div>
            <div className="rig-loadout-active">
              Active · {lo.equipment.activeLabel} ({lo.equipment.activeHeat >= 0 ? "+" : ""}
              {lo.equipment.activeHeat} heat) — <GlossaryText text={lo.equipment.activeText} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
})()}
```

Confirm `GlossaryText` accepts a `text` string prop (open `client/src/components/chat/GlossaryText.tsx`); if its prop name differs (e.g. `children`), adapt the calls.

- [ ] **Step 2: Add the panel CSS to `rig-sheet.css`**

Append (values from design L116–143):

```css
.rig-loadout {
  margin: 0 0 .65rem; padding: .6rem .65rem;
  border: 1px solid #232a34; border-radius: 10px; background: #0a0c0f;
  display: flex; flex-direction: column; gap: .55rem;
}
.rig-loadout-hd {
  font-family: var(--font-mono); font-size: .54rem; letter-spacing: .2em;
  text-transform: uppercase; color: var(--txt-faint);
}
.rig-loadout-row { display: flex; gap: .55rem; align-items: flex-start; }
.rig-loadout-row--eq { border-top: 1px dashed #232a34; padding-top: .55rem; }
.rig-loadout-ic { font-size: 1rem; line-height: 1.1; width: 1.3rem; flex: 0 0 auto; text-align: center; }
.rig-loadout-main { flex: 1; min-width: 0; }
.rig-loadout-slot { font-family: var(--font-mono); font-size: .5rem; letter-spacing: .16em; text-transform: uppercase; color: var(--txt-faint); }
.rig-loadout-name { font-family: var(--font-display); font-weight: 700; font-size: .86rem; color: var(--txt); }
.rig-loadout-up { font-family: var(--font-mono); font-size: .62rem; color: var(--oil-hi); line-height: 1.35; margin-top: .1rem; }
.rig-loadout-passive { font-family: var(--font-display); font-size: .72rem; color: var(--txt-dim); line-height: 1.35; margin-top: .1rem; }
.rig-loadout-active { font-family: var(--font-mono); font-size: .62rem; color: var(--teal); line-height: 1.35; margin-top: .12rem; }
```

Confirm the font-family variable names (`--font-mono`, `--font-display`) by grepping `rig-sheet.css` for an existing usage; substitute the real names if different.

- [ ] **Step 3: Verify build + existing tests still pass**

Run: `npx vitest run client/src/components/rig/RigItem.test.tsx`
Expected: PASS (update the test if it asserted the old `.rig-weapons` text — replace those assertions with the new `.rig-loadout-name` content).

- [ ] **Step 4: Visual verify**

Start the preview server, open a rig card body, and confirm the Loadout panel matches the design (three blocks, dashed divider above Equipment, teal Active line, amber Upgrade lines, glossary terms highlighted).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/rig/RigItem.tsx client/src/styles/rig-sheet.css client/src/components/rig/RigItem.test.tsx
git commit -m "feat: rig-card Loadout panel (LR / Melee / Equipment) matching design"
```

---

## Task 3: Coach banner — computeFocus copy + missing "End turn" state

**Workstream:** WS-3 (logic half). **Files:**
- Modify: `client/src/lib/computeFocus.ts`
- Modify: `client/src/lib/computeFocus.test.ts`
- Modify: `client/src/components/TurnBanner.tsx` (wire the new CTA kind)

Add the missing `endTurn` coach state and restore two dropped secondary lines. Keep the existing `blast` state (evolution).

- [ ] **Step 1: Write failing tests**

In `client/src/lib/computeFocus.test.ts`, add:

```ts
it("prompts End turn when the active rig has no actions left", () => {
  const rig = mkRig({ id: 5, owner: "a" }); // helper already in file; adapt as needed
  const game = mkGame({
    started: true, phase: "activation", round: 1,
    turn: { side: "a", activeRigId: 5, actionsUsed: 2, actionsMax: 2 },
  });
  const f = computeFocus(game, [rig], "a")!;
  expect(f.tone).toBe("act");
  expect(f.primary).toBe("End Stalker's turn");
  expect(f.secondary).toBe("No actions left — pass to the next Rig.");
  expect(f.cta).toEqual({ label: "End turn", kind: "endTurn" });
});

it("keeps the Fire/Move/Reload hint on the next-action line", () => {
  const rig = mkRig({ id: 5, owner: "a" });
  const game = mkGame({
    started: true, phase: "activation", round: 1,
    turn: { side: "a", activeRigId: 5, actionsUsed: 0, actionsMax: 2 },
  });
  const f = computeFocus(game, [rig], "a")!;
  expect(f.secondary).toContain("· Fire, Move or Reload");
});

it("gives Roll initiative a secondary round line", () => {
  const game = mkGame({ started: true, phase: "initiative", round: 2 });
  const f = computeFocus(game, [], "a")!;
  expect(f.secondary).toBe("Round 2 — decide who moves first.");
});
```

Match `mkRig`/`mkGame` to the helpers already present in the test file (read the file first; the rig must be named "Stalker" and its `actionBudget` must return `left: 0` for the first test — set `turn.actionsUsed === turn.actionsMax`). If no factory helpers exist, build inline literals mirroring the `Rig`/`GameState` types.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/lib/computeFocus.test.ts`
Expected: FAIL (3 new tests).

- [ ] **Step 3: Implement in `computeFocus.ts`**

Add `"endTurn"` to the `FocusCtaKind` union (line 4):

```ts
export type FocusCtaKind = "commission" | "ready" | "initiative" | "blast" | "score" | "endTurn";
```

Replace the `initiative` block (lines 65–70) with:

```ts
  if (g.phase === "initiative" && g.round >= 2) {
    return {
      tone: "act", icon: "🎲", primary: "Roll initiative",
      secondary: `Round ${g.round} — decide who moves first.`,
      cta: { label: "Roll", kind: "initiative" },
    };
  }
```

Replace the `if (turn.activeRigId) { … }` block (lines 95–102) with:

```ts
    if (turn.activeRigId) {
      const rig = rigs.find((r) => r.id === turn.activeRigId);
      const b = rig ? actionBudget(rig, turn) : null;
      if (rig && b && b.left === 0) {
        return {
          tone: "act", icon: "✔", primary: `End ${rig.name}'s turn`,
          secondary: "No actions left — pass to the next Rig.",
          cta: { label: "End turn", kind: "endTurn" },
        };
      }
      return {
        tone: "act", icon: "▶", primary: "Choose your next action",
        secondary: b ? `${b.left} action${b.left === 1 ? "" : "s"} left · Fire, Move or Reload` : "",
      };
    }
```

- [ ] **Step 4: Wire the CTA in `TurnBanner.tsx`**

The banner needs the active rig + `endActivation`. `useBattleActions()` already returns `endActivation` — add it to the destructure (line 17):

```tsx
  const { rollInitiative, resolveBlast, scoreVp, endActivation } = useBattleActions();
```

Add a case to the `onCta` switch (after the `score` case, line 68):

```tsx
      case "endTurn": {
        const rig = rigs.find((r) => r.id === game?.turn?.activeRigId);
        if (rig) endActivation(rig);
        break;
      }
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run client/src/lib/computeFocus.test.ts`
Expected: PASS. Also run the full client suite: `npx vitest run` — expected all green.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/computeFocus.ts client/src/lib/computeFocus.test.ts client/src/components/TurnBanner.tsx
git commit -m "feat: coach banner End-turn state + restored secondary lines"
```

---

## Task 4: Coach banner — floating-card styling + pulsing glow

**Workstream:** WS-3 (styling half). **Files:**
- Modify: `client/src/styles/battle.css` (`.turn-banner` and tone rules ~L93–137, `body.my-turn-glow::after` ~L148–153, `tb-flash` ~L141–144)
- Modify: `client/src/styles/tokens.css` if a `--dur` token needs adding

Target design: L34–53, 1258–1267. The banner should read as a centered floating card, not a full-width bar, and the your-move glow must pulse.

- [ ] **Step 1: Make the banner a centered floating card**

In `battle.css`, change `.turn-banner` so it is a centered card inside a full-width, non-interactive wrapper. Replace the current `.turn-banner` rule with:

```css
.turn-banner {
  position: fixed; top: 0; left: 0; right: 0; z-index: 200;
  display: flex; justify-content: center;
  padding: 52px 12px 0; box-sizing: border-box;
  pointer-events: none;
}
.turn-banner .tb-card { /* NEW wrapper element — see Step 2 */
  width: min(448px, 100%); box-sizing: border-box;
  display: flex; align-items: center; gap: .6rem;
  padding: .62rem .85rem; border-radius: 14px;
  border: 1px solid var(--line); border-bottom-width: 2px;
  pointer-events: auto;
  transition: background .22s, border-color .22s;
}
```

Then move the tone backgrounds/borders/shadows onto `.tb-card` and give each tone a drop-shadow (design L1262):

```css
.turn-banner[data-tone="act"]  .tb-card { background: linear-gradient(180deg,#1e4029,#142a1c); border-color: var(--act, #6cc47f); box-shadow: 0 10px 30px rgba(108,196,127,.28), 0 8px 22px rgba(0,0,0,.5); }
.turn-banner[data-tone="guide"] .tb-card { background: linear-gradient(180deg,#2a2113,#1a1408); border-color: var(--oil); box-shadow: 0 10px 30px rgba(231,154,61,.26), 0 8px 22px rgba(0,0,0,.5); }
.turn-banner[data-tone="wait"] .tb-card { background: var(--iron-900); border-color: var(--line); box-shadow: 0 12px 30px rgba(0,0,0,.5), 0 8px 22px rgba(0,0,0,.5); }
```

Confirm the exact token name for the green (`--act` vs `--hp-ok-a`) in `tokens.css`; use whichever equals `#6cc47f`.

- [ ] **Step 2: Wrap the banner children in `.tb-card` in `TurnBanner.tsx`**

In `TurnBanner.tsx`, wrap the icon/text/cta in a `.tb-card` div so the fixed `.turn-banner` centers it:

```tsx
  return (
    <div id="turnBanner" ref={bannerRef} className="turn-banner" data-tone={focus.tone}>
      <div className={"tb-card" + (changed ? " changed" : "")}>
        <span id="tbIcon" className="tb-icon">{focus.icon || "◈"}</span>
        <div className="tb-text">
          <span id="tbPrimary" className="tb-primary">{focus.primary}</span>
          <span id="tbSecondary" className="tb-secondary">{focus.secondary || ""}</span>
        </div>
        <div id="tbCta" className="tb-cta">
          {focus.cta ? (
            <button type="button"
              className={"btn " + (focus.tone === "act" ? "btn--primary" : "btn--ghost")}
              onClick={() => onCta(focus.cta!.kind)}>
              {focus.cta.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
```

Move the `.changed` flash class from `.turn-banner` onto `.tb-card` (as shown). Update the `tb-flash`/`.changed` CSS selector in `battle.css` from `.turn-banner.changed` to `.tb-card.changed`.

- [ ] **Step 3: Pulse the glow + flash-token tweaks**

In `battle.css`, add the pulse animation to the your-move overlay and add the keyframes if absent:

```css
body.my-turn-glow::after { animation: oi-glowpulse 2.2s ease-in-out infinite; }
@keyframes oi-glowpulse { 0%,100% { opacity: .85; } 50% { opacity: 1; } }
```

Update the flash keyframe mid-key brightness `1.35 → 1.4` and duration `.3s → .32s` (in the `.tb-card.changed` rule, set `animation: tb-flash .32s cubic-bezier(.2,.85,.25,1);` and the `@keyframes tb-flash` 40% step to `filter: brightness(1.4);`). Also set the guide/act icon glow to the solid tone color at 5px:

```css
.turn-banner[data-tone="guide"] .tb-icon { filter: drop-shadow(0 0 5px var(--oil)); }
.turn-banner[data-tone="act"]   .tb-icon { filter: drop-shadow(0 0 5px #6cc47f); }
```

- [ ] **Step 4: Visual verify**

Preview: confirm the banner is a centered rounded card with border + shadow, offset 52px from the top; the whole-screen green border pulses during your move; the card flashes once when the coach line changes.

- [ ] **Step 5: Commit**

```bash
git add client/src/styles/battle.css client/src/styles/tokens.css client/src/components/TurnBanner.tsx
git commit -m "style: coach banner floating card + pulsing your-move glow"
```

---

## Task 5: Commission wizard → bottom-sheet + SP preview + glossify

**Workstream:** WS-4. **Files:**
- Modify: `client/src/styles/rig-wizard.css` (scrim L5–17, sheet L9–34)
- Modify: `client/src/components/wizards/RigWizard.tsx` (drag handle, dots row, SP preview, glossify, confirm rows)
- Modify: `client/src/components/wizards/RigWizard.test.tsx` (SP preview assertion)

Target design: L266–348, `buildCommissionView` L889–929. Convert the centered modal into a bottom-docked sheet and add the three missing features (drag handle, SP preview, glossify), plus confirm-row emoji.

- [ ] **Step 1: Make the scrim/sheet a bottom-sheet (`rig-wizard.css`)**

Replace the scrim rule so it docks content to the bottom and blurs the backdrop:

```css
.rw-scrim {
  position: absolute; inset: 0; z-index: 70;
  display: grid; place-items: end center;
  background: rgba(5,7,10,.62); backdrop-filter: blur(2px);
  animation: oi-fade .2s ease;
}
```

Replace the sheet/card rule:

```css
.rw-sheet {
  width: 100%; max-height: 88%; overflow-y: auto;
  background: linear-gradient(180deg, var(--iron-850), var(--iron-900));
  border: 1px solid var(--rivet);
  border-top-left-radius: 16px; border-top-right-radius: 16px;
  padding: .95rem .95rem 1.1rem;
  box-shadow: 0 -20px 60px rgba(0,0,0,.55);
  animation: oi-sheet .3s cubic-bezier(.2,.85,.25,1);
}
@keyframes oi-sheet { from { transform: translateY(100%); } to { transform: none; } }
@keyframes oi-fade { from { opacity: 0; } to { opacity: 1; } }
```

(Adjust the selector names `.rw-scrim`/`.rw-sheet` to the actual class names used in `RigWizard.tsx` — read the component first.) Set `.rw-body { min-height: 11rem; }` (was 12rem) and remove the `.rw-upgrade-choices { margin-top: -.25rem; }` negative margin.

- [ ] **Step 2: Add the drag handle + move dots to their own row (`RigWizard.tsx`)**

At the top of the sheet content (before the header row), add:

```tsx
<div className="rw-handle" />
```

Add `.rw-handle { width: 34px; height: 4px; border-radius: 4px; background: var(--rivet); margin: 0 auto .7rem; }` to `rig-wizard.css`. Then move the step-dots element out of the `.rw-head` row so it is a full-width band **below** the title row (structure: `<div className="rw-head">title + glossary chip</div>` then `<div className="rw-dots">…</div>`). Set the title row `margin-bottom` back per design (`.6rem`).

- [ ] **Step 3: Add the SP preview line (Identity step)**

Import capacities and class SP. `HEAT_CAPACITY` is exported from `shared/game-state.js`; grep it for a per-class hull/arms/legs SP source (likely `RIG_DEFAULTS` at L4). Under the weight-class `<select>` add:

```tsx
<div className="rw-sp-preview">
  Hull {sp.hull} · Arms/Legs {sp.arms} · Engine {sp.engine} (heat cap {sp.engine})
</div>
```

where `sp` is resolved from the class defaults for the currently-selected `cls`. Add CSS:

```css
.rw-sp-preview { font-family: var(--font-mono); font-size: .62rem; color: var(--txt-faint); line-height: 1.4; }
```

If the class→SP map isn't already available client-side, add a tiny local constant in `RigWizard.tsx` mirroring `RIG_DEFAULTS`/`HEAT_CAPACITY` (light: hull6 arms5 engine? — read the real values from `game-state.js` and use them exactly; do not invent numbers).

- [ ] **Step 4: Glossify + confirm-row emoji**

Wrap upgrade tags and equipment passive/active text in `<GlossaryText text={…} />` (import from `../chat/GlossaryText`), replacing the plain `<small>{u.tag}</small>` and plain passive/active nodes. In the Confirm step, prefix the three rows with `🎯 `, `🗡️ `, `🛠 ` and use ` · ` separators (keep the live data values). Set the confirm name style to `font-size: 1.15rem; color: var(--oil-hi);` in `rig-wizard.css`.

- [ ] **Step 5: Update the wizard test**

In `RigWizard.test.tsx`, add an assertion that the Identity step renders the SP preview text (e.g. `expect(screen.getByText(/heat cap/i)).toBeInTheDocument()`). Keep the existing next-disabled-until-name test.

- [ ] **Step 6: Run tests + visual verify**

Run: `npx vitest run client/src/components/wizards/RigWizard.test.tsx` → PASS.
Preview: open the commission wizard — it should slide up from the bottom, show a drag handle, a full-width dots band, the SP preview under weight class, glossary-highlighted upgrade/equipment text, and emoji confirm rows.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/wizards/RigWizard.tsx client/src/components/wizards/RigWizard.test.tsx client/src/styles/rig-wizard.css
git commit -m "feat: commission wizard bottom-sheet, SP preview, glossify, confirm emoji"
```

---

## Task 6: Attack sheet — handle, dice-preview strip, blur, Go label

**Workstream:** WS-5. **Files:**
- Modify: `client/src/components/wizards/AttackWizard.tsx`
- Modify: `client/src/styles/battle.css` (`.aw-scrim` L160, `.aw-card`, `.aw-opt` L174/176)

Target design: L350–385, `buildAttackView` L931–1003. Keep the live rules-accurate copy (guardrail); only ADD missing structural elements and fix the Go label's mode word + separator.

- [ ] **Step 1: Add drag handle + backdrop blur**

In `AttackWizard.tsx`, add `<div className="aw-handle" />` as the first child of `.aw-card`. In `battle.css` add `.aw-handle { width: 34px; height: 4px; border-radius: 4px; background: var(--rivet); margin: 0 auto .7rem; }`, and update `.aw-scrim` to `background: rgba(5,7,10,.62); backdrop-filter: blur(2px);`. Set `.aw-opt { min-height: 4.3rem; padding: .5rem .3rem; }`.

- [ ] **Step 2: Add the dice-preview strip**

Above the Go button, render the preview line (design L380). Compute it from the current selection — mirror `buildAttackView` L982–984: `🎲 Rolls N hit dice (d6)` (+ ` + 1 location die (d12)` when mode is Fire, + ` · +1 to hit` when Aimed). `N` = the weapon's ROF (already available via the profile the wizard uses for the range readout). Markup:

```tsx
<div className="aw-dice-preview">{dicePreview}</div>
```

CSS:

```css
.aw-dice-preview {
  margin-top: .6rem; display: flex; align-items: center; gap: .4rem;
  padding: .5rem .6rem; border-radius: 9px;
  background: rgba(231,154,61,.08); border: 1px solid rgba(231,154,61,.3);
  font-family: var(--font-mono); font-size: .62rem; letter-spacing: .03em;
  color: var(--oil-hi); line-height: 1.4;
}
```

- [ ] **Step 3: Fix the Go button label**

Use the mode label and a `·` separator in the affordable/unaffordable strings (design L986–989), keeping existing disabled logic:
- affordable: `` `${modeLabel}${cost === 2 ? " · 2 actions" : ""}` `` where `modeLabel` is `Ram` / `Aimed Shot` / `Fire` by mode.
- unaffordable: `` `Need ${cost} action${cost === 1 ? "" : "s"} · ${left} left` ``.

- [ ] **Step 4: Visual verify**

Preview: open Fire / Aimed / Ram from the action console; confirm the sheet has a grab handle, a blurred backdrop, the amber dice-preview strip above Go, and the Go button reads e.g. "Aimed Shot · 2 actions" / "Need 2 actions · 1 left".

- [ ] **Step 5: Commit**

```bash
git add client/src/components/wizards/AttackWizard.tsx client/src/styles/battle.css
git commit -m "feat: attack sheet grab handle, dice-preview strip, blur, mode-aware Go label"
```

---

## Task 7: Move/Sprint drawer — big countdown, READY state, cost note, 8s sprint

**Workstream:** WS-2. **Files:**
- Modify: `client/src/state/BattleActionsContext.tsx` (`MOVE_HOLD_MS`, `MoveBody`)
- Modify: `client/src/styles/battle.css` (`.dwr-hold-*`, add `.dwr-big`, `.dwr-cost`)

Target design: L396–405, `buildMoveView` L854–877. Add the signature big countdown → green "READY", a mono cost-note line, and make Sprint 8s. Keep the live rules-accurate call text.

- [ ] **Step 1: Per-kind hold duration**

Replace `const MOVE_HOLD_MS = 5000;` with a helper:

```ts
const MOVE_HOLD_MS = 5000;
const SPRINT_HOLD_MS = 8000;
const holdMsFor = (key: string) => (key === "sprint" ? SPRINT_HOLD_MS : MOVE_HOLD_MS);
```

In `MoveBody`, replace uses of `MOVE_HOLD_MS` with `const holdMs = holdMsFor(actionKey);` and `holdSec = Math.round(holdMs / 1000)` and the interval math against `holdMs`.

- [ ] **Step 2: Add the big number, cost note, and two-state instruction**

In `MoveBody`'s JSX, before the hold track, add the big readout and cost note; make the instruction switch on `done`:

```tsx
const costNote = sprint ? `Costs 2 actions · +${heat} heat` : "Costs 1 action · no heat";
// …
<div className="dwr-cost">{costNote}</div>
<div className="dwr-big-wrap">
  <div className={"dwr-big" + (done ? " is-ready" : "")}>{done ? "READY" : `${remaining}s`}</div>
</div>
<div className="dwr-hold-track">
  <div className={"dwr-hold-fill" + (done ? " is-ready" : "")} style={{ width: `${pct}%` }} />
</div>
<p className={"dwr-hint dwr-move-call" + (done ? " is-ready" : "")}>
  {done ? "✔ Model placed? Confirm to lock in the move." : "Move the Rig on the table now, then confirm."}
</p>
```

Keep the existing rules-accurate `.dwr-hint` distance paragraph and the existing Cancel/Confirm buttons unchanged.

- [ ] **Step 3: Style the big number + fill (battle.css)**

```css
.dwr-big-wrap { display: flex; justify-content: center; margin-top: 1rem; }
.dwr-big { font-family: var(--font-mono); font-size: 2.1rem; font-weight: 700; line-height: 1; letter-spacing: .02em; color: var(--oil-hi); text-shadow: 0 0 16px rgba(231,154,61,.35); }
.dwr-big.is-ready { color: #6cc47f; text-shadow: 0 0 16px rgba(108,196,127,.5); }
.dwr-cost { font-family: var(--font-mono); font-size: .62rem; letter-spacing: .04em; color: var(--txt-faint); margin-top: .15rem; text-align: center; }
.dwr-hold-track { height: 8px; }               /* was 6px */
.dwr-hold-fill { background: linear-gradient(90deg,#c47a26,#ffbf6a); }
.dwr-hold-fill.is-ready { background: linear-gradient(90deg,#4c9a5f,#6cc47f); }
.dwr-move-call.is-ready { color: #6cc47f; }
```

- [ ] **Step 4: Visual verify**

Preview: trigger Move (5s) and Sprint (8s). Confirm a large countdown number, a mono cost-note line, and that on completion the number turns green and reads "READY", the fill goes green, and the instruction swaps to the green "✔ Model placed?" line. Confirm the Sprint countdown starts at 8.

- [ ] **Step 5: Commit**

```bash
git add client/src/state/BattleActionsContext.tsx client/src/styles/battle.css
git commit -m "feat: move drawer big countdown + READY state + cost note; sprint 8s"
```

---

## Task 8: Dice overlay — server emits per-die faces + tones

**Workstream:** WS-6 (server half — additive). **Files:**
- Modify: `shared/combat.js` (`resolveAttack`, `resolveRam`)
- Modify: `shared/combat.test.js`

Target: give the client the individual dice + a tone so the roll overlay can tumble/settle each die like design L444–473. Additive: the summary/damage behavior is unchanged.

- [ ] **Step 1: Write failing tests (`shared/combat.test.js`)**

Add a test asserting the attack resolution now pushes one roll per hit-die plus a location die, each with a `tone`. Read the existing test setup helpers in `shared/combat.test.js` and reuse them. Skeleton:

```js
test("resolveAttack emits per-die rolls with tones", () => {
  const captured = [];
  const ctx = makeCtx({ pushResolution: (_room, r) => captured.push(r) }); // adapt to existing test ctx
  // Force dice: 3 ROF weapon, faces [6,4,2], location d12 = 5, modAim so 4+ hits
  resolveAttack(room, attacker, target,
    { weapon: "longRange", arc: "front", range: "near",
      dice: { toHit: [6, 4, 2], location: 5 } },
    () => 0.99, ctx);
  const attackRes = captured.find((r) => r.kind === "attack");
  const d6 = attackRes.rolls.filter((r) => r.sides === 6);
  const d12 = attackRes.rolls.find((r) => r.sides === 12);
  expect(d6).toHaveLength(3);
  expect(d6[0].tone).toBe("crit");   // a 6
  expect(d6[2].tone).toBe("miss");   // below modAim
  expect(d12.tone).toBe("cool");
});
```

Adapt `makeCtx`, `room`, `attacker`, `target`, and the weapon so ROF is 3 and `modAim` makes 4 a hit and 2 a miss (choose a weapon/class from the existing tests; set cover/aim accordingly).

- [ ] **Step 2: Run to verify failure**

Run: `node --test shared/combat.test.js`
Expected: FAIL — current code pushes a single aggregate `{sides:6, value: hits}` roll, no per-die tones.

- [ ] **Step 3: Implement per-die rolls in `resolveAttack`**

`rollToHit` already returns `dice` (the individual d6 faces) and `modAim` (the hit threshold). Capture the raw location die, then build detailed rolls. Replace lines 115–135 of `combat.js` with:

```js
  const rolls = th.dice.map((d, i) => ({
    sides: 6, value: d, label: `hit ${i + 1}`,
    tone: d === 6 ? "crit" : d >= th.modAim ? "ok" : "miss",
  }));
  let impacts = [];
  let location = null;
  if (th.hits > 0) {
    const locDie = rollD(12, opts.dice?.location, random);
    location = opts.aimed ? opts.aimedLoc : hitLocation(locDie);
    if (!opts.aimed) rolls.push({ sides: 12, value: locDie, label: "location", tone: "cool" });
    impacts = rollImpacts(attacker, target, profile, location,
      { arc: opts.arc, hits: th.hits, charged: opts.charged }, opts.dice, random);
    for (const h of impacts) if (h.sp > 0) ctx.applyDamage(room, target, location, h.sp, { random, dice: opts.dice });
    if (profile.upgradeEffect?.onDamage === "sunder" && impacts.some((h) => h.sp > 0)) {
      ctx.sunderLocation?.(target, location);
    }
    applyOnHitPerks(room, attacker, target, profile, opts, random, ctx);
  }
  if (heat > 0) ctx.bumpHeat(attacker, heat);

  const total = impacts.reduce((s, h) => s + h.sp, 0);
  ctx.pushResolution(room, {
    kind: "attack", actor: attacker.owner, rigId: attacker.id, rolls,
    summary: `${attacker.name} → ${target.name} with ${weaponName}: ${th.hits} hit(s), ${total} SP${location ? ` to ${location}` : ""}`,
    effects: [],
  });
```

Also add a `tone` to the ram roll (line 192): `rolls: [{ sides: 6, value: die, label: "D6", tone: "crit" }],` and, if the ram target die missed vs its severity, `tone: sev.sp > 0 ? "ok" : "miss"` — keep it simple: `tone: sev.sp > 0 ? "ok" : "miss"`.

- [ ] **Step 4: Add `tone` to the `Resolution` type**

In `client/src/state/types.ts`, extend the roll shape:

```ts
  rolls?: Array<{ sides: number; value: number; label?: string; tone?: string }>;
```

- [ ] **Step 5: Run server tests + full suite**

Run: `node --test shared/combat.test.js` → PASS. Then `npm test` → all green (fix any test that asserted the old single aggregate roll shape — update it to the new per-die shape).

- [ ] **Step 6: Commit**

```bash
git add shared/combat.js shared/combat.test.js client/src/state/types.ts
git commit -m "feat: combat resolver emits per-die faces + tones for the roll overlay"
```

---

## Task 9: Dice overlay — client tones, Rolling… line, staggered settle

**Workstream:** WS-6 (client half). **Files:**
- Modify: `client/src/components/overlays/RollConsole.tsx`
- Modify: `client/src/styles/battle.css` (`.die` tone classes ~L44–59, overlay ~L3/L11)

Consume the new `roll.tone`, add the "Rolling…" status line, tumble each die to a random face (not `?`), stagger the settle, and correct z-index/width. Keep the manual-entry form + ✕ and the live "OK"/title copy (guardrail).

- [ ] **Step 1: Tone each die from the resolution**

In `RollConsole.tsx`, replace the tone logic (~L144–150) that force-toned by `kind`/`sides` with: prefer the per-die `roll.tone` when present; fall back to `sides === 12 ? "cool" : ""`. Ensure the four tone classes map to colors (crit=ember, cool=teal, ok=green, miss=faint) in `battle.css` — add any missing ones:

```css
.die[data-tone="crit"] { border-color: var(--ember-hi); box-shadow: 0 0 14px 1px rgba(255,111,82,.6); }
.die[data-tone="cool"] { border-color: var(--teal);     box-shadow: 0 0 14px 1px rgba(127,208,196,.6); }
.die[data-tone="ok"]   { border-color: #6cc47f;         box-shadow: 0 0 14px 1px rgba(108,196,127,.6); }
.die[data-tone="miss"] { border-color: var(--txt-faint); box-shadow: none; }
```

Adapt selector form to how the component sets the tone (className vs data attribute); match existing `.die.d6`/`.die.d12` usage.

- [ ] **Step 2: Rolling… line + tumble-to-random + staggered settle**

While a die is unsettled, display a random face each tick instead of `"?"` (mirror design `dieStyle`: `value: rollDie(sides)`), and settle die *i* at `550 + i * 240` ms rather than all at a flat 650ms. Add a centered status line shown while any die is unsettled:

```tsx
{rolling && <div className="roll-rolling">Rolling…</div>}
```

```css
.roll-rolling { text-align: center; padding: .2rem 0 1rem; font-family: var(--font-mono); font-size: .6rem; letter-spacing: .18em; text-transform: uppercase; color: var(--txt-dim); }
```

Keep the existing settle animation classes (`oi-dieland` equivalent). Set the overlay width to `min(400px, 100%)` and z-index `85` (from `420px`/`80`).

- [ ] **Step 3: Visual verify**

Preview: perform an attack. Confirm each hit die tumbles through changing numbers then settles green (hit) / ember (6) / faint (miss), the location d12 (round) settles teal, a "Rolling…" line shows during the tumble, and dice settle one after another (staggered).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/overlays/RollConsole.tsx client/src/styles/battle.css
git commit -m "feat: dice overlay per-die tones, Rolling… line, staggered settle"
```

---

## Task 10: Glossary browse-dialog + open state

**Workstream:** WS-7. **Files:**
- Modify: `client/src/state/UiStateContext.tsx` (add `glossaryOpen` + setter)
- Create: `client/src/components/overlays/GlossaryDialog.tsx`
- Create: `client/src/components/overlays/GlossaryDialog.test.tsx`
- Modify: `client/src/components/Terminal.tsx` (mount the dialog)
- Modify: `client/src/styles/glossary.css` (dialog styles)

Target design: L410–428. A centered scrollable dialog listing all glossary entries, sourced from the existing 48-term `shared/glossary.js`. Keep the anchored per-term tooltip untouched.

- [ ] **Step 1: Add open state to `UiStateContext`**

Add `glossaryOpen: boolean` and `setGlossaryOpen: (v: boolean) => void` to the `UiState` interface and provider (mirror `chatOpen`). Include both in the `useMemo` value + deps.

- [ ] **Step 2: Write the dialog test**

Create `client/src/components/overlays/GlossaryDialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GlossaryDialog } from "./GlossaryDialog";

describe("GlossaryDialog", () => {
  it("renders every glossary term when open", () => {
    render(<GlossaryDialog open onClose={() => {}} />);
    expect(screen.getByText("Structure Points")).toBeInTheDocument();
    expect(screen.getByText("Victory Points")).toBeInTheDocument();
  });
  it("renders nothing when closed", () => {
    const { container } = render(<GlossaryDialog open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

Confirm the term labels ("Structure Points", "Victory Points") exist in `shared/glossary.js` (grep it); substitute two real `term` values if different.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run client/src/components/overlays/GlossaryDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `GlossaryDialog.tsx`**

```tsx
import { GLOSSARY } from "/shared/glossary.js";

interface Props { open: boolean; onClose: () => void; }

export function GlossaryDialog({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="gloss-dialog-scrim" onClick={onClose}>
      <div className="gloss-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="gloss-dialog-head">
          <div className="gloss-dialog-title">ⓘ Glossary</div>
          <button type="button" className="gloss-dialog-close" onClick={onClose} aria-label="Close glossary">✕</button>
        </div>
        {GLOSSARY.map((g: { id: string; term: string; full?: string; def: string }) => (
          <div className="gloss-entry" key={g.id}>
            <div className="gloss-entry-hd">
              <span className="gloss-entry-term">{g.term}</span>
              {g.full && <span className="gloss-entry-full">{g.full}</span>}
            </div>
            <div className="gloss-entry-def">{g.def}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Confirm `shared/glossary.js` exports `GLOSSARY` (an array) and each entry's field names (`term`, `def`, maybe `full`). If the export name/shape differs, adapt the import + map. (The audit noted entries are `{id, term, match[], def}` with no `full` — so the `full` line simply won't render, which is fine.)

- [ ] **Step 5: Style the dialog (`glossary.css`)**

Append (design L411–423):

```css
.gloss-dialog-scrim { position: absolute; inset: 0; z-index: 90; display: grid; place-items: center; padding: 1rem; background: rgba(5,7,10,.74); backdrop-filter: blur(2px); animation: oi-fade .2s ease; }
.gloss-dialog { width: 100%; max-height: 82%; overflow-y: auto; background: linear-gradient(180deg, var(--iron-850), var(--iron-900)); border: 1px solid var(--rivet); border-radius: 14px; padding: .9rem .95rem 1rem; box-shadow: 0 24px 60px rgba(0,0,0,.65); }
.gloss-dialog-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding-bottom: .55rem; margin-bottom: .7rem; border-bottom: 1px solid var(--line); }
.gloss-dialog-title { font-family: var(--font-mono); font-size: .68rem; letter-spacing: .2em; text-transform: uppercase; color: var(--oil); }
.gloss-dialog-close { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 1rem; color: var(--txt-dim); background: var(--iron-800); border: 1px solid var(--line); cursor: pointer; }
.gloss-entry { border-left: 2px solid var(--oil); padding-left: .6rem; margin-bottom: .7rem; }
.gloss-entry-hd { display: flex; align-items: baseline; gap: .45rem; flex-wrap: wrap; }
.gloss-entry-term { font-family: var(--font-mono); font-size: .78rem; font-weight: 700; color: var(--oil-hi); }
.gloss-entry-full { font-family: var(--font-mono); font-size: .54rem; letter-spacing: .12em; text-transform: uppercase; color: var(--txt-faint); }
.gloss-entry-def { font-family: var(--font-display); font-size: .76rem; color: var(--txt-dim); line-height: 1.4; margin-top: .15rem; }
```

- [ ] **Step 6: Mount the dialog in `Terminal.tsx`**

Read `glossaryOpen`/`setGlossaryOpen` from `useUi()` and render `<GlossaryDialog open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />` inside the `.term` div (alongside `OutcomeBanner`).

- [ ] **Step 7: Run tests + commit**

Run: `npx vitest run client/src/components/overlays/GlossaryDialog.test.tsx` → PASS.

```bash
git add client/src/state/UiStateContext.tsx client/src/components/overlays/GlossaryDialog.tsx client/src/components/overlays/GlossaryDialog.test.tsx client/src/components/Terminal.tsx client/src/styles/glossary.css
git commit -m "feat: full Glossary browse-dialog + UI open state"
```

---

## Task 11: Glossary ⓘ triggers (topbar + both sheets)

**Workstream:** WS-7. **Files:**
- Modify: `client/src/components/Topbar.tsx`
- Modify: `client/src/components/wizards/RigWizard.tsx`
- Modify: `client/src/components/wizards/AttackWizard.tsx`
- Modify: `client/src/styles/app.css` (topbar ⓘ button), `rig-wizard.css` / `battle.css` (sheet glossary chips)

- [ ] **Step 1: Topbar ⓘ button (design L64)**

In `Topbar.tsx`, after the `RIG CONTROL TERMINAL` sub-label, add a button that opens the glossary via `useUi().setGlossaryOpen(true)`:

```tsx
<button type="button" className="topbar-gloss" title="Glossary — what do SP, ROF, ACC mean?" onClick={() => setGlossaryOpen(true)}>ⓘ</button>
```

CSS (`app.css`):

```css
.topbar-gloss { margin-left: .5rem; align-self: center; flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .72rem; color: var(--txt-dim); background: var(--iron-800); border: 1px solid var(--line); cursor: pointer; }
```

- [ ] **Step 2: Glossary chip in each sheet header (design L273, L357)**

In `RigWizard.tsx` and `AttackWizard.tsx` header rows, add a pill button:

```tsx
<button type="button" className="sheet-gloss-chip" onClick={() => setGlossaryOpen(true)}>ⓘ Glossary</button>
```

Shared CSS (add to `battle.css` so both sheets can use it):

```css
.sheet-gloss-chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .3rem; font-family: var(--font-mono); font-size: .56rem; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-dim); background: var(--iron-800); border: 1px solid var(--line); border-radius: 999px; padding: .3rem .55rem; cursor: pointer; }
```

Make each sheet header a `justify-content: space-between` flex row so the chip sits at the right of the title.

- [ ] **Step 3: Visual verify**

Preview: click the topbar ⓘ, the commission-sheet chip, and the attack-sheet chip — each opens the full Glossary dialog; the ✕ / backdrop closes it.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Topbar.tsx client/src/components/wizards/RigWizard.tsx client/src/components/wizards/AttackWizard.tsx client/src/styles/app.css client/src/styles/rig-wizard.css client/src/styles/battle.css
git commit -m "feat: glossary ⓘ triggers in topbar and both bottom-sheets"
```

---

## Task 12: Outcome banner — reposition, width, oi-rise, New Battle button

**Workstream:** WS-8. **Files:**
- Modify: `client/src/components/OutcomeBanner.tsx`
- Modify: `client/src/styles/battle.css` (`.outcome-banner` ~L288–295)
- Depends on Task 13 (the `reset` battle action) for the button handler.

Target design: L253–259. Center within the terminal (not the viewport), cap the width, use the `oi-rise` entrance, and restore the `↻ New Battle` button.

- [ ] **Step 1: Reposition + width + animation (`battle.css`)**

```css
.outcome-banner {
  position: absolute; left: 50%; top: 18%; transform: translateX(-50%);
  width: min(320px, 86%); padding: 1rem 1.2rem; text-align: center;
  animation: oi-rise .4s ease;
}
@keyframes oi-rise { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
```

(Keep the existing border/shadow/colors — they match.) Note the `translateX(-50%)` must be preserved through the keyframes, hence the combined transform above.

- [ ] **Step 2: Add the New Battle button (`OutcomeBanner.tsx`)**

```tsx
import { useRoomState } from "../state/RoomStateContext";
import { useBattleActions } from "../state/BattleActionsContext";
import { outcomeText } from "/shared/battle-view.js";

export function OutcomeBanner() {
  const { game } = useRoomState();
  const { resetBattle } = useBattleActions(); // added in Task 13
  if (game?.phase !== "finished") return null;
  return (
    <div id="outcomeBanner" className="outcome-banner">
      {outcomeText(game.outcome, game.sides)}
      <button type="button" className="outcome-new" onClick={resetBattle}>↻ New Battle</button>
    </div>
  );
}
```

```css
.outcome-new { display: block; width: 100%; margin-top: .9rem; padding: .55rem; border-radius: 9px; font-family: var(--font-display); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; font-size: .78rem; background: var(--iron-780); color: var(--txt); border: 1px solid var(--line); cursor: pointer; }
```

- [ ] **Step 3: Visual verify** (after Task 13 lands): finish a battle, confirm the banner is centered within the phone-width terminal, ~320px wide, rises in, and the New Battle button resets to a fresh pre-start squadron.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/OutcomeBanner.tsx client/src/styles/battle.css
git commit -m "style: outcome banner centered in terminal, width cap, oi-rise, New Battle button"
```

---

## Task 13: `reset` battle command (server) + client action

**Workstream:** WS-8 (server half — additive). **Files:**
- Modify: `shared/game-state.js` (`applyCommand` — add a `reset` verb)
- Modify: `shared/game-state.test.js`
- Modify: `client/src/state/BattleActionsContext.tsx` (add `resetBattle`)

Target: a rematch that keeps the same squadrons but returns the room to a fresh pre-start state (rigs restored to full, un-activated; sides un-ready; VP 0).

- [ ] **Step 1: Write the failing server test**

In `shared/game-state.test.js`, add:

```js
test("reset returns a finished battle to a fresh pre-start state, keeping rigs", () => {
  const room = /* build a room, add rigs, start, damage a rig, finish */;
  applyCommand(room, { verb: "reset" }, { side: "a" });
  expect(room.game.started).toBe(false);
  expect(room.game.phase).toBe("setup");
  expect(room.game.round).toBe(1);
  expect(room.rigs.length).toBeGreaterThan(0);        // squadrons kept
  const r = room.rigs[0];
  expect(r.hull.sp).toBe(r.hull.max);                  // restored
  expect(r.engine.heat).toBe(0);
  expect(r.activated).toBe(false);
  expect(room.game.sides.every((s) => !s.ready)).toBe(true);
});
```

Reuse the existing test helpers in the file for building a room / adding rigs / starting / finishing (read the file to find them).

- [ ] **Step 2: Run to verify failure**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `reset` verb is a no-op today.

- [ ] **Step 3: Implement the `reset` verb in `applyCommand`**

In the `applyCommand` if/else chain (after another verb branch, e.g. after `ready`), add:

```js
  } else if (verb === "reset") {
    for (const rig of room.rigs) {
      for (const loc of LOCS) {
        rig[loc].sp = rig[loc].max;
        rig[loc].destroyed = false;
      }
      rig.engine.heat = 0;
      rig.activated = false;
      rig.destroyed = false;
      if (rig.loaded) { rig.loaded.longRange = true; rig.loaded.melee = true; }
      rig.weaponsDestroyed = [];
    }
    room.game.started = false;
    room.game.phase = "setup";
    room.game.round = 1;
    room.game.turn = null;
    room.game.resolutions = [];
    room.game.recoveryVp = {};
    room.game.outcome = null;
    room.game.pendingBlast = null;
    for (const s of room.game.sides) { s.ready = false; s.vp = 0; }
    changed = true;
```

Use the module's existing `LOCS` constant (exported near the top: `export const LOCS = [...]`). If `changed` isn't the accumulator used at this point in the function, follow the pattern of the sibling branches (some set state directly and fall through to a `room.version++`). Read the surrounding branches and match their mutation/version-bump convention exactly. Confirm the field names (`weaponsDestroyed`, `loaded`, `recoveryVp`) against the real rig/game shape and only reset fields that exist.

- [ ] **Step 4: Add the client `resetBattle` action**

In `BattleActionsContext.tsx`, add to `BattleActionsApi` and the provider value:

```ts
  resetBattle: () => void;
```
```tsx
  const resetBattle = useCallback(() => {
    sendCommand("reset", {});
  }, [sendCommand]);
```

Add `resetBattle` to the `Ctx.Provider value={{ … }}`.

- [ ] **Step 5: Run tests**

Run: `node --test shared/game-state.test.js` → PASS. Then `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js client/src/state/BattleActionsContext.tsx
git commit -m "feat: reset battle command (rematch) + client resetBattle action"
```

---

## Task 14: Small-fidelity pass — icons, stage room tag, add-card copy, heat flame, FAB

**Workstream:** WS-8 + WS-9. **Files:**
- Modify: `client/src/state/BattleActionsContext.tsx` (`ACTION_ICONS`)
- Modify: `client/src/components/Stage.tsx`
- Modify: `client/src/components/RigAddScreen.tsx`, `client/src/styles/rig-sheet.css`
- Modify: `client/src/styles/app.css` (chat FAB)

- [ ] **Step 1: Action-console icons (design console defs L1540–1546)**

In `BattleActionsContext.tsx` `ACTION_ICONS`, change: `aimed: "◎" → "🔭"`, `ram: "💥" → "💢"`, `move: "🦿" → "👣"`, `sprint: "💨" → "🏃"`. Leave `fire: "🎯"`, `reload: "🔄"`.

- [ ] **Step 2: Stage room-code tag (design L70–72)**

In `Stage.tsx`, add a right-aligned tag in the stage-head row using the real room code from `useRoomState().session?.room`:

```tsx
<span className="stage-room">ROOM {(session?.room || "").toUpperCase()}</span>
```

```css
.stage-room { font-family: var(--font-mono); font-size: .56rem; letter-spacing: .14em; text-transform: uppercase; color: var(--txt-faint); }
```

Ensure `.stage-head` is `display:flex; align-items:baseline; justify-content:space-between;`.

- [ ] **Step 3: Add-card locked copy (design L1327–1329)**

In `RigAddScreen.tsx`, when the lineup is full, set the button label to `Ready up ↑` (was `Full`), the hint to `Full lineup of 3 committed — mark ready to deploy.`, keep the button clickable (remove `disabled`), and drop the `.rig-add-locked { opacity: .82 }` dimming in `rig-sheet.css` (keep the solid border).

- [ ] **Step 4: Full-color heat-chip flame (design L104)**

In `rig-sheet.css`, remove `filter: grayscale(.5); opacity: .7;` from `.rig-heat-chip-ic` so the 🔥 is full color in all zones.

- [ ] **Step 5: Chat FAB size (design L262–263)**

In `app.css`, set `.chat-fab { width: 54px; height: 54px; }` (was 58) and `.chat-fab-ic { font-size: 1.4rem; }` (was 1.45). Confirm the emoji rendered in `ChatFab.tsx` is `🛠`; if not, change it to `🛠`.

- [ ] **Step 6: Visual verify**

Preview: confirm the action buttons show 🔭/💢/👣/🏃, the stage head shows `ROOM <code>` on the right, the full-lineup add-card reads "Ready up ↑" and is still clickable, the heat-chip flame is full color even when cold, and the chat FAB is 54px.

- [ ] **Step 7: Run full suite + commit**

Run: `npm test` → all green (update any `RigAddScreen`/`Stage` test asserting the old strings).

```bash
git add client/src/state/BattleActionsContext.tsx client/src/components/Stage.tsx client/src/components/RigAddScreen.tsx client/src/styles/rig-sheet.css client/src/styles/app.css
git commit -m "style: action icons, stage room tag, add-card copy, heat flame, FAB size"
```

---

## Final verification

- [ ] **Run the full suite:** `npm test` — Vitest + `node --test` all green.
- [ ] **Build:** `npm run build` — no type/build errors.
- [ ] **Manual pass:** with the preview server, walk each workstream against the design section-by-section (banner, rig card + loadout, commission sheet, attack sheet, move drawer, dice overlay, glossary dialog + triggers, outcome banner, icons/room-tag/add-card/flame/FAB).
- [ ] **PR:** open a PR from `reconcile-rig-terminal-design` summarizing the reconciliation (link the spec).

## Self-review notes (author)

- Spec coverage: WS-1→T1/T2, WS-2→T7, WS-3→T3/T4, WS-4→T5, WS-5→T6, WS-6→T8/T9, WS-7→T10/T11, WS-8→T12/T13 (+icons/room/add-card/flame/FAB in T14), WS-9→T14. All nine workstreams covered.
- Cross-task type consistency: `buildLoadout` shape (T1) is consumed in T2; `resetBattle` (T13) is consumed by `OutcomeBanner` (T12) — T13 must land before T12's button works (noted); `Resolution.rolls[].tone` added in T8 is consumed in T9; `FocusCtaKind` gains `endTurn` in T3 and is handled in the same task's `TurnBanner` switch.
- Ordering: do T1→T7 (client, low-risk) then T8/T13 (server, additive) then T9/T12 (their client consumers) then T10/T11/T14. T12 depends on T13.
- Known execution-time confirmations (called out inline): exact ids/keys in `shared/game-state.js`; exact class names in the CSS files; `GlossaryText` prop name; `GLOSSARY` export shape in `shared/glossary.js`; the `applyCommand` version-bump convention.
