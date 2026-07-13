# QR-Scan Commission + Post-Commission Loadout Edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players commission a rig by scanning a pre-generated per-chassis QR code (instant Standard build), and reconfigure an already-committed rig's equipment/upgrades pre-battle.

**Architecture:** A pure `qrCommission` module parses `rig:v1:<chassis-id>` payloads and resolves a scan into either an `add`-command attrs object or an error — all camera-independent and unit-tested. A thin camera overlay feeds decoded strings to it. A new server `reconfigure` verb rebuilds a pre-battle rig in place through the existing `makeUnit` path. The Commission wizard gains an edit mode that dispatches `reconfigure` instead of `add`.

**Tech Stack:** React 18 + Vite + TypeScript (client), plain ESM JS (`shared/game-state.js`, Node test runner), Vitest (client tests), `jsQR` (decode fallback), `qrcode` (offline generation script), native `BarcodeDetector` where available.

---

## File Structure

**Create:**
- `client/src/v2/lib/qrCommission.ts` — payload parse/encode + `resolveScan` (pure).
- `client/src/v2/lib/qrCommission.test.ts` — unit tests for the above.
- `client/src/v2/overlays/ScanCommission.tsx` — camera overlay; decodes frames, calls `resolveScan`, dispatches `add`.
- `scripts/gen-chassis-qr.mjs` — offline generator: one QR SVG per chassis + a contact sheet.

**Modify:**
- `shared/game-state.js` — add the `reconfigure` verb to `applyCommand` (after the `remove` branch, ~line 2611).
- `shared/game-state.test.js` — tests for `reconfigure`.
- `client/src/v2/overlays/CommissionWizard.tsx` — accept an optional `editRig`, seed from it, lock Kind/Chassis steps, dispatch `reconfigure` on submit.
- `client/src/v2/overlays/CommissionWizard.test.tsx` — edit-mode tests.
- `client/src/v2/overlays/RigTerminal.tsx` — "Edit loadout" button (pre-battle, own rig).
- `client/src/v2/V2Terminal.tsx` — wire `editRigId`, open wizard in edit mode; add the Scan button + overlay.
- `package.json` — add `jsqr` dep + `qrcode` devDep (via npm, below).

---

## Task 1: QR payload parse + scan resolver (pure, no camera)

**Files:**
- Create: `client/src/v2/lib/qrCommission.ts`
- Test: `client/src/v2/lib/qrCommission.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// client/src/v2/lib/qrCommission.test.ts
import { expect, test } from "vitest";
import { CHASSIS } from "/shared/game-state.js";
import { parseChassisQr, chassisQrPayload, resolveScan } from "./qrCommission";

const anyChassis = CHASSIS[0].id;

test("parseChassisQr accepts a valid tagged id, case-insensitively", () => {
  expect(parseChassisQr(`rig:v1:${anyChassis}`)).toBe(anyChassis);
  expect(parseChassisQr(`  rig:v1:${anyChassis.toUpperCase()}  `)).toBe(anyChassis);
});

test("parseChassisQr rejects bad prefix, bad version, unknown id, junk", () => {
  expect(parseChassisQr(`rig:v2:${anyChassis}`)).toBeNull();
  expect(parseChassisQr(`https://x/${anyChassis}`)).toBeNull();
  expect(parseChassisQr("rig:v1:not-a-real-chassis")).toBeNull();
  expect(parseChassisQr("")).toBeNull();
});

test("chassisQrPayload round-trips through parseChassisQr", () => {
  expect(parseChassisQr(chassisQrPayload(anyChassis))).toBe(anyChassis);
});

test("resolveScan builds Standard add-attrs for a free chassis", () => {
  const state = { rigs: [], game: { started: false, sides: [{ id: "a" }, { id: "b" }] } };
  const r = resolveScan(state, chassisQrPayload(anyChassis), "a");
  expect(r.ok).toBe(true);
  expect(r.attrs).toMatchObject({
    kind: "rig", chassis: anyChassis, owner: "a",
    lr: expect.any(String), melee: expect.any(String),
    equipment: expect.any(String),
    longRangeUpgrade: expect.any(String), meleeUpgrade: expect.any(String),
  });
});

