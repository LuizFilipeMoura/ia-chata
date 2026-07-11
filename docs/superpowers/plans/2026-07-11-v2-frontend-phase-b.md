# V2 Frontend — Phase B Implementation Plan (Commission Wizard / Forge)

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Native V2 commission wizard replacing Phase A's interim V1-wizard delegation. Full parity with V1 `UnitWizard`, wired to the same `add` command + shared data.

**Architecture:** Modal overlay `CommissionWizard` inside `.v2-root`, opened from the Yard add-card and the Forge channel button. V2Terminal owns `commissionOpen`. Reuses shared data 100%.

**Tech Stack:** React+TS, Vite, Vitest + testing-library.

**Reference:** Spec `docs/superpowers/specs/2026-07-11-v2-frontend-phase-b-design.md`. V1 wizard to port: `client/src/components/wizards/UnitWizard.tsx` (structure + `add`-command field sets + one-Prototype rule). Visual source: `client/src/v2/design-reference/oil-iron-terminal.html` lines 224–308 (Forge: step rail, kind cards, chassis roster, upgrade bay). Map inline styles → scoped `forge.css` classes under `.v2-root`.

**Shared data (verified in UnitWizard.tsx):** from `/shared/game-state.js`: `WEAPONS`, `EQUIPMENT`, `canAddRigForSide`, `WEAPON_UPGRADES` (name→`{id,name,nature,tag}[]`), `RIG_DEFAULTS` (class→`{hull,arms,engine}`), `HEAT_CAPACITY` (class→n), `UNIT_WEAPONS` (name→`{rof,str,melee?,rng?,sweet?,minRange?,maxRange?,perks?}`), `CHASSIS` (`{id,class,longRange,melee,label}[]`), `upgradeNature(weaponName, upgradeId)`. `UNIT_KINDS` from `/shared/unit-kinds.js`.

**add command field sets (verified):**
- Rig: `add { name, kind:"rig", chassis, class, owner, lr, melee, longRangeUpgrade, meleeUpgrade, equipment }`
- Tank/Walker: `add { name, kind, owner, unit }`

**Test command:** `npx vitest run <path>` from repo root. Branch: `frontend/v2-redesign`. Targeted `git add client/src/v2` only.

---

## Task 1: commissionData.ts (ported display maps + helper)

**Files:** Create `client/src/v2/lib/commissionData.ts`, `client/src/v2/lib/commissionData.test.ts`.

- [ ] **Step 1** — failing test `client/src/v2/lib/commissionData.test.ts`:
```ts
import { expect, test } from "vitest";
import { CHASSIS_NAME, weaponGlyph, natureLabel, firstUpgradeId } from "./commissionData";

test("chassis codename lookup", () => {
  expect(CHASSIS_NAME["light-claw-autocannon"]).toBe("Ironjaw");
});
test("weapon glyph falls back to a gear", () => {
  expect(weaponGlyph("Autocannon")).toBe("🎯");
  expect(weaponGlyph("Nonexistent")).toBe("⚙");
});
test("nature label maps ordnance stamps", () => {
  expect(natureLabel("field")).toBe("Standard");
  expect(natureLabel("tuned")).toBe("Machined");
  expect(natureLabel("prototype")).toBe("Prototype");
});
test("firstUpgradeId returns the first upgrade id for a weapon or null", () => {
  // Autocannon exists in WEAPON_UPGRADES; unknown weapon → null
  expect(firstUpgradeId("Autocannon")).toBeTypeOf("string");
  expect(firstUpgradeId("Nonexistent")).toBeNull();
});
```

- [ ] **Step 2** — run `npx vitest run client/src/v2/lib/commissionData.test.ts` → FAIL.

- [ ] **Step 3** — implement `client/src/v2/lib/commissionData.ts`:
```ts
import { WEAPON_UPGRADES } from "/shared/game-state.js";

// Dieselpunk chassis codenames — ported from V1 UnitWizard.
export const CHASSIS_NAME: Record<string, string> = {
  "light-claw-autocannon": "Ironjaw",
  "light-missile-flamethrower": "Cinderwalk",
  "light-saw-minigun": "Scrapmaw",
  "light-wreckingball-double": "Sledge",
  "light-sword-arc": "Arclight",
  "medium-lance-mortar": "Halberd",
  "medium-shield-siege": "Rampart",
  "medium-sniper-chainsaw": "Deadeye",
};

const WEAPON_GLYPH: Record<string, string> = {
  "Autocannon": "🎯", "Mini Gun": "🎯", "Double MG": "🎯", "Sniper Cannon": "🎯",
  "Arc Gun": "⚡", "Mortar": "💥", "Missile Barrage": "🚀", "Siege Maul": "🔨",
  "Claw": "🦾", "Flamethrower": "🔥", "Circular Saw": "🪚", "Chainsaw": "🪚",
  "Wrecking Ball": "⛓️", "Sword": "🗡️", "Lance": "🗡️", "Bulwark Shield": "🛡️",
};
export const weaponGlyph = (weapon: string): string => WEAPON_GLYPH[weapon] || "⚙";

const NATURE_LABEL: Record<string, string> = { field: "Standard", tuned: "Machined", prototype: "Prototype" };
export const natureLabel = (nature: string): string => NATURE_LABEL[nature] || nature;

export const NODE_MARK = ["I", "II", "III"];

export function firstUpgradeId(name: string): string | null {
  return (WEAPON_UPGRADES[name] || [])[0]?.id || null;
}
```

