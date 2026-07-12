# V2 Rig Terminal — Click-to-Explain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every informational token in the V2 Rig Terminal (mod chips, status, component rows, heat gauge, loadout stats/perks/modules) pops a definition when clicked, reusing the existing glossary tip.

**Architecture:** One reusable `InfoTerm` wrapper drives the existing `showTip(id, anchor)` API — no changes to the tip component or context. Definitions live in `shared/glossary.js` (id-only lookup, `match: []` so runtime states don't leak into chat highlighting). View-model producers (`rigModifiers`, `rigStatus`) gain a `gloss` id pointer; render sites wrap tokens in `InfoTerm`. Action controls are excluded (a button can't click-to-act and click-to-explain).

**Tech Stack:** React + TypeScript (client, Vitest + @testing-library/react), plain ESM JS in `/shared` (node:test). Glossary tip machinery already exists in `client/src/v2`.

---

## File Structure

- **Modify** `client/src/lib/glossaryTerms.ts` — export `matchGlossary(text)`.
- **Modify** `client/src/lib/glossaryTerms.test.ts` — cover it.
- **Modify** `shared/glossary.js` — add ~35 entries (runtime states, status, tank/walker parts, modules).
- **Create** `shared/glossary.test.js` — assert new ids resolve. *(No glossary test exists today.)*
- **Create** `client/src/v2/components/InfoTerm.tsx` — the wrapper.
- **Create** `client/src/v2/components/InfoTerm.test.tsx` — wrapper behaviour.
- **Modify** `client/src/v2/styles/glossary.css` — `.v2-info` affordance.
- **Modify** `shared/battle-view.js` — `gloss` on every `rigModifiers` mod.
- **Modify** `shared/battle-view.test.js` — assert every mod's `gloss` resolves.
- **Modify** `client/src/lib/rigView.ts` — `gloss` on `rigStatus` return.
- **Modify** `client/src/lib/rigView.test.ts` — assert each status branch's `gloss` resolves.
- **Modify** `client/src/v2/overlays/RigTerminal.tsx` — wrap mods, status, weight badge.
- **Modify** `client/src/v2/components/CompRow.tsx` — wrap the part label.
- **Modify** `client/src/v2/components/HeatGauge.tsx` — wrap "ENGINE HEAT" + cap.
- **Modify** `client/src/v2/components/LoadoutView.tsx` — wrap stat labels, perks, modules.
- **Create** `client/src/v2/overlays/RigTerminal.infotip.test.tsx` — coverage guard: every rendered `[data-info]` resolves.

**Test commands:**
- Client (one file): `npx vitest run <path>`
- Shared (one file): `node --test <path>`
- Everything: `npm test`

---

## Task 1: `matchGlossary` export

**Files:**
- Modify: `client/src/lib/glossaryTerms.ts`
- Test: `client/src/lib/glossaryTerms.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `client/src/lib/glossaryTerms.test.ts`:

```ts
import { matchGlossary } from "./glossaryTerms";

test("matchGlossary maps an exact match string to its glossary id", () => {
  expect(matchGlossary("Full Auto")).toBe("full-auto");
  expect(matchGlossary("Hull")).toBe("hull");
});