test("resolveScan rejects an already-fielded chassis and unknown codes", () => {
  const state = { rigs: [{ chassis: anyChassis }], game: { started: false, sides: [{ id: "a" }, { id: "b" }] } };
  expect(resolveScan(state, chassisQrPayload(anyChassis), "a").ok).toBe(false);
  expect(resolveScan(state, "rig:v1:nope", "a").ok).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/lib/qrCommission.test.ts`
Expected: FAIL — cannot resolve `./qrCommission`.

- [ ] **Step 3: Write minimal implementation**

```ts
// client/src/v2/lib/qrCommission.ts
import { CHASSIS, EQUIPMENT, canAddRigForSide } from "/shared/game-state.js";
import { CHASSIS_NAME, firstUpgradeId, firstEquipmentUpgradeId } from "./commissionData";

// Namespace + format version. A future format bump (v2) can carry more fields
// without breaking codes already printed under v1.
export const QR_PREFIX = "rig:v1:";

// Parse a scanned string to a known chassis id, or null if it is not a valid
// v1 rig-commission code for a chassis in the catalogue.
export function parseChassisQr(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!t.startsWith(QR_PREFIX)) return null;
  const id = t.slice(QR_PREFIX.length).trim().toLowerCase();
  return CHASSIS.some((c: { id: string }) => c.id === id) ? id : null;
}

// Encode a chassis id as its printable QR payload string.
export function chassisQrPayload(id: string): string {
  return QR_PREFIX + id;
}

export interface ScanResolve {
  ok: boolean;
  attrs?: Record<string, unknown>;
  error?: string;
}

// Resolve a decoded string against current room state for a given side. On
// success, `attrs` is the exact Standard-build payload the `add` command wants;
// owner is always the scanner's side and is never read from the code.
export function resolveScan(
  state: { rigs: Array<{ chassis?: string }>; game: unknown },
  text: string,
  mySide: string,
): ScanResolve {
  const id = parseChassisQr(text);
  if (!id) return { ok: false, error: "Unrecognized code" };
  const pb = CHASSIS.find((c: { id: string }) => c.id === id)!;
  const used = new Set(state.rigs.map((r) => r.chassis).filter(Boolean));
  if (used.has(id)) return { ok: false, error: `${CHASSIS_NAME[id]} is already on the field` };
  if (!canAddRigForSide(state, mySide)) return { ok: false, error: "Your roster is full" };
  const equipment = Object.keys(EQUIPMENT)[0];
  return {
    ok: true,
    attrs: {
      name: CHASSIS_NAME[id] || pb.class,
      kind: "rig",
      chassis: id,
      class: pb.class,
      owner: mySide,
      lr: pb.longRange,
      melee: pb.melee,
      longRangeUpgrade: firstUpgradeId(pb.longRange),
      meleeUpgrade: firstUpgradeId(pb.melee),
      equipment,
      equipmentUpgrade: firstEquipmentUpgradeId(equipment),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/lib/qrCommission.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/lib/qrCommission.ts client/src/v2/lib/qrCommission.test.ts
git commit -m "feat(v2): qr commission payload parse + scan resolver"
```

---

## Task 2: `reconfigure` server verb

**Files:**
- Modify: `shared/game-state.js` (after the `remove` branch, ~line 2611)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("reconfigure swaps a pre-battle rig's equipment/upgrades in place", () => {
  const r = createRoom("RECON1");
  claimSide(r, { name: "A", side: "a" });
  claimSide(r, { name: "B", side: "b" });
  applyCommand(r, { verb: "add", attrs: { name: "Shrike", owner: "a", chassis: "medium-crossbow-talon", class: "medium", lr: "Crossbow", melee: "Talon" } });
  const before = findRig(r, "Shrike");
  const beforeId = before.id;
  applyCommand(r, { verb: "reconfigure", attrs: {
    name: "Shrike", owner: "a", equipment: "ablative-plating", equipmentUpgrade: null,
  } });
  const after = findRig(r, "Shrike");
  assert.equal(after.id, beforeId, "id preserved");
  assert.equal(after.name, "Shrike", "name preserved");
  assert.equal(after.owner, "a", "owner preserved");
  assert.equal(after.equipment, "ablative-plating", "equipment swapped");
  // Ablative Plating grants +1 max hull at commission; the rebuild must apply it.
  assert.equal(after.hull.max, before.hull.max + 1, "passive-SP equipment re-derived");
});

test("reconfigure is a no-op after start, on a non-rig, and cross-side", () => {
  const r = createRoom("RECON2");
  claimSide(r, { name: "A", side: "a" });
  claimSide(r, { name: "B", side: "b" });
  applyCommand(r, { verb: "add", attrs: { name: "Mine", owner: "a", chassis: "medium-crossbow-talon", class: "medium", lr: "Crossbow", melee: "Talon" } });
  // cross-side actor cannot reconfigure my rig
  applyCommand(r, { verb: "reconfigure", attrs: { name: "Mine", equipment: "ablative-plating" } }, { side: "b" });
  assert.notEqual(findRig(r, "Mine").equipment, "ablative-plating", "cross-side rejected");
  // after start it is frozen
  r.game.started = true;
  applyCommand(r, { verb: "reconfigure", attrs: { name: "Mine", owner: "a", equipment: "ablative-plating" } });
  assert.notEqual(findRig(r, "Mine").equipment, "ablative-plating", "post-start rejected");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — reconfigure does nothing, assertions on equipment/hull fail.

- [ ] **Step 3: Write minimal implementation**

In `shared/game-state.js`, immediately after the `} else if (verb === "remove") { ... }` block (the one ending ~line 2611), add:

```js
  } else if (verb === "reconfigure") {
    // Pre-battle loadout edit: rebuild the rig in place through the same
    // makeUnit path used by `add`, so hull/heat/effect math and the
    // one-Prototype-per-rig rule stay enforced by construction. Weapons and
    // chassis are fixed; only equipment + the three upgrade ladders change.
    if (!room.game.started) {
      const rig = findRig(room, a.name);
      const actor = normalizeSide(room, a.owner) || normalizeSide(room, context.side);
      if (rig && rig.kind === "rig" && actor && (rig.owner || "a") === actor) {
        const rebuilt = makeUnit("rig", rig.id, rig.name, rig.owner, {
          weightClass: rig.weightClass,
          longRange: rig.weapons.longRange,
          melee: rig.weapons.melee,
          chassis: rig.chassis,
          longRangeUpgrade: a.longRangeUpgrade ?? rig.weaponUpgrades?.longRange,
          meleeUpgrade: a.meleeUpgrade ?? rig.weaponUpgrades?.melee,
          equipment: a.equipment ?? rig.equipment ?? null,
          equipmentUpgrade: a.equipmentUpgrade ?? rig.equipmentUpgrade ?? null,
        });
        if (rebuilt) {
          room.rigs[room.rigs.indexOf(rig)] = rebuilt;
          resetReadyBeforeStart(room);
          changed = true;
        }
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS (both new tests green, no regressions).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: reconfigure verb rebuilds a pre-battle rig loadout in place"
```

---

## Task 3: Commission wizard edit mode

**Files:**
- Modify: `client/src/v2/overlays/CommissionWizard.tsx`
- Test: `client/src/v2/overlays/CommissionWizard.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `client/src/v2/overlays/CommissionWizard.test.tsx` (the file already mocks `useCommands` → `sendCommand`):

```ts
import type { Rig } from "../../state/types";

const editRig = {
  id: 7, name: "Shrike", kind: "rig", owner: "a", weightClass: "medium",
  weapons: { longRange: "Crossbow", melee: "Talon" },
  weaponUpgrades: { longRange: null, melee: null },
  equipment: null, equipmentUpgrade: null, chassis: "medium-crossbow-talon",
} as unknown as Rig;

test("edit mode seeds the loadout, hides Kind/Chassis, and dispatches reconfigure", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  render(<AppProviders><Seed /><CommissionWizard onClose={vi.fn()} editRig={editRig} /></AppProviders>);
  // Lands on Weapons; Kind and Chassis steps are not reachable.
  expect(await screen.findByText("Weapons")).toBeInTheDocument();
  expect(screen.queryByText("Kind")).toBeNull();
  expect(screen.queryByText("Chassis")).toBeNull();
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // Weapons → Equipment
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // Equipment → Confirm
  await user.click(await screen.findByRole("button", { name: /Commission/i }));
  expect(sendCommand).toHaveBeenCalledWith("reconfigure", expect.objectContaining({
    name: "Shrike", owner: "a",
    equipment: expect.anything(), equipmentUpgrade: expect.anything(),
    longRangeUpgrade: expect.anything(), meleeUpgrade: expect.anything(),
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/overlays/CommissionWizard.test.tsx -t "edit mode"`
Expected: FAIL — `CommissionWizard` has no `editRig` prop; still dispatches `add`.

- [ ] **Step 3: Write minimal implementation**

In `client/src/v2/overlays/CommissionWizard.tsx`:

(a) Import the `Rig` type and extend the props:

```ts
import type { Rig } from "../../state/types";
```

```ts
export function CommissionWizard({ onClose, editRig }: { onClose: () => void; editRig?: Rig }) {
```

(b) Seed initial state from `editRig` when present. Replace the `useState<WizardState>(() => { ... })` initializer body so it branches:

```ts
  const [state, setState] = useState<WizardState>(() => {
    if (editRig) {
      return {
        step: 2, // Weapons — first editable step
        kind: "rig",
        cls: editRig.weightClass || "medium",
        owner: editRig.owner || "a",
        chassis: editRig.chassis || "",
        longRange: editRig.weapons.longRange,
        melee: editRig.weapons.melee,
        longRangeUpgrade: editRig.weaponUpgrades?.longRange ?? firstUpgradeId(editRig.weapons.longRange),
        meleeUpgrade: editRig.weaponUpgrades?.melee ?? firstUpgradeId(editRig.weapons.melee),
        equipment: editRig.equipment ?? Object.keys(EQUIPMENT)[0],
        equipmentUpgrade: editRig.equipmentUpgrade ?? firstEquipmentUpgradeId(editRig.equipment ?? Object.keys(EQUIPMENT)[0]),
        template: templatesForKind("tank")[0].id,
        rigMode: "custom",
      };
    }
    const pb = availableChassis[0] ?? CHASSIS[0];
    return {
      // ...unchanged existing default-branch object...
    };
  });
```

(Keep the existing default-branch object exactly as it is; only wrap it behind the `editRig` guard.)

(c) Clamp navigation to the editable range and branch submit. Add near the other derived consts (after `const STEPS = stepsFor(state.kind);`):

```ts
  const minStep = editRig ? 2 : 0; // edit mode skips Kind + Chassis
```

(d) In `submit`, add an edit branch at the very top:

```ts
  const submit = () => {
    if (editRig) {
      sendCommand("reconfigure", {
        name: editRig.name,
        owner: editRig.owner || "a",
        longRangeUpgrade: state.longRangeUpgrade,
        meleeUpgrade: state.meleeUpgrade,
        equipment: state.equipment,
        equipmentUpgrade: state.equipmentUpgrade,
      });
      close();
      return;
    }
    // ...unchanged existing add logic...
  };
```

(e) Reconfigure is always submittable (the rig already exists — roster caps don't apply):

```ts
  const canSubmit = editRig ? true : canAdd;
```

Then in the footer CTA use `canSubmit` instead of `canAdd`:

```tsx
            <button type="button" className="v2-fw-btn cta v2-cta" disabled={!canSubmit} onClick={submit}>
              {canSubmit ? "Commission" : "Roster full"}
            </button>
```

(f) Hide skipped steps in the rail and clamp Back. In the rail `.map`, skip below `minStep`:

```tsx
            {STEPS.map((label, i) => (
              i < minStep ? null : (
              <div
                key={label}
                className={"v2-fw-step" + (i === state.step ? " on" : i < state.step ? " done" : "")}
              >
                <span className="v2-fw-step-n">{i + 1}</span>
                <span className="v2-fw-step-label">{label}</span>
                <span className="v2-fw-step-rail" aria-hidden="true" />
              </div>
              )
            ))}
```

In the footer, gate + clamp Back on `minStep`:

```tsx
          {state.step > minStep && (
            <button type="button" className="v2-fw-btn ghost" onClick={() => patch({ step: Math.max(minStep, state.step - 1) })}>
              ◂ Back
            </button>
          )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/overlays/CommissionWizard.test.tsx`
Expected: PASS — the new edit-mode test plus all existing wizard tests still green.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/overlays/CommissionWizard.tsx client/src/v2/overlays/CommissionWizard.test.tsx
git commit -m "feat(v2): commission wizard edit mode dispatches reconfigure"
```

---

## Task 4: RigTerminal "Edit loadout" button + wizard wiring

**Files:**
- Modify: `client/src/v2/overlays/RigTerminal.tsx`
- Modify: `client/src/v2/V2Terminal.tsx`
- Test: `client/src/v2/overlays/RigTerminal.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `client/src/v2/overlays/RigTerminal.test.tsx` (match the file's existing render helper / props; a pre-battle own rig is `started={false} mine={true}`):

```ts
test("pre-battle own rig shows Edit loadout and calls onEdit with the rig id", async () => {
  const user = userEvent.setup();
  const onEdit = vi.fn();
  // Reuse whatever render helper the file already defines; pass started={false},
  // mine={true}, and onEdit={onEdit}. Example if the file renders inline:
  renderRigTerminal({ started: false, mine: true, onEdit });
  await user.click(screen.getByRole("button", { name: /Edit loadout/i }));
  expect(onEdit).toHaveBeenCalledWith(expect.any(Number));
});
```

(If the test file has no shared `renderRigTerminal` helper, follow the existing test's render call and add `onEdit` to it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/overlays/RigTerminal.test.tsx -t "Edit loadout"`
Expected: FAIL — no Edit loadout button / no `onEdit` prop.

- [ ] **Step 3: Write minimal implementation**

(a) In `client/src/v2/overlays/RigTerminal.tsx`, add `onEdit` to `Props` and the signature:

```ts
interface Props {
  rig: Rig;
  canActivate: boolean;
  started: boolean;
  mine: boolean;
  myTurn: boolean;
  onCommand: (verb: string, attrs: Record<string, unknown>) => void;
  onEdit?: (rigId: number) => void;
  onClose: () => void;
}
```

```ts
export function RigTerminal({ rig, canActivate, started, mine, myTurn, onCommand, onEdit, onClose }: Props) {
```

(b) In the pre-battle actions block (the `{mine && !started && (...)}` near the Remove button), add the Edit button before Remove, gated to rigs (kind `rig`):

```tsx
        {mine && !started && (
          <div className="v2-rt-actions">
            {kind === "rig" && onEdit && (
              <button type="button" className="v2-rt-edit"
                aria-label={`Edit loadout of ${rig.name}`}
                onClick={() => { onEdit(rig.id); onClose(); }}>
                ✎ Edit loadout
              </button>
            )}
            <button type="button" className="v2-rt-remove"
              aria-label={`Remove ${rig.name}`}
              onClick={() => { onCommand("remove", { name: rig.name }); onClose(); }}>
              ✕ Remove Rig
            </button>
          </div>
        )}
```

(c) In `client/src/v2/V2Terminal.tsx`, add edit state and wire it. After `const [commissionOpen, setCommissionOpen] = useState(false);`:

```ts
  const [editRigId, setEditRigId] = useState<number | null>(null);
```

Derive the rig to edit and pass `onEdit` to RigTerminal + `editRig` to the wizard:

```tsx
  const editRig = rigs.find((r) => r.id === editRigId) || null;
```

```tsx
      {openRig && (
        <RigTerminal rig={openRig} started={started} canActivate={canActivate}
          mine={(openRig.owner || "a") === mySide} myTurn={myTurn}
          onCommand={sendCommand}
          onEdit={(id) => { setOpenRigId(null); setEditRigId(id); setCommissionOpen(true); }}
          onClose={() => setOpenRigId(null)} />
      )}
      {commissionOpen && (
        <CommissionWizard editRig={editRig ?? undefined}
          onClose={() => { setCommissionOpen(false); setEditRigId(null); }} />
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/overlays/RigTerminal.test.tsx`
Expected: PASS — Edit-loadout test plus existing RigTerminal tests green.

- [ ] **Step 5: Add the button style**

Append to `client/src/v2/styles/rig-terminal.css` (mirror the `.v2-rt-remove` rule already there — reuse its box model, just a calmer accent):

```css
.v2-rt-edit {
  /* Match .v2-rt-remove sizing; distinct (non-destructive) accent. */
  margin-right: 8px;
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/overlays/RigTerminal.tsx client/src/v2/overlays/RigTerminal.test.tsx client/src/v2/V2Terminal.tsx client/src/v2/styles/rig-terminal.css
git commit -m "feat(v2): edit-loadout entry from rig terminal opens wizard edit mode"
```

---

## Task 5: Scan overlay + Scan button

**Files:**
- Install deps
- Create: `client/src/v2/overlays/ScanCommission.tsx`
- Modify: `client/src/v2/V2Terminal.tsx`

- [ ] **Step 1: Install the decode fallback dependency**

Run: `npm install jsqr`
Expected: `jsqr` added to `dependencies` in `package.json`.

- [ ] **Step 2: Create the scan overlay**

All decision logic lives in `resolveScan` (Task 1, unit-tested). This component only handles camera plumbing + decoding and delegates.

```tsx
// client/src/v2/overlays/ScanCommission.tsx
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { useRoomState } from "../../state/RoomStateContext";
import { resolveScan } from "../lib/qrCommission";

// Native detector where available (Chromium/Android); jsQR fallback otherwise.
type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
const makeDetector = (): Detector | null => {
  const BD = (globalThis as unknown as { BarcodeDetector?: new (o: unknown) => Detector }).BarcodeDetector;
  return BD ? new BD({ formats: ["qr_code"] }) : null;
};

export function ScanCommission({ onClose }: { onClose: () => void }) {
  const { rigs, game } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const detector = makeDetector();
    const canvas = document.createElement("canvas");

    const handle = (text: string) => {
      const r = resolveScan({ rigs, game }, text, mySide);
      if (!r.ok) { setError(r.error || "Unrecognized code"); return; } // keep scanning
      done = true;
      sendCommand("add", r.attrs!);
      onClose();
    };

    const tick = async () => {
      const v = videoRef.current;
      if (!done && v && v.readyState === v.HAVE_ENOUGH_DATA) {
        try {
          if (detector) {
            const hits = await detector.detect(v);
            if (hits[0]?.rawValue) handle(hits[0].rawValue);
          } else {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code?.data) handle(code.data);
          }
        } catch { /* transient decode error; keep polling */ }
      }
      if (!done) raf = requestAnimationFrame(tick);
    };

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setError("Camera unavailable — commission from the wizard instead."));

    return () => { done = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [rigs, game, mySide, sendCommand, onClose]);

  return (
    <div className="v2-fw-scrim v2-scrim v2-scrim--oil show"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="v2-fw-card v2-panel" role="dialog" aria-modal="true" aria-label="Scan a chassis code">
        <div className="v2-fw-head">
          <div className="v2-fw-order v2-eyebrow">Commission Order · Scan</div>
          <h2 className="v2-fw-title v2-title">◈ Scan a chassis code</h2>
        </div>
        <div className="v2-fw-body">
          <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 8 }} />
          {error && <div className="v2-fw-hint" role="alert">{error}</div>}
        </div>
        <div className="v2-fw-nav">
          <button type="button" className="v2-fw-btn ghost" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Wire the Scan button + overlay into V2Terminal**

In `client/src/v2/V2Terminal.tsx`, import and add state:

```ts
import { ScanCommission } from "./overlays/ScanCommission";
```

```ts
  const [scanOpen, setScanOpen] = useState(false);
```

Render a Scan launcher and the overlay. Add the button next to the existing commission entry (place it in the same region the Commission control lives — the `Squadron`/`TurnBanner` already expose `onCommission`; add a sibling control). Minimal: mount the overlay and a floating button:

```tsx
      {!started && (
        <button type="button" className="v2-scan-fab" onClick={() => setScanOpen(true)}>
          ▦ Scan
        </button>
      )}
      {scanOpen && <ScanCommission onClose={() => setScanOpen(false)} />}
```

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc -p client --noEmit` then `npm test`
Expected: no type errors; all tests pass (the overlay has no unit test — its logic is covered by Task 1's `resolveScan` tests).

- [ ] **Step 5: Manual verification (preview)**

Start the app (`preview_start` with the dev server), open the yard pre-battle, click **Scan**. With no physical code, confirm the camera-unavailable / permission path renders the hint without crashing (jsdom-free, real browser). Full scan-to-commission is verified end-to-end once codes are generated in Task 6.

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/overlays/ScanCommission.tsx client/src/v2/V2Terminal.tsx client/src/v2/styles package.json package-lock.json
git commit -m "feat(v2): scan a chassis QR to commission a Standard rig"
```

---

## Task 6: Chassis QR generation script

**Files:**
- Install dev dep
- Create: `scripts/gen-chassis-qr.mjs`

- [ ] **Step 1: Install the generator dependency**

Run: `npm install -D qrcode`
Expected: `qrcode` added to `devDependencies`.

- [ ] **Step 2: Write the generator**

```js
// scripts/gen-chassis-qr.mjs
// Offline: emits one printable QR SVG per chassis + a contact sheet.
// Run: node scripts/gen-chassis-qr.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import QRCode from "qrcode";
import { CHASSIS } from "../shared/game-state.js";
import { QR_PREFIX } from "../client/src/v2/lib/qrCommission.ts"; // see note below

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "qr");

async function main() {
  await mkdir(OUT, { recursive: true });
  const cards = [];
  for (const c of CHASSIS) {
    const payload = `${QR_PREFIX}${c.id}`;
    const svg = await QRCode.toString(payload, { type: "svg", margin: 1 });
    await writeFile(join(OUT, `${c.id}.svg`), svg, "utf8");
    cards.push(
      `<figure style="display:inline-block;width:200px;margin:8px;text-align:center;font-family:sans-serif">
        ${svg}
        <figcaption><strong>${c.name}</strong><br><small>${c.label}</small></figcaption>
      </figure>`,
    );
  }
  await writeFile(
    join(OUT, "contact-sheet.html"),
    `<!doctype html><meta charset="utf-8"><title>Chassis QR sheet</title><body>${cards.join("\n")}</body>`,
    "utf8",
  );
  console.log(`Wrote ${CHASSIS.length} codes + contact-sheet.html to ${OUT}`);
}
main();
```

**Note on the `QR_PREFIX` import:** a `.mjs` Node script cannot import from a `.ts` client file directly. Choose ONE:
- Simplest: inline `const QR_PREFIX = "rig:v1:";` at the top of the script (single constant, low duplication risk — it is format-versioned and rarely changes), and drop the cross-import.
Use the inline constant.

- [ ] **Step 3: Run the generator**

Run: `node scripts/gen-chassis-qr.mjs`
Expected: `Wrote <N> codes + contact-sheet.html to .../docs/qr`, one `<chassis-id>.svg` per catalogue entry.

- [ ] **Step 4: Spot-check a code round-trips**

Open `docs/qr/contact-sheet.html` in a browser, scan one code with a phone; the decoded text must read `rig:v1:<that-chassis-id>`. (Sanity check only — no automated test for generated art.)

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-chassis-qr.mjs docs/qr package.json package-lock.json
git commit -m "chore: generate printable per-chassis commission QR codes"
```

---

## Final verification

- [ ] Run the full suite: `npm test` — all client (Vitest) and server (node --test) tests pass.
- [ ] Typecheck: `npx tsc -p client --noEmit` — clean.
- [ ] Preview end-to-end: scan a generated code → Standard rig commissions for your side; open its terminal pre-battle → **Edit loadout** → change equipment/upgrade → Confirm → loadout updates and both sides' ready state resets.

## Spec coverage check

- QR format `rig:v1:<id>` + version prefix → Task 1 (`QR_PREFIX`, `parseChassisQr`).
- Generation script over `CHASSIS` + contact sheet → Task 6.
- Scan entry point, `BarcodeDetector` + `jsQR` fallback, camera-denied message → Task 5.
- Validate / no-mirror / capacity guards / owner = scanner side → Task 1 (`resolveScan`), consumed in Task 5.
- Instant Standard `add` via client-resolved attrs, server untouched → Tasks 1 + 5.
- `reconfigure` verb: makeUnit rebuild, pre-battle + own-rig gate, identity preserved, `resetReadyBeforeStart` → Task 2.
- Wizard edit mode: seed, lock Kind/Chassis, dispatch `reconfigure` → Task 3.
- Edit entry from RigTerminal, same pre-battle gate as Decommission → Task 4.
- Non-goals (no player-authored codes, no weapon swap, no post-start edit, owner not encoded) → enforced by Tasks 1–3 (weapons/chassis fixed in edit seed; `!started` gate; owner from `mySide`/`rig.owner`).