- [ ] **Step 4** — run test → PASS. `npx tsc -p . --noEmit` clean.
- [ ] **Step 5** — commit: `git add client/src/v2/lib && git commit -m "feat(v2): commission display data + helpers"`

---

## Task 2: CommissionWizard component

**Files:** Create `client/src/v2/overlays/CommissionWizard.tsx`, `client/src/v2/overlays/CommissionWizard.test.tsx`, `client/src/v2/styles/forge.css`.

This is a faithful port of `client/src/components/wizards/UnitWizard.tsx` into V2 classes + the mockup's Forge look. **Read the V1 file** and replicate: `WizardState`, `stepsFor`, `selectChassis`, `upgradePath` (with the one-Prototype lock via `otherIsPrototype`), `upgradeBay`, the step bodies (kind cards / chassis roster / equipment grid / unit-weapon grid / confirm), and `submit`. Differences from V1:
- Props: `{ onClose: () => void }`. Uses `useRoomState`, `useCommands`, `useMySide` (same as V1) but NOT `useUi`/GlossaryText (glossary is Phase D — render upgrade/equipment tag text as plain text).
- Class names are V2 (`v2-fw-*`), styled in `forge.css`.
- Same `add` field sets and `canAddRigForSide` gating.
- Keep the `/api/chassis` flavor fetch (optional, falls back to built-ins) — same as V1.

- [ ] **Step 1** — failing test `client/src/v2/overlays/CommissionWizard.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useEffect } from "react";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { CommissionWizard } from "./CommissionWizard";

const sendCommand = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));

function Seed() {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON", side: "a", name: "K" } });
    dispatch({ type: "applyServerState", state: {
      version: 1, ownerSide: "a", field: null, rigs: [],
      game: { round: 1, phase: "setup", started: false, sides: [{ id: "a", name: "K", vp: 0, ready: false }] },
    } as ServerState });
  }, [dispatch]);
  return null;
}

function open() {
  render(<AppProviders><Seed /><CommissionWizard onClose={vi.fn()} /></AppProviders>);
}

test("rig flow has an Equipment step; tank flow does not", async () => {
  const user = userEvent.setup();
  open();
  // default kind = rig → step rail shows Equipment
  expect(await screen.findByText("Equipment")).toBeInTheDocument();
  // switch to Tank
  await user.click(screen.getByText("Tank"));
  expect(screen.queryByText("Equipment")).toBeNull();
});

test("commissioning a rig dispatches add with the rig field set", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  open();
  // Kind(0) → Next → Chassis(1) → Next → Equipment(2) → Next → Confirm(3) → Commission
  await user.click(await screen.findByRole("button", { name: /^Next$/i }));
  await user.click(await screen.findByRole("button", { name: /^Next$/i }));
  await user.click(await screen.findByRole("button", { name: /^Next$/i }));
  await user.click(await screen.findByRole("button", { name: /Commission/i }));
  expect(sendCommand).toHaveBeenCalledWith("add", expect.objectContaining({
    kind: "rig", chassis: expect.any(String), owner: "a",
    lr: expect.any(String), melee: expect.any(String), equipment: expect.any(String),
  }));
});
```

- [ ] **Step 2** — run `npx vitest run client/src/v2/overlays/CommissionWizard.test.tsx` → FAIL.

- [ ] **Step 3** — implement `client/src/v2/overlays/CommissionWizard.tsx` by porting V1 `UnitWizard.tsx` (see the file for the full structure). Key requirements the tests pin:
  - Step rail renders the labels from `stepsFor(kind)` (rig: `["Kind","Chassis","Equipment","Confirm"]`, tank/walker: `["Kind","Weapon","Confirm"]`). NOTE: V1 labels the rig step-1 "Weapons"; use "Chassis" here to match the spec/mockup step rail — but the important test hook is the presence/absence of "Equipment".
  - Kind cards labelled RIG/TANK/WALKER (the clickable card text must include "Tank" so the test can click it).
  - `Next`/`Back` nav; final step button labelled "Commission" (or "Roster full" when `!canAddRigForSide`).
  - Chassis step defaults to `CHASSIS[0]` selected so a straight Next→Next→Next→Commission produces a valid rig `add` with `chassis/lr/melee/equipment` set.
  - `submit` sends the exact V1 field sets (rig vs tank/walker).
  - Import `firstUpgradeId, CHASSIS_NAME, weaponGlyph, natureLabel, NODE_MARK` from `../lib/commissionData`.
  Use plain text (no GlossaryText) for `.tag`/`.passive`/`.active.text`.