test("matchGlossary returns undefined for an unknown string", () => {
  expect(matchGlossary("Nonexistent Perk")).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/glossaryTerms.test.ts`
Expected: FAIL — `matchGlossary is not a function` / import error.

- [ ] **Step 3: Add the export**

In `client/src/lib/glossaryTerms.ts`, directly after the existing `glossaryById` function (which already uses the module-scoped `byMatch` map), add:

```ts
/** Resolve an exact match string (e.g. a weapon perk name) to its glossary id. */
export function matchGlossary(text: string): string | undefined {
  return byMatch.get(text)?.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/lib/glossaryTerms.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/glossaryTerms.ts client/src/lib/glossaryTerms.test.ts
git commit -m "feat(v2): matchGlossary — resolve an exact term string to a glossary id"
```

---

## Task 2: Glossary entries for every terminal token

**Files:**
- Modify: `shared/glossary.js`
- Test: `shared/glossary.test.js` (create)

Runtime-state / status / part / module entries use `match: []` on purpose: they are looked up by id (never tokenised from prose), so empty `match` keeps words like "Engaged" or "mount" from highlighting in chat while `glossaryById` still resolves them. `tokenizeGlossary` skips entries with no match strings.

- [ ] **Step 1: Write the failing test**

Create `shared/glossary.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY } from "./glossary.js";

const ids = new Set(GLOSSARY.map((e) => e.id));

// Every id a terminal token points at must resolve to an entry.
const REQUIRED = [
  // runtime states
  "immobilised", "pinned", "emplaced", "barrage", "engaged", "burning",
  "no-cooling", "speed-halved", "skip-activation", "momentum", "missiles-locked",
  "action-penalty", "no-prepare", "anchored", "no-actives", "arc-locked",
  "arms-suppressed", "belt-cycling", "cracked", "riveted", "no-repair",
  "reaction-set", "braced", "evasive", "return-fire", "weapon-lost",
  "ranged-unloaded", "painted",
  // status
  "destroyed", "heavy-damage", "damaged", "nominal",
  // non-rig parts
  "tracks", "turret", "mount",
  // modules
  "module-damage", "module-repair", "module-coolant", "module-recon",
];

test("glossary defines every terminal-token id", () => {
  for (const id of REQUIRED) assert.ok(ids.has(id), `missing glossary id: ${id}`);
});

test("glossary ids are unique", () => {
  assert.equal(ids.size, GLOSSARY.length);
});

test("every entry has a non-empty def", () => {
  for (const e of GLOSSARY) assert.ok(e.def && e.def.length > 0, `empty def: ${e.id}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/glossary.test.js`
Expected: FAIL — "missing glossary id: immobilised".

- [ ] **Step 3: Add the entries**

In `shared/glossary.js`, insert these objects into the `GLOSSARY` array, just before the closing `];`:

```js
  // ── Runtime states (rig terminal mod chips; id-only lookup) ────────────────
  { id: "immobilised", term: "Immobilised", match: [],
    def: "Can't move at all until freed — from destroyed Legs or an Impale result. No repositioning or pivots (§8, §13)." },
  { id: "pinned", term: "Pinned", match: [],
    def: "Suppressing fire has pinned the Rig — it can't move this activation, though it isn't permanently immobilised." },
  { id: "emplaced", term: "Emplaced", match: [],
    def: "Dug into a fixed firing position — trades mobility for a steadier platform." },
  { id: "barrage", term: "Barrage", match: [],
    def: "A sustained barrage is in flight; the number is how many more activations of fire it keeps up." },
  { id: "engaged", term: "Engaged", match: [],
    def: "Locked in melee with an enemy Rig. It must Disengage before it can Move (§5, §12)." },
  { id: "burning", term: "Burning", match: [],
    def: "On fire — takes damage each activation until the flames go out; the number is rounds of burning left." },
  { id: "no-cooling", term: "No cooling", match: [],
    def: "Cooling systems are offline — the Rig can't shed Heat this activation." },
  { id: "speed-halved", term: "Speed halved", match: [],
    def: "Movement is halved (round down) next activation — usually from a Shock hit (§13)." },
  { id: "skip-activation", term: "Skips next activation", match: [],
    def: "Loses its next activation entirely — commonly from a wrecked Engine (§8)." },
  { id: "momentum", term: "Momentum", match: [],
    def: "Built-up charge from a prototype upgrade; the number is the momentum stacks available to spend." },
  { id: "missiles-locked", term: "Missiles locked", match: [],
    def: "A missile lock is held on a target — the next salvo fires with the lock's bonus." },
  { id: "action-penalty", term: "Action penalty", match: [],
    def: "Starts its next activation short N actions — a lingering penalty from an enemy effect." },
  { id: "no-prepare", term: "No Prepare next", match: [],
    def: "Can't place a Prepare reaction on its next activation (§5)." },
  { id: "anchored", term: "Anchored", match: [],
    def: "Held in place — Disengaging next activation costs a free hit, or is barred outright." },
  { id: "no-actives", term: "No actives next", match: [],
    def: "Can't use active equipment abilities on its next activation." },
  { id: "arc-locked", term: "Arc Gun locked", match: [],
    def: "The Arc Gun is locked out next activation and can't fire." },
  { id: "arms-suppressed", term: "Arms suppressed", match: [],
    def: "Arms are suppressed — weapons fire at half ROF (round down)." },
  { id: "belt-cycling", term: "Belt cycling", match: [],
    def: "The autocannon belt is still cycling — half ROF on the next shot." },
  { id: "cracked", term: "Cracked", match: [],
    def: "A component's armour is cracked — it takes extra damage there until repaired." },
  { id: "riveted", term: "Riveted", match: [],
    def: "A component is rivet-seized — it can't be repaired until the seize is cleared." },
  { id: "no-repair", term: "No repair", match: [],
    def: "A component can't be repaired for now — damage there is locked in." },
  { id: "reaction-set", term: "Reaction set", match: [],
    def: "A facedown Prepare reaction is armed and triggers before this Rig's next activation (§5)." },
  { id: "braced", term: "Braced", match: [],
    def: "Braced for Incoming Fire — an armed reaction that cuts incoming damage before the next activation (§5)." },
  { id: "evasive", term: "Evasive ready", match: [],
    def: "Evasive Manoeuvre — an armed reaction that dodges before the next activation (§5)." },
  { id: "return-fire", term: "Return fire ready", match: [],
    def: "Return Fire — an armed reaction that shoots back before the next activation (§5)." },
  { id: "weapon-lost", term: "Weapon lost", match: [],
    def: "A weapon was destroyed (Arms at 0 SP) and can no longer be fired (§8)." },
  { id: "ranged-unloaded", term: "Ranged unloaded", match: [],
    def: "The Long Range weapon is spent and must Reload before firing again (§5, §12)." },
  { id: "painted", term: "Painted", match: [],
    def: "Marked by a Recon Paint — allied ranged attacks ignore its cover and gain +1 Aim (Support Units)." },
  // ── Status-chip states (id-only lookup) ────────────────────────────────────
  { id: "destroyed", term: "Destroyed", match: [],
    def: "The Rig is wrecked and out of the battle." },
  { id: "heavy-damage", term: "Heavy damage", match: [],
    def: "A component is at a third of its structure or less — still operational but near catastrophic." },
  { id: "damaged", term: "Damaged", match: [],
    def: "At least one component has taken damage; the Rig is still fully operational." },
  { id: "nominal", term: "All systems nominal", match: [],
    def: "Every component is at full structure — no damage." },
  // ── Non-rig parts (Tank / Walker) ──────────────────────────────────────────
  { id: "tracks", term: "Tracks", match: [],
    def: "A Tank's mobility component. At 0 SP its movement is crippled." },
  { id: "turret", term: "Turret", match: [],
    def: "A Tank's weapon component, housing its main gun. At 0 SP a weapon is lost." },
  { id: "mount", term: "Mount", match: [],
    def: "A Walker's weapon component. At 0 SP a weapon is lost." },
  // ── Support-unit modules ───────────────────────────────────────────────────
  { id: "module-damage", term: "Damage module", match: [],
    def: "Arms a support unit with a real gun from the weapon catalogue (Support Units)." },
  { id: "module-repair", term: "Repair module", match: [],
    def: "Grants the Field Weld action to repair an allied unit (Support Units)." },
  { id: "module-coolant", term: "Coolant module", match: [],
    def: "Grants the Vent action to shed an ally's Heat (Support Units)." },
  { id: "module-recon", term: "Recon module", match: [],
    def: "Grants the Paint action to mark an enemy for the whole squadron (Support Units)." },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/glossary.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the existing glossary consumer test to confirm no regression**

Run: `npx vitest run client/src/lib/glossaryTerms.test.ts`
Expected: PASS — empty `match` arrays add no new tokenised terms.

- [ ] **Step 6: Commit**

```bash
git add shared/glossary.js shared/glossary.test.js
git commit -m "feat(v2): glossary entries for rig-terminal runtime states, status, parts, modules"
```

---

## Task 3: `InfoTerm` wrapper + `.v2-info` style

**Files:**
- Create: `client/src/v2/components/InfoTerm.tsx`
- Create: `client/src/v2/components/InfoTerm.test.tsx`
- Modify: `client/src/v2/styles/glossary.css`

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/components/InfoTerm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { V2GlossaryTipProvider } from "../state/V2GlossaryTipContext";
import { InfoTerm } from "./InfoTerm";

function wrap(node: React.ReactNode) {
  return render(<V2GlossaryTipProvider>{node}</V2GlossaryTipProvider>);
}

test("a known id renders an interactive control", () => {
  wrap(<InfoTerm id="burning">Burning 3</InfoTerm>);
  const el = screen.getByText("Burning 3");
  expect(el).toHaveAttribute("role", "button");
  expect(el).toHaveAttribute("tabindex", "0");
  expect(el).toHaveAttribute("data-info", "burning");
  expect(el.className).toContain("v2-info");
});

test("an unknown or absent id renders plain text with no affordance", () => {
  wrap(<InfoTerm id="does-not-exist">Mystery</InfoTerm>);
  const el = screen.getByText("Mystery");
  expect(el).not.toHaveAttribute("role");
  expect(el.className).not.toContain("v2-info");
});

test("clicking a known term opens its definition tip", async () => {
  const user = userEvent.setup();
  wrap(<InfoTerm id="burning">Burning 3</InfoTerm>);
  await user.click(screen.getByText("Burning 3"));
  // GlossaryTip renders role="tooltip" with the entry def text.
  expect(await screen.findByText(/On fire/i)).toBeInTheDocument();
});

test("keeps the host className alongside v2-info", () => {
  wrap(<InfoTerm id="burning" className="v2-rt-mod">Burning 3</InfoTerm>);
  const el = screen.getByText("Burning 3");
  expect(el.className).toContain("v2-info");
  expect(el.className).toContain("v2-rt-mod");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/components/InfoTerm.test.tsx`
Expected: FAIL — cannot find `./InfoTerm`.

- [ ] **Step 3: Write `InfoTerm`**

Create `client/src/v2/components/InfoTerm.tsx`:

```tsx
import type { ElementType, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { glossaryById } from "../../lib/glossaryTerms";
import { useV2GlossaryTip } from "../state/V2GlossaryTipContext";

interface Props {
  /** Glossary id. Falsy or unknown → renders children as plain text (no affordance). */
  id?: string;
  /** Host tag; defaults to a span. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

// Wraps any structured UI token in a tappable control that pops its glossary
// definition via the existing tip (useV2GlossaryTip). Layers the `.v2-info`
// affordance onto whatever the host already looks like; degrades to inert text
// when the id has no entry, so an unmapped token never looks clickable.
export function InfoTerm({ id, as: Tag = "span", className = "", children }: Props) {
  const { showTip } = useV2GlossaryTip();
  const entry = id ? glossaryById(id) : undefined;

  if (!entry) {
    return <Tag className={className || undefined}>{children}</Tag>;
  }

  const open = (el: HTMLElement) => showTip(id!, el);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(e.currentTarget);
    }
  };

  return (
    <Tag
      className={`v2-info${className ? ` ${className}` : ""}`}
      data-info={id}
      role="button"
      tabIndex={0}
      aria-label={`${entry.term} — what this means`}
      onClick={(e: MouseEvent<HTMLElement>) => open(e.currentTarget)}
      onKeyDown={onKeyDown}
    >
      {children}
    </Tag>
  );
}
```

- [ ] **Step 4: Add the `.v2-info` style**

In `client/src/v2/styles/glossary.css`, after the `.v2-gloss-term` block (ends at the `.is-open` rule around line 25), add:

```css
/* ===== Generic click-to-explain affordance for structured UI tokens ===== */
/* Additive only — layers onto the host element's own look (chips, stat labels,
   part labels) without restyling it. Mirrors how .v2-gloss-term.is-open reads. */
.v2-root .v2-info {
  cursor: pointer;
  border-radius: 3px;
  transition: background-color var(--v2-dur-fast) ease;
}
.v2-root .v2-info:hover,
.v2-root .v2-info:focus-visible {
  background: rgba(231, 154, 61, .16);
  outline: none;
}
.v2-root .v2-info.is-open {
  background: rgba(231, 154, 61, .24);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run client/src/v2/components/InfoTerm.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/components/InfoTerm.tsx client/src/v2/components/InfoTerm.test.tsx client/src/v2/styles/glossary.css
git commit -m "feat(v2): InfoTerm — click-to-explain wrapper for structured terminal tokens"
```

---

## Task 4: `gloss` id on every `rigModifiers` mod

**Files:**
- Modify: `shared/battle-view.js:143-191`
- Test: `shared/battle-view.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/battle-view.test.js`:

```js
import { GLOSSARY } from "./glossary.js";

const GLOSS_IDS = new Set(GLOSSARY.map((e) => e.id));

test("every rigModifiers chip carries a gloss id that resolves", () => {
  // A rig loaded with as many concurrent states as possible.
  const r = rig({
    hull: { sp: 0, max: 6 }, engine: { sp: 0, max: 4, heat: 0 }, legs: { sp: 0, max: 5 },
    immobilised: true, emplaced: true, barrageRoundsLeft: 2, engagedWith: 7,
    burning: 2, noCool: true, speedHalvedNextRound: true, skipNextActivation: true,
    momentum: 1, lockedTarget: 3, actionPenaltyNextActivation: 1, noPrepNextActivation: true,
    noDisengageNextActivation: true, anchoredBy: 4, noActivesNextActivation: true,
    arcLockedNext: true, armsSuppressed: true, autocannonSlowNext: true,
    cracked: { hull: true }, rivetSeized: { arms: true }, noRepair: { legs: true },
    weaponsDestroyed: ["Autocannon"], loaded: { longRange: false },
    painted: { by: "b", painterId: 9 },
  });
  const mods = rigModifiers(r);
  assert.ok(mods.length > 0);
  for (const m of mods) {
    assert.ok(m.gloss, `mod ${m.key} has no gloss`);
    assert.ok(GLOSS_IDS.has(m.gloss), `mod ${m.key} gloss "${m.gloss}" not in glossary`);
  }
});

test("a hidden reaction points at reaction-set; a revealed one names the type", () => {
  const hidden = rigModifiers(rig({ preparation: { hidden: true } })).find((m) => m.key === "prep");
  assert.equal(hidden.gloss, "reaction-set");
  const evasive = rigModifiers(rig({ preparation: { type: "evasive", faceUp: true } })).find((m) => m.key === "prep");
  assert.equal(evasive.gloss, "evasive");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — "mod ... has no gloss".

- [ ] **Step 3: Add `gloss` to each mod push**

In `shared/battle-view.js`, edit `rigModifiers` (lines 143-191). Add a `gloss:` key to every `mods.push({...})`. Replace the body's push statements with these exact lines (order and conditions unchanged):

```js
  if (structPart && rig[structPart].sp === 0 && !rig[structPart].destroyed)
    mods.push({ key: `${structPart}0`, tag: `${cap(structPart)} 0 · −2 actions −1 Aim`, tone: "crit", gloss: structPart });
  if (cfg.hasHeat && powerPart && rig[powerPart].sp === 0 && !rig[powerPart].destroyed)
    mods.push({ key: `${powerPart}0`, tag: `${cap(powerPart)} 0 · heat ≥3`, tone: "crit", gloss: powerPart });
  if (mobPart && rig[mobPart].sp === 0 && !rig.immobilised)
    mods.push({ key: `${mobPart}0`, tag: `${cap(mobPart)} 0 · −3\" move`, tone: "warn", gloss: mobPart });
  if (rig.immobilised) mods.push({ key: "immobile", tag: "Immobilised", tone: "crit", gloss: "immobilised" });
  else if (rig.suppressImmobile) mods.push({ key: "suppress-immobile", tag: "Pinned", tone: "crit", gloss: "pinned" });
  if (rig.emplaced) mods.push({ key: "emplaced", tag: "Emplaced", tone: "prep", gloss: "emplaced" });
  if ((rig.barrageRoundsLeft || 0) > 0) mods.push({ key: "barrage", tag: `Barrage ${rig.barrageRoundsLeft}`, tone: "warn", gloss: "barrage" });
  if (rig.engagedWith != null) mods.push({ key: "engaged", tag: "Engaged", tone: "warn", gloss: "engaged" });
  if ((rig.burning || 0) > 0) mods.push({ key: "burning", tag: `Burning ${rig.burning}`, tone: "crit", gloss: "burning" });
  if (rig.noCool) mods.push({ key: "nocool", tag: "No cooling", tone: "crit", gloss: "no-cooling" });
  if (rig.speedHalvedNextRound) mods.push({ key: "speed", tag: "Speed halved", tone: "warn", gloss: "speed-halved" });
  if (rig.skipNextActivation) mods.push({ key: "skip", tag: "Skips next activation", tone: "warn", gloss: "skip-activation" });
  if ((rig.momentum || 0) > 0) mods.push({ key: "momentum", tag: `Momentum ${rig.momentum}`, tone: "prep", gloss: "momentum" });
  if (rig.lockedTarget != null) mods.push({ key: "locked", tag: "Missiles locked", tone: "prep", gloss: "missiles-locked" });
  if ((rig.actionPenaltyNextActivation || 0) > 0) mods.push({ key: "actionpen", tag: `−${rig.actionPenaltyNextActivation} action next`, tone: "warn", gloss: "action-penalty" });
  if (rig.noPrepNextActivation) mods.push({ key: "noprep", tag: "No Prepare next", tone: "warn", gloss: "no-prepare" });
  if (rig.noDisengageNextActivation) mods.push({ key: "nodisengage", tag: "Anchored — no Disengage next", tone: "warn", gloss: "anchored" });
  if (rig.anchoredBy != null) mods.push({ key: "anchored", tag: "Anchored — Disengage costs a hit", tone: "warn", gloss: "anchored" });
  if (rig.noActivesNextActivation) mods.push({ key: "noactive", tag: "No actives next", tone: "warn", gloss: "no-actives" });
  if (rig.arcLockedNext) mods.push({ key: "arclock", tag: "Arc Gun locked", tone: "warn", gloss: "arc-locked" });
  if (rig.armsSuppressed) mods.push({ key: "armssup", tag: "Arms suppressed · ½ ROF", tone: "warn", gloss: "arms-suppressed" });
  if (rig.autocannonSlowNext) mods.push({ key: "beltcycle", tag: "Belt cycling · ½ ROF", tone: "warn", gloss: "belt-cycling" });
  for (const loc of Object.keys(rig.cracked || {})) mods.push({ key: `crack-${loc}`, tag: `Cracked: ${cap(loc)}`, tone: "warn", gloss: "cracked" });
  for (const loc of Object.keys(rig.rivetSeized || {})) mods.push({ key: `rivet-${loc}`, tag: `Riveted: ${cap(loc)}`, tone: "crit", gloss: "riveted" });
  for (const loc of Object.keys(rig.noRepair || {})) mods.push({ key: `norepair-${loc}`, tag: `No repair: ${cap(loc)}`, tone: "crit", gloss: "no-repair" });
  if (cfg.reactions && rig.preparation) {
    const p = rig.preparation;
    const hidden = p.hidden || p.faceUp === false;
    const tag = hidden ? "Reaction set" : prepLabel(p.type);
    const gloss = hidden ? "reaction-set" : (p.type === "evasive" ? "evasive" : p.type === "return" ? "return-fire" : "braced");
    mods.push({ key: "prep", tag, tone: "prep", gloss });
  }
  for (const w of rig.weaponsDestroyed || []) mods.push({ key: "weapon", tag: `Weapon lost: ${w}`, tone: "warn", gloss: "weapon-lost" });
  if (rig.loaded && rig.loaded.longRange === false) mods.push({ key: "unloaded", tag: "Ranged unloaded", tone: "warn", gloss: "ranged-unloaded" });
  if (rig.painted) mods.push({ key: "painted", tag: "Painted", tone: "warn", gloss: "painted" });
```

Note: `structPart`/`powerPart`/`mobPart` are the actual part names (`hull`/`engine`/`legs` for a rig; `hull`/`engine`/`tracks` for a tank; `hull`/`engine`/`legs` for a walker) — all of which are glossary ids after Task 2, so `gloss: structPart` resolves for every kind.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/battle-view.test.js`
Expected: PASS (all existing tests + the two new ones).

- [ ] **Step 5: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "feat(v2): rigModifiers chips carry a resolving gloss id"
```

---

## Task 5: `gloss` id on `rigStatus`

**Files:**
- Modify: `client/src/lib/rigView.ts:14-24`
- Test: `client/src/lib/rigView.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `client/src/lib/rigView.test.ts` (the file already has a `rig`/`comp` helper and imports `rigStatus`):

```ts
import { GLOSSARY } from "/shared/glossary.js";
const GLOSS_IDS = new Set(GLOSSARY.map((e: { id: string }) => e.id));

test("rigStatus tags each branch with a resolving gloss id", () => {
  expect(rigStatus(rig({ destroyed: true })).gloss).toBe("destroyed");
  expect(rigStatus(rig({ arms: comp(0, 5) })).gloss).toBe("catastrophic-damage");
  expect(rigStatus(rig({ hull: comp(2, 6) })).gloss).toBe("heavy-damage");
  expect(rigStatus(rig({ hull: comp(5, 6) })).gloss).toBe("damaged");
  expect(rigStatus(rig()).gloss).toBe("nominal");
  for (const s of [
    rigStatus(rig({ destroyed: true })),
    rigStatus(rig({ arms: comp(0, 5) })),
    rigStatus(rig({ hull: comp(2, 6) })),
    rigStatus(rig({ hull: comp(5, 6) })),
    rigStatus(rig()),
  ]) {
    expect(GLOSS_IDS.has(s.gloss)).toBe(true);
  }
});
```

If `rig`/`comp` helpers in this file don't already produce a full-SP default rig, check the top of `rigView.test.ts` and reuse its existing helpers verbatim; the branch inputs above assume `comp(sp, max)` and a `rig(overrides)` that defaults every component to full. Adjust the override keys to match the helper's component shape if needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/rigView.test.ts`
Expected: FAIL — `gloss` is `undefined`.

- [ ] **Step 3: Add `gloss` to each return**

In `client/src/lib/rigView.ts`, change the `rigStatus` return type and each branch:

```ts
export function rigStatus(rig: Rig): { text: string; cls: string; gloss: string } {
  const parts = partNamesOf(kindOf(rig));
  if (rig.destroyed) return { text: "⛔ System failure — destroyed", cls: "crit", gloss: "destroyed" };
  if (parts.some((l: string) => (rig as any)[l]?.sp === 0))
    return { text: "⚠ Catastrophic damage", cls: "crit", gloss: "catastrophic-damage" };
  if (parts.some((l: string) => (rig as any)[l]?.sp / (rig as any)[l]?.max <= 0.34))
    return { text: "▲ Heavy damage — operational", cls: "warn", gloss: "heavy-damage" };
  if (parts.some((l: string) => (rig as any)[l]?.sp < (rig as any)[l]?.max))
    return { text: "◆ Damaged — operational", cls: "warn", gloss: "damaged" };
  return { text: "● All systems nominal", cls: "", gloss: "nominal" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/lib/rigView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/rigView.ts client/src/lib/rigView.test.ts
git commit -m "feat(v2): rigStatus carries a resolving gloss id per branch"
```

---

## Task 6: Wire `RigTerminal` (mods, status, weight badge)

**Files:**
- Modify: `client/src/v2/overlays/RigTerminal.tsx`

- [ ] **Step 1: Import `InfoTerm`**

At the top of `client/src/v2/overlays/RigTerminal.tsx`, add to the imports:

```tsx
import { InfoTerm } from "../components/InfoTerm";
```

- [ ] **Step 2: Wrap the mod chips**

Replace the mods block (lines 85-89):

```tsx
        {mods.length > 0 && (
          <div className="v2-rt-mods">
            {mods.map((mod, i) => <span key={i} className="v2-rt-mod" data-tone={mod.tone}>{mod.tag}</span>)}
          </div>
        )}
```

with:

```tsx
        {mods.length > 0 && (
          <div className="v2-rt-mods">
            {mods.map((mod, i) => (
              <InfoTerm key={i} id={mod.gloss} className="v2-rt-mod">
                <span data-tone={mod.tone}>{mod.tag}</span>
              </InfoTerm>
            ))}
          </div>
        )}
```

Note: the chip's `data-tone` styling lives on `.v2-rt-mod[data-tone=...]`. Keep `data-tone` on the styled element — move it to the `InfoTerm` host so the CSS still matches. Use this exact form instead:

```tsx
        {mods.length > 0 && (
          <div className="v2-rt-mods">
            {mods.map((mod, i) => (
              <InfoTerm key={i} id={mod.gloss} className="v2-rt-mod" data-tone={mod.tone as never}>
                {mod.tag}
              </InfoTerm>
            ))}
          </div>
        )}
```

Wait — `InfoTerm`'s Props don't accept arbitrary DOM attributes. To keep `data-tone` on the styled host without widening `InfoTerm`'s API, render the tone via a child span the CSS also targets. Update the `.v2-rt-mod[data-tone]` selectors are on `.v2-rt-mod` itself, so the tone attribute must sit on the element carrying `.v2-rt-mod`. Choose the clean path: **add an optional `dataTone` prop to `InfoTerm`**.

- [ ] **Step 3: Add a `dataTone` pass-through to `InfoTerm`**

In `client/src/v2/components/InfoTerm.tsx`, extend `Props` and forward it in both return branches:

```tsx
interface Props {
  id?: string;
  as?: ElementType;
  className?: string;
  /** Optional data-tone for chips whose CSS keys off it (e.g. .v2-rt-mod). */
  dataTone?: string;
  children: ReactNode;
}
```

Plain branch:

```tsx
  if (!entry) {
    return <Tag className={className || undefined} data-tone={dataTone}>{children}</Tag>;
  }
```

Interactive branch — add `data-tone={dataTone}` to the `<Tag>` props. Destructure `dataTone` in the function signature.

Then in `InfoTerm.test.tsx` add:

```tsx
test("forwards data-tone to the host element", () => {
  wrap(<InfoTerm id="burning" className="v2-rt-mod" dataTone="crit">Burning 3</InfoTerm>);
  expect(screen.getByText("Burning 3")).toHaveAttribute("data-tone", "crit");
});
```

Run: `npx vitest run client/src/v2/components/InfoTerm.test.tsx` — Expected: PASS.

- [ ] **Step 4: Use `dataTone` in the mods block**

Final mods block in `RigTerminal.tsx`:

```tsx
        {mods.length > 0 && (
          <div className="v2-rt-mods">
            {mods.map((mod, i) => (
              <InfoTerm key={i} id={mod.gloss} className="v2-rt-mod" dataTone={mod.tone}>
                {mod.tag}
              </InfoTerm>
            ))}
          </div>
        )}
```

- [ ] **Step 5: Wrap the status chip**

Replace the status header line (line 82):

```tsx
          <div className={"v2-rt-status v2-rt-status--" + (st.cls || "ok")}>{st.text}</div>
```

with:

```tsx
          <InfoTerm as="div" id={st.gloss} className={"v2-rt-status v2-rt-status--" + (st.cls || "ok")}>{st.text}</InfoTerm>
```

- [ ] **Step 6: Wrap the weight-class badge**

The sub-line (line 80) renders `{badge}{loadoutText ? …}`. Wrap just the badge:

```tsx
            <div className="v2-rt-sub"><InfoTerm id="weight-class">{badge}</InfoTerm>{loadoutText ? ` · ${loadoutText}` : ""}</div>
```

- [ ] **Step 7: Typecheck + run the terminal's own tests if any**

Run: `npx tsc --noEmit -p client/tsconfig.json` (or the repo's typecheck script — check `package.json` scripts; if it's `npm run build`/`tsc -b`, use that).
Expected: no new type errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/v2/overlays/RigTerminal.tsx client/src/v2/components/InfoTerm.tsx client/src/v2/components/InfoTerm.test.tsx
git commit -m "feat(v2): rig terminal mods, status, and weight badge are click-to-explain"
```

---

## Task 7: Wire `CompRow` (part label)

**Files:**
- Modify: `client/src/v2/components/CompRow.tsx`

- [ ] **Step 1: Import `InfoTerm` and add the part map**

At the top of `client/src/v2/components/CompRow.tsx`:

```tsx
import { InfoTerm } from "./InfoTerm";

// Each part name is also its glossary id (added in shared/glossary.js).
const PART_GLOSS = new Set(["hull", "arms", "legs", "engine", "tracks", "turret", "mount"]);
```

- [ ] **Step 2: Wrap the label**

Replace line 28:

```tsx
      <span className="v2-comp-label">{label}</span>
```

with:

```tsx
      <InfoTerm id={PART_GLOSS.has(loc) ? loc : undefined} className="v2-comp-label">{label}</InfoTerm>
```

`loc` is the lowercase part name (`hull`, `tracks`, …); unknown parts pass through as plain text.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p client/tsconfig.json` (or repo typecheck script).
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/v2/components/CompRow.tsx
git commit -m "feat(v2): component-row part labels are click-to-explain"
```

---

## Task 8: Wire `HeatGauge` (heat + capacity)

**Files:**
- Modify: `client/src/v2/components/HeatGauge.tsx`

- [ ] **Step 1: Import `InfoTerm`**

```tsx
import { InfoTerm } from "./InfoTerm";
```

- [ ] **Step 2: Wrap the label and the cap**

Replace the head block (lines 33-36):

```tsx
      <div className="v2-heat-head">
        <span className="v2-heat-label v2-eyebrow">ENGINE HEAT</span>
        <span className="v2-heat-read"><b>{m.heat}</b>/{m.cap}</span>
      </div>
```

with:

```tsx
      <div className="v2-heat-head">
        <InfoTerm id="heat" className="v2-heat-label v2-eyebrow">ENGINE HEAT</InfoTerm>
        <span className="v2-heat-read"><b>{m.heat}</b>/<InfoTerm id="heat-capacity">{m.cap}</InfoTerm></span>
      </div>
```

`heat` and `heat-capacity` are existing glossary ids.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p client/tsconfig.json` (or repo typecheck script).
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/v2/components/HeatGauge.tsx
git commit -m "feat(v2): heat gauge label and capacity are click-to-explain"
```

---

## Task 9: Wire `LoadoutView` (stats, perks, modules)

**Files:**
- Modify: `client/src/v2/components/LoadoutView.tsx`

- [ ] **Step 1: Import `InfoTerm` and `matchGlossary`**

```tsx
import { InfoTerm } from "./InfoTerm";
import { matchGlossary } from "../../lib/loadoutGloss";
```

Wait — `matchGlossary` lives in `client/src/lib/glossaryTerms.ts` (Task 1). Import it from there:

```tsx
import { InfoTerm } from "./InfoTerm";
import { matchGlossary } from "../../lib/glossaryTerms";
```

- [ ] **Step 2: Make the `Stat` label tappable**

Replace the `Stat` component (lines 7-14):

```tsx
function Stat({ label, base, delta }: { label: string; base: number | string; delta: number }) {
  return (
    <span className="v2-rt-lo-stat">
      <InfoTerm as="em" id={label.toLowerCase()} className="v2-eyebrow">{label}</InfoTerm> {base}
      {delta ? <span className="v2-rt-delta">+{delta}</span> : null}
    </span>
  );
}
```

`ROF`/`STR` lowercase to the existing ids `rof`/`str`.

- [ ] **Step 3: Make the range label tappable**

In `WeaponBlock`, replace the range `<em>` (line 28):

```tsx
          <em className="v2-eyebrow">{w.melee ? "RNG" : "RANGE"}</em>{" "}
```

with:

```tsx
          <InfoTerm as="em" id="rng" className="v2-eyebrow">{w.melee ? "RNG" : "RANGE"}</InfoTerm>{" "}
```

Both "RNG" and "RANGE" describe the same stat → the existing `rng` id.

- [ ] **Step 4: Make perk chips tappable**

Replace the perks block (lines 33-38):

```tsx
      {(w.perks.length > 0 || w.addedPerks.length > 0) && (
        <div className="v2-rt-lo-perks">
          {w.perks.map((p) => <span key={p} className="v2-rt-lo-perk">{p}</span>)}
          {w.addedPerks.map((p) => <span key={p} className="v2-rt-lo-perk is-added">{p}</span>)}
        </div>
      )}
```

with:

```tsx
      {(w.perks.length > 0 || w.addedPerks.length > 0) && (
        <div className="v2-rt-lo-perks">
          {w.perks.map((p) => <InfoTerm key={p} id={matchGlossary(p)} className="v2-rt-lo-perk">{p}</InfoTerm>)}
          {w.addedPerks.map((p) => <InfoTerm key={p} id={matchGlossary(p)} className="v2-rt-lo-perk is-added">{p}</InfoTerm>)}
        </div>
      )}
```

Perks not in the glossary resolve to `undefined` and render plain.

- [ ] **Step 5: Make module chips tappable**

Replace the modules map (lines 69-71):

```tsx
            {loadout.modules.map((m) => (
              <span key={m} className="v2-rt-lo-perk">{MODULES[m]?.label || m}</span>
            ))}
```

with:

```tsx
            {loadout.modules.map((m) => (
              <InfoTerm key={m} id={`module-${m}`} className="v2-rt-lo-perk">{MODULES[m]?.label || m}</InfoTerm>
            ))}
```

`m` is a module id (`damage`/`repair`/`coolant`/`recon`) → `module-*` glossary ids.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p client/tsconfig.json` (or repo typecheck script).
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/v2/components/LoadoutView.tsx
git commit -m "feat(v2): loadout stats, perks, and modules are click-to-explain"
```

---

## Task 10: Coverage guard — every rendered token resolves

**Files:**
- Create: `client/src/v2/overlays/RigTerminal.infotip.test.tsx`

Rendering `RigTerminal` with `started={false}` and `mine={false}` skips `ActionConsole` (gated on `started`) and the activation control (gated on `mine && started`), so no battle-context providers are needed — only `V2GlossaryTipProvider`. This exercises mods, status, weight badge, component rows, and the heat gauge in one render.

- [ ] **Step 1: Write the test**

Create `client/src/v2/overlays/RigTerminal.infotip.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { GLOSSARY } from "/shared/glossary.js";
import { V2GlossaryTipProvider } from "../state/V2GlossaryTipContext";
import { RigTerminal } from "./RigTerminal";
import type { Rig } from "../../state/types";

const GLOSS_IDS = new Set(GLOSSARY.map((e: { id: string }) => e.id));

// A rig in several concurrent states so many mod chips render at once.
const rig = {
  id: 1, name: "Vela", kind: "rig", weightClass: "light", owner: "a",
  hull: { sp: 3, max: 6 }, arms: { sp: 5, max: 5 }, legs: { sp: 5, max: 5 },
  engine: { sp: 4, max: 4, heat: 2 },
  burning: 2, engaged: true, engagedWith: 7, painted: { by: "b", painterId: 9 },
} as unknown as Rig;

test("every click-to-explain token in the terminal resolves to a glossary def", () => {
  const { container } = render(
    <V2GlossaryTipProvider>
      <RigTerminal
        rig={rig}
        canActivate={false}
        started={false}
        mine={false}
        myTurn={false}
        onCommand={() => {}}
        onClose={() => {}}
      />
    </V2GlossaryTipProvider>,
  );
  const tokens = container.querySelectorAll<HTMLElement>("[data-info]");
  expect(tokens.length).toBeGreaterThan(0);
  for (const el of tokens) {
    const id = el.getAttribute("data-info")!;
    expect(GLOSS_IDS.has(id), `data-info "${id}" has no glossary entry`).toBe(true);
  }
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run client/src/v2/overlays/RigTerminal.infotip.test.tsx`
Expected: PASS — at least the status chip, weight badge, three+ mod chips, four component labels, and the two heat tokens carry `data-info`, all resolving.

If the render throws on a missing import/context, the culprit is an eagerly-instantiated hook — confirm `ActionConsole` and the activation control are truly gated out with `started={false}`; they are, per `RigTerminal.tsx:51` and `:116`.

- [ ] **Step 3: Commit**

```bash
git add client/src/v2/overlays/RigTerminal.infotip.test.tsx
git commit -m "test(v2): coverage guard — every terminal info token resolves to a def"
```

---

## Task 11: Full suite + manual smoke

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all green (vitest + shared node:test).

- [ ] **Step 2: Manual smoke in the browser**

Start the dev server (via the preview tool / `.claude/launch.json`), open a battle, open a rig terminal on a rig that has at least one mod chip. Verify:
- clicking a mod chip pops its definition tip,
- clicking a component label (Hull/Engine/…) pops its def,
- clicking "ENGINE HEAT" and the capacity number pops Heat / Heat Capacity,
- switching to the Loadout tab, clicking a stat label (ROF/STR/RNG) and a perk pops their defs,
- action tiles / Activate / ± steppers still act (no tip) — controls unchanged,
- tip closes on outside-click, Escape, and scroll (existing behaviour).

- [ ] **Step 3: Final commit if any smoke fixes were needed**

```bash
git add -A
git commit -m "fix(v2): click-to-explain smoke-test adjustments"
```

---

## Self-Review Notes

- **Spec coverage:** mechanism (Task 3), fold-into-GLOSSARY (Task 2), matchGlossary (Task 1), mods (Task 4+6), status (Task 5+6), badge (6), comp rows (7), heat (8), loadout stats/perks/modules (9), coverage guard (10), controls excluded (never wired). All spec sections mapped.
- **Chat-leakage risk (spec open risk):** resolved — runtime/status/part/module entries use `match: []`, so they resolve by id but never highlight in prose.
- **Type consistency:** `gloss` field name is identical across `rigModifiers` (Task 4), `rigStatus` (Task 5), and every `InfoTerm id={...}` site. `matchGlossary` signature `(text: string) => string | undefined` matches its uses in Task 9. `InfoTerm` `dataTone` added in Task 6 before first use.
- **Id-name check:** `heat`, `heat-capacity`, `rof`, `str`, `rng`, `weight-class`, `catastrophic-damage`, and the part ids `hull/arms/legs/engine` all pre-exist in `shared/glossary.js`; `tracks/turret/mount` and all runtime/status/module ids are added in Task 2. No collisions (`module-*` namespacing avoids the existing `repair` action id).