- [ ] **Step 4** — create `client/src/v2/styles/forge.css`, all selectors under `.v2-root`, porting mockup lines 224–308 (scrim + sheet, step rail with numbered chips, kind cards, chassis roster grid cards with emblem/pips/stats, upgrade bay with weapon head + 3-node path where Prototype node is hazard-lit and `.locked` dimmed, equipment grid, confirm rows, Back/Next/Commission nav). Include a `.v2-fw-scrim`/`.v2-fw-card` modal frame.

- [ ] **Step 5** — run the test → PASS (2 tests). `npx tsc -p . --noEmit` clean.
- [ ] **Step 6** — commit: `git add client/src/v2 && git commit -m "feat(v2): commission wizard (rig/tank/walker)"`

---

## Task 3: Wire the wizard into the shell + Squadron + Forge channel

**Files:** Modify `client/src/v2/V2Terminal.tsx`, `client/src/v2/screens/Squadron.tsx`, `client/src/v2/components/Shell.tsx`, `client/src/v2/screens/Squadron.test.tsx` (update).

- [ ] **Step 1** — Update `Squadron` to call an `onCommission` prop instead of `useWizard().openCommission()`:
  - Add `onCommission: () => void` to `Squadron`'s props.
  - Replace `const { openCommission } = useWizard();` usage: the add-card `onClick` becomes `() => canAdd && onCommission()`. Remove the `useWizard` import.
  - Update `Squadron.test.tsx`: render `<Squadron onOpenRig={vi.fn()} onCommission={vi.fn()} />`.

- [ ] **Step 2** — Update `Shell` to enable the Forge channel and accept an `onForge` handler:
  - Add optional prop `onForge?: () => void`.
  - In the channel list, make `commission` (Forge) `enabled: true` and, when clicked, call `onForge?.()`. Keep `aria-current` on the active `channel` prop. (Yard stays the active channel; Forge is a button that opens the overlay, not a route.)
  - Update `Shell.test.tsx`'s "only Yard active" assertion: Forge is now **enabled** (a button) but not `aria-current`. Change the test to assert Forge is enabled and `Rules`/`Verdict` remain disabled.

- [ ] **Step 3** — Update `V2Terminal` to own `commissionOpen` and render the wizard:
```tsx
import { useState } from "react";
import { Shell } from "./components/Shell";
import { Squadron } from "./screens/Squadron";
import { RigTerminal } from "./overlays/RigTerminal";
import { CommissionWizard } from "./overlays/CommissionWizard";
import { useRoomState } from "../state/RoomStateContext";
import { useCommands } from "../hooks/useCommands";
import { useMySide } from "../hooks/useMySide";

export function V2Terminal() {
  const { rigs, game } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const [openRigId, setOpenRigId] = useState<number | null>(null);
  const [commissionOpen, setCommissionOpen] = useState(false);

  const openRig = rigs.find((r) => r.id === openRigId) || null;
  const started = Boolean(game?.started);
  const pendingGate = Boolean(game?.pendingAnswer || game?.pendingReaction || game?.pendingBlast);
  const canActivate =
    !!openRig && started && game?.phase === "activation" && game?.turn?.side === mySide &&
    (openRig.owner || "a") === mySide && game?.turn?.activeRigId == null && !pendingGate &&
    !openRig.activated && !openRig.destroyed;

  return (
    <Shell channel="yard" onForge={() => setCommissionOpen(true)}>
      <Squadron onOpenRig={setOpenRigId} onCommission={() => setCommissionOpen(true)} />
      {openRig && (
        <RigTerminal rig={openRig} started={started} canActivate={canActivate}
          onCommand={sendCommand} onClose={() => setOpenRigId(null)} />
      )}
      {commissionOpen && <CommissionWizard onClose={() => setCommissionOpen(false)} />}
    </Shell>
  );
}
```

- [ ] **Step 4** — run `npx vitest run client/src/v2` — all green. `npx tsc -p . --noEmit` clean.
- [ ] **Step 5** — Browser verify (dev server on 5173, backend on 8000): open `/?v2`, join, click "Commission New Rig" → V2 Forge opens; step through Kind→Chassis (pick a chassis, see upgrade bay, select a Prototype, confirm the other weapon's Prototype locks)→Equipment→Confirm→Commission; the new rig appears in the V2 roster. Also click the Forge channel button — opens the same wizard. Confirm no console errors.
- [ ] **Step 6** — commit: `git add client/src/v2 && git commit -m "feat(v2): wire commission wizard into shell, squadron, forge channel"`

---

## Self-Review Notes
- Coverage: data maps (T1), wizard incl. one-Prototype lock + both add field sets (T2), wiring + Forge channel + removal of interim V1 delegation (T3).
- Type consistency: `CommissionWizard { onClose }`; `Squadron { onOpenRig, onCommission }`; `Shell { channel, onForge?, children }`.
