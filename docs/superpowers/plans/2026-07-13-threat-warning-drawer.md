# Threat Warning Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an enemy opens an attack on one of your Rigs, throw up a loud, blocking "INCOMING FIRE" overlay on the defender's screen — klaxon, shake, hazard bars, targeting reticle — that clears when the attacker fires or backs off.

**Architecture:** The attacker's device broadcasts a cosmetic `threat` command when the attack sheet opens (debounced) and clears it on fire/close. The server stores it as `game.pendingThreat` (whole game object ships to clients, so it auto-propagates) and sweeps it stale on any turn/activation/phase change. The defender's device renders a new state-driven `ThreatOverlay` when `pendingThreat.defender === mySide`.

**Tech Stack:** Plain-JS shared game engine (`shared/game-state.js`, tested with `node --test`); React + TypeScript client under `client/src/v2/` (tested with Vitest + Testing Library); Web-Audio mixer in `client/src/v2/audio/`.

**Spec:** `docs/superpowers/specs/2026-07-13-threat-warning-drawer-design.md`

---

## File Structure

- `shared/game-state.js` — add `pendingThreat` field, the `threat` verb (declare/clear), a stale-sweep helper, and an explicit clear when an `action` shot resolves.
- `shared/game-state.test.js` — server-side tests for the verb and sweeps.
- `client/src/state/types.ts` — add `pendingThreat?` to `GameState`.
- `client/src/v2/audio/actionAudio.ts` — add `playThreatAlarm()`.
- `client/src/v2/audio/actionAudio.test.ts` — test the new stem list resolves.
- `client/src/v2/overlays/ThreatOverlay.tsx` — **new** defender overlay (state-driven, blocking).
- `client/src/v2/overlays/ThreatOverlay.test.tsx` — **new** overlay tests.
- `client/src/v2/styles/overlay.css` — loud `v2-threat-*` styles + keyframes.
- `client/src/v2/V2Terminal.tsx` — mount `<ThreatOverlay />`.
- `client/src/v2/overlays/AttackWizard.tsx` — broadcast declare/clear.
- `client/src/v2/overlays/AttackWizard.test.tsx` — test the broadcast (may already exist; extend it).

Run the full suite any time with: `npm test`
Run only shared server tests: `node --test "shared/**/*.test.js"`
Run one Vitest file: `npx vitest run client/src/v2/overlays/ThreatOverlay.test.tsx`

---

## Task 1: Server — `pendingThreat` field

**Files:**
- Modify: `shared/game-state.js` (game factory ~line 646; `ensureGameShape` ~line 798)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("createRoom seeds pendingThreat null", () => {
  const r = createRoom("THREAT0");
  assert.equal(r.game.pendingThreat, null);
});

test("ensureGameShape backfills pendingThreat on legacy rooms", () => {
  const r = createRoom("THREAT1");
  delete r.game.pendingThreat;
  // Any applyCommand runs ensureGameShape first.
  applyCommand(r, { verb: "reset", attrs: {} });
  assert.equal(r.game.pendingThreat, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "shared/game-state.test.js"`
Expected: FAIL — `pendingThreat` is `undefined`, not `null`.

- [ ] **Step 3: Add the field + backfill**

In the game factory object (near `pendingReaction: null,` at ~line 648) add:

```js
      pendingReaction: null,
      pendingThreat: null,
```

In `ensureGameShape` (near line 799, after the `pendingReaction` backfill) add:

```js
  if (room.game.pendingReaction === undefined) room.game.pendingReaction = null;
  if (room.game.pendingThreat === undefined) room.game.pendingThreat = null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "shared/game-state.test.js"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): add pendingThreat game field for attack telegraph"
```

---

## Task 2: Server — `threat` verb (declare / clear)

**Files:**
- Modify: `shared/game-state.js` (add an else-if branch in `applyCommand`, just before `} else if (verb === "randomize") {` at ~line 3078)
- Test: `shared/game-state.test.js`

Reuse the existing `battleWithPreparedDefender` helper's shape — but write a smaller local helper that sets side A's rig mid-activation.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js`:

```js
// A active mid-activation, B is the enemy. Returns { room, a, b }.
function battleMidActivation() {
  const room = createRoom("THR");
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Atk", class: "medium", owner: "a", longRange: "Autocannon", melee: "Sword" } });
  applyCommand(room, { verb: "add", attrs: { name: "Def", class: "medium", owner: "b", longRange: "Autocannon", melee: "Sword" } });
  const a = findRig(room, "Atk");
  const b = findRig(room, "Def");
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: a.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  a.loaded = { longRange: true, melee: true };
  return { room, a, b };
}

test("threat declare sets pendingThreat keyed to the target's owner", () => {
  const { room, a, b } = battleMidActivation();
  applyCommand(room, { verb: "threat", attrs: { action: "declare", target: "Def", mode: "fire", weapon: "Autocannon", side: "a" } });
  assert.deepEqual(room.game.pendingThreat, {
    attackerId: a.id, targetId: b.id, defender: "b", mode: "fire", weapon: "Autocannon",
  });
});

test("threat clear nulls it", () => {
  const { room } = battleMidActivation();
  applyCommand(room, { verb: "threat", attrs: { action: "declare", target: "Def", mode: "fire", weapon: "Autocannon", side: "a" } });
  applyCommand(room, { verb: "threat", attrs: { action: "clear", side: "a" } });
  assert.equal(room.game.pendingThreat, null);
});

test("only the active side may declare a threat", () => {
  const { room } = battleMidActivation();
  applyCommand(room, { verb: "threat", attrs: { action: "declare", target: "Def", mode: "fire", weapon: "Autocannon", side: "b" } });
  assert.equal(room.game.pendingThreat, null);
});

test("threat declare on a friendly or unknown target is a no-op", () => {
  const { room } = battleMidActivation();
  applyCommand(room, { verb: "threat", attrs: { action: "declare", target: "Atk", mode: "fire", weapon: "Autocannon", side: "a" } });
  assert.equal(room.game.pendingThreat, null);
  applyCommand(room, { verb: "threat", attrs: { action: "declare", target: "Ghost", mode: "fire", weapon: "Autocannon", side: "a" } });
  assert.equal(room.game.pendingThreat, null);
});

test("threat is not undoable", () => {
  const { room } = battleMidActivation();
  const before = room._history.length;
  applyCommand(room, { verb: "threat", attrs: { action: "declare", target: "Def", mode: "fire", weapon: "Autocannon", side: "a" } });
  assert.equal(room._history.length, before); // no snapshot pushed
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test "shared/game-state.test.js"`
Expected: FAIL — the `threat` verb is unhandled, so `pendingThreat` stays `null` on declare.

- [ ] **Step 3: Add the verb branch**

In `applyCommand`, immediately before `} else if (verb === "randomize") {` (~line 3078) insert:

```js
  } else if (verb === "threat") {
    // Cosmetic attack telegraph: the active side broadcasts that it has opened
    // an attack on an enemy Rig, so the defender's client can raise the loud
    // "incoming fire" overlay. Never enters undo history (see UNDO_VERBS).
    const action = String(a.action || "declare").toLowerCase();
    const side = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    const t = room.game.turn;
    if (room.game.phase === "activation" && side && t && t.side === side) {
      if (action === "clear") {
        if (room.game.pendingThreat && room.game.pendingThreat.attackerId === t.activeRigId) {
          room.game.pendingThreat = null;
          changed = true;
        }
      } else if (t.activeRigId != null) {
        const attacker = room.rigs.find((r) => r.id === t.activeRigId);
        const target = room.rigs.find((r) => r.name === a.target && !r.destroyed);
        if (attacker && (attacker.owner || "a") === side &&
            target && (target.owner || "a") !== side) {
          room.game.pendingThreat = {
            attackerId: attacker.id,
            targetId: target.id,
            defender: target.owner || "b",
            mode: String(a.mode || "fire"),
            weapon: String(a.weapon || ""),
          };
          changed = true;
        }
      }
    }
```

Do **not** add `"threat"` to `UNDO_VERBS`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test "shared/game-state.test.js"`
Expected: PASS (all five new tests).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): threat verb declares/clears the attack telegraph"
```

---

## Task 3: Server — auto-clear sweep + clear on resolved shot

**Files:**
- Modify: `shared/game-state.js` (stale sweep near top of `applyCommand` ~line 2542; explicit clear in the `action` branch ~line 2874)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test("pendingThreat clears when the active rig's activation ends", () => {
  const { room } = battleMidActivation();
  applyCommand(room, { verb: "threat", attrs: { action: "declare", target: "Def", mode: "fire", weapon: "Autocannon", side: "a" } });
  applyCommand(room, { verb: "endactivation", attrs: { side: "a" } });
  assert.equal(room.game.pendingThreat, null);
});

test("pendingThreat clears once the shot resolves", () => {
  const { room } = battleMidActivation();
  applyCommand(room, { verb: "threat", attrs: { action: "declare", target: "Def", mode: "fire", weapon: "Autocannon", side: "a" } });
  applyCommand(room, { verb: "action", attrs: {
    name: "Atk", action: "fire", target: "Def", weapon: "longRange",
    arc: "front", range: "near", distance: 6, cover: 0,
  } });
  assert.equal(room.game.pendingThreat, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test "shared/game-state.test.js"`
Expected: FAIL — nothing clears `pendingThreat` on endactivation or after the shot.

- [ ] **Step 3a: Add the stale-sweep helper**

Add this function near the other module-level helpers (e.g. just above `export function applyCommand`):

```js
// A parked threat telegraph is stale the moment the active rig is no longer the
// declaring attacker (activation ended, turn flipped) or we left activation.
// Returns true if it cleared anything.
function clearThreatIfStale(room) {
  const th = room.game.pendingThreat;
  if (!th) return false;
  if (room.game.phase !== "activation" || room.game.turn?.activeRigId !== th.attackerId) {
    room.game.pendingThreat = null;
    return true;
  }
  return false;
}
```

- [ ] **Step 3b: Call the sweep at the END of `applyCommand`**

The sweep must run *after* the verb has mutated state — otherwise `endactivation` (which nulls `activeRigId`) wouldn't be seen as stale until the *next* command. Place it immediately before the final commit block `if (changed) {` (~line 3105):

```js
  // Post-command: clear a now-stale attack telegraph — activation ended, turn
  // flipped, or we left activation. A fresh `threat` declare is never stale here
  // (its attackerId is the still-active rig), so this is safe for every verb.
  changed = clearThreatIfStale(room) || changed;

  if (changed) {
```

(Do not also add a copy at the top of the function — end placement is the only correct one.)

- [ ] **Step 3c: Explicitly clear when a shot resolves**

In the `} else if (verb === "action") {` branch (~line 2874), after the action is dispatched/resolved (at the end of that branch body, before the next `} else if`), add:

```js
    // The shot (or its declaration) is over — drop the telegraph so the
    // defender's overlay yields to the dice/recap.
    room.game.pendingThreat = null;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test "shared/game-state.test.js"`
Expected: PASS. Also re-run the whole shared suite to catch regressions: `node --test "shared/**/*.test.js"` → all pass.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): sweep the attack telegraph stale on turn/activation/shot"
```

---

## Task 4: Client — `playThreatAlarm` audio

**Files:**
- Modify: `client/src/v2/audio/actionAudio.ts`
- Test: `client/src/v2/audio/actionAudio.test.ts`

First, open `client/src/v2/audio/actionAudio.test.ts` to match its existing style (it already tests stem→URL resolution). Mirror the closest existing test.

- [ ] **Step 1: Write the failing test**

Add to `client/src/v2/audio/actionAudio.test.ts`:

```ts
import { playThreatAlarm } from "./actionAudio";

test("playThreatAlarm is callable without throwing", () => {
  // The mixer is a no-op without a real AudioContext (jsdom); we only assert the
  // export exists and runs. Fuller behaviour is covered by the mixer's own tests.
  expect(() => playThreatAlarm()).not.toThrow();
});
```

If the file uses a different import grouping, add `playThreatAlarm` to the existing import from `./actionAudio` instead of a new import line.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/audio/actionAudio.test.ts`
Expected: FAIL — `playThreatAlarm` is not exported.

- [ ] **Step 3: Add the function**

In `client/src/v2/audio/actionAudio.ts`, near `playBraceForImpact` (~line 88), add:

```ts
// Loud attack-telegraph klaxon: a warning beep layered with the brace bark, for
// the defender's "incoming fire" overlay. Respects the mixer's enabled flag.
const THREAT_SFX = ["beep_warning", "brace_for_impact"];
export function playThreatAlarm(): void {
  play([], urls(THREAT_SFX));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/audio/actionAudio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/audio/actionAudio.ts client/src/v2/audio/actionAudio.test.ts
git commit -m "feat(v2): playThreatAlarm klaxon for the attack telegraph"
```

---

## Task 5: Client — `ThreatOverlay` component + type + styles

**Files:**
- Modify: `client/src/state/types.ts` (add `pendingThreat?` to `GameState`)
- Create: `client/src/v2/overlays/ThreatOverlay.tsx`
- Create: `client/src/v2/overlays/ThreatOverlay.test.tsx`
- Modify: `client/src/v2/styles/overlay.css` (append `v2-threat-*` rules)

- [ ] **Step 1: Add the GameState type field**

In `client/src/state/types.ts`, inside `interface GameState` (after `pendingReaction?` at line 162) add:

```ts
  pendingThreat?: {
    attackerId: number;
    targetId: number;
    defender: string;
    mode: string;
    weapon: string;
  } | null;
```

- [ ] **Step 2: Write the failing test**

Create `client/src/v2/overlays/ThreatOverlay.test.tsx`:

```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { V2Providers } from "../state/V2Providers";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { ThreatOverlay } from "./ThreatOverlay";

function Seed({ state, side }: { state: ServerState; side: string }) {
  const d = useRoomDispatch();
  useEffect(() => {
    d({ type: "setSession", session: { room: "IR", side, name: "K" } });
    d({ type: "applyServerState", state });
  }, [d, state, side]);
  return null;
}

const RIGS = [
  { id: 1, name: "Ironjaw", owner: "a" },
  { id: 2, name: "Rivethead", owner: "b" },
] as any;

function stateWithThreat(): ServerState {
  return {
    version: 1, ownerSide: "b", field: null, rigs: RIGS,
    game: {
      round: 1, phase: "activation", started: true, sides: [],
      turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 3 } as any,
      pendingThreat: { attackerId: 1, targetId: 2, defender: "b", mode: "fire", weapon: "Autocannon" },
    },
  };
}

test("shows the overlay to the targeted defender", async () => {
  render(<V2Providers><Seed state={stateWithThreat()} side="b" /><ThreatOverlay /></V2Providers>);
  expect(await screen.findByText(/INCOMING FIRE/i)).toBeInTheDocument();
  expect(screen.getByText(/Ironjaw/)).toBeInTheDocument();
  expect(screen.getByText(/Rivethead/)).toBeInTheDocument();
});

test("hidden for the attacker", () => {
  const { container } = render(
    <V2Providers><Seed state={stateWithThreat()} side="a" /><ThreatOverlay /></V2Providers>,
  );
  expect(container.querySelector(".v2-threat")).toBeNull();
});

test("hidden when there is no pendingThreat", () => {
  const s = stateWithThreat();
  s.game!.pendingThreat = null;
  const { container } = render(
    <V2Providers><Seed state={s} side="b" /><ThreatOverlay /></V2Providers>,
  );
  expect(container.querySelector(".v2-threat")).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run client/src/v2/overlays/ThreatOverlay.test.tsx`
Expected: FAIL — module `./ThreatOverlay` does not exist.

- [ ] **Step 4: Write the component**

Create `client/src/v2/overlays/ThreatOverlay.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRoomState } from "../../state/RoomStateContext";
import { useMySide } from "../../hooks/useMySide";
import { playThreatAlarm } from "../audio/actionAudio";
import "../styles/overlay.css";

// Loud, blocking "incoming fire" telegraph. Shown to the defender whose Rig an
// enemy has just opened an attack on (game.pendingThreat.defender === mySide).
// Cosmetic only — the defender takes no action here; reactions are pre-placed.
export function ThreatOverlay() {
  const { rigs, game } = useRoomState();
  const mySide = useMySide();
  const th = game?.pendingThreat ?? null;
  const active = Boolean(th && th.defender === mySide);

  // Klaxon once per threat session (keyed on attacker, not target — a live
  // re-point keeps the same attacker and must not re-fire the alarm).
  const alarmedFor = useRef<number | null>(null);
  useEffect(() => {
    if (active && th && alarmedFor.current !== th.attackerId) {
      alarmedFor.current = th.attackerId;
      playThreatAlarm();
    }
    if (!active) alarmedFor.current = null;
  }, [active, th?.attackerId]);

  // 20s failsafe: if a threat somehow never clears (attacker disconnected),
  // downgrade to dismissable so the defender is never permanently blocked.
  const [failsafe, setFailsafe] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!active) { setFailsafe(false); setDismissed(false); return; }
    const id = window.setTimeout(() => setFailsafe(true), 20000);
    return () => window.clearTimeout(id);
  }, [active, th?.attackerId]);

  if (!active || !th || dismissed) return null;

  const attacker = rigs.find((r) => r.id === th.attackerId);
  const target = rigs.find((r) => r.id === th.targetId);
  const attackerName = (attacker?.name || "Enemy").toUpperCase();
  const targetName = (target?.name || "your Rig").toUpperCase();
  const painting = th.mode === "lock";
  const weaponLine = painting
    ? "Fire Control Lock — painting for a strike"
    : `${(th.weapon || "Weapon").toUpperCase()} — locked and ranging`;

  return createPortal(
    <div className="v2-threat" role="alertdialog" aria-live="assertive">
      <div className="v2-threat-hazard top" />
      <div className="v2-threat-hazard bot" />
      <div className="v2-threat-siren" />
      <div className="v2-threat-reticle"><span className="h" /><span className="v" /></div>
      <div className="v2-threat-card">
        <div className="v2-threat-klaxon">⚠ ◤ INCOMING FIRE ◥ ⚠</div>
        <div className="v2-threat-title">
          Enemy <em>{attackerName}</em> targets your <b>{targetName}</b>
        </div>
        <div className="v2-threat-weapon">{weaponLine}</div>
        <div className="v2-threat-brace">◇ Brace for impact</div>
        {failsafe ? (
          <button type="button" className="v2-threat-dismiss" onClick={() => setDismissed(true)}>
            Dismiss
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 5: Add the styles**

Append to `client/src/v2/styles/overlay.css`:

```css
/* --- Threat telegraph: loud, blocking "incoming fire" overlay --- */
.v2-threat {
  position: fixed; inset: 0; z-index: 1200;
  display: flex; align-items: flex-end; justify-content: center;
  background: rgba(6, 8, 11, .45);
  animation: v2-threat-shake .12s linear infinite;
}
@keyframes v2-threat-shake {
  0% { transform: translate(0, 0); } 25% { transform: translate(-1.2px, 1px); }
  50% { transform: translate(1px, -1px); } 75% { transform: translate(-1px, -1px); }
  100% { transform: translate(1px, 1px); }
}
.v2-threat-siren {
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(120% 90% at 50% 50%, transparent 40%, rgba(229, 83, 58, .28) 100%);
  animation: v2-threat-siren 1s ease-in-out infinite;
}
@keyframes v2-threat-siren { 0%, 100% { opacity: .35; } 50% { opacity: .9; } }
.v2-threat-hazard {
  position: absolute; left: 0; right: 0; height: 20px; pointer-events: none;
  background: repeating-linear-gradient(-45deg, #0c0709 0 13px, #8a2735 13px 26px);
  animation: v2-threat-slide .7s linear infinite;
}
.v2-threat-hazard.top { top: 0; } .v2-threat-hazard.bot { bottom: 0; }
@keyframes v2-threat-slide { to { background-position: 37px 0; } }
.v2-threat-reticle {
  position: absolute; top: 34%; left: 50%; width: 96px; height: 96px; margin: -48px;
  border: 2px solid var(--ember-hi); border-radius: 50%;
  box-shadow: 0 0 18px rgba(255, 111, 82, .7); pointer-events: none;
  animation: v2-threat-ret 1.4s ease-out infinite;
}
@keyframes v2-threat-ret {
  0% { transform: scale(1.4); opacity: 0; } 40% { opacity: 1; } 100% { transform: scale(.7); opacity: .2; }
}
.v2-threat-reticle .h, .v2-threat-reticle .v { position: absolute; background: var(--ember-hi); opacity: .85; }
.v2-threat-reticle .h { left: 0; right: 0; top: 50%; height: 1px; }
.v2-threat-reticle .v { top: 0; bottom: 0; left: 50%; width: 1px; }
.v2-threat-card {
  position: relative; z-index: 1; text-align: center;
  padding: 26px 20px calc(26px + env(safe-area-inset-bottom, 0px));
  width: 100%; max-width: 460px;
}
.v2-threat-klaxon {
  font-size: 12px; font-weight: 800; letter-spacing: .28em; text-transform: uppercase;
  color: var(--ember-hi); animation: v2-threat-blink .7s steps(1) infinite;
}
@keyframes v2-threat-blink { 50% { opacity: .25; } }
.v2-threat-title {
  font-size: 28px; font-weight: 800; color: var(--txt); margin: 10px 0 6px; line-height: 1.06;
  text-shadow: 0 0 24px rgba(229, 83, 58, .55);
}
.v2-threat-title em { color: var(--ember-hi); font-style: normal; }
.v2-threat-title b { color: var(--oil-hi); font-weight: 800; }
.v2-threat-weapon { font-size: 14px; color: var(--txt-dim); letter-spacing: .04em; }
.v2-threat-brace {
  margin-top: 16px; display: inline-block; font-size: 13px; font-weight: 700;
  letter-spacing: .18em; text-transform: uppercase; padding: 9px 20px; border-radius: 6px;
  color: #12060a; background: linear-gradient(180deg, var(--ember-hi), var(--ember));
  box-shadow: 0 0 26px rgba(229, 83, 58, .6);
}
.v2-threat-dismiss {
  display: block; margin: 16px auto 0; padding: 7px 18px; border-radius: 6px;
  background: transparent; color: var(--txt-dim); border: 1px solid var(--line);
  font: inherit; cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .v2-threat, .v2-threat-siren, .v2-threat-hazard, .v2-threat-reticle, .v2-threat-klaxon { animation: none; }
}
```

If `overlay.css` does not already define `--ember`, `--ember-hi`, `--oil-hi`, `--txt`, `--txt-dim`, `--line`, they come from `client/src/styles/tokens.css` (imported globally via `app.css`) — no action needed.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run client/src/v2/overlays/ThreatOverlay.test.tsx`
Expected: PASS (all three tests).

- [ ] **Step 7: Commit**

```bash
git add client/src/state/types.ts client/src/v2/overlays/ThreatOverlay.tsx client/src/v2/overlays/ThreatOverlay.test.tsx client/src/v2/styles/overlay.css
git commit -m "feat(v2): ThreatOverlay — loud blocking incoming-fire telegraph"
```

---

## Task 6: Client — mount `ThreatOverlay` in `V2Terminal`

**Files:**
- Modify: `client/src/v2/V2Terminal.tsx`

- [ ] **Step 1: Add the import**

At the top with the other overlay imports (~line 9), add:

```tsx
import { ThreatOverlay } from "./overlays/ThreatOverlay";
```

- [ ] **Step 2: Mount it**

In the returned JSX, next to `<OutcomeBanner />` (~line 71), add:

```tsx
      <OutcomeBanner />
      <ThreatOverlay />
```

- [ ] **Step 3: Verify the build/tests still pass**

Run: `npx vitest run client/src/v2/` and `npx tsc --noEmit -p client` (or the repo's typecheck script if different).
Expected: PASS / no type errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/v2/V2Terminal.tsx
git commit -m "feat(v2): mount ThreatOverlay in the battle terminal"
```

---

## Task 7: Client — `AttackWizard` broadcasts declare/clear

**Files:**
- Modify: `client/src/v2/overlays/AttackWizard.tsx`
- Test: `client/src/v2/overlays/AttackWizard.test.tsx`

The wizard already has `useCommands()` (as `sendCommand`), `useMySide` is available via hook, `state.target`, `mode`, `weapons`, `flat`, and the `react` prop. Threat is skipped entirely in `react` mode.

- [ ] **Step 1: Write the failing test**

Open `client/src/v2/overlays/AttackWizard.test.tsx` and mirror its existing render harness (it already renders the wizard inside providers and captures sent commands). Add a test that:
1. Renders the wizard for a normal (non-react) attack with an enemy target.
2. Advances timers by 500ms (`vi.useFakeTimers()` / `vi.advanceTimersByTime(500)`).
3. Asserts a `threat` command with `attrs.action === "declare"` and `attrs.target` set was sent.

Use the file's existing command-capture mechanism. If it captures via a mocked `useCommands`, assert on that mock. Concrete shape:

```tsx
import { vi, expect, test } from "vitest";
// ... existing harness imports ...

test("declares a threat 500ms after opening on an enemy", () => {
  vi.useFakeTimers();
  const sent: Array<{ verb: string; attrs: any }> = [];
  // Render the wizard with the harness that routes sendCommand into `sent`.
  // (Reuse whatever helper the existing tests use; if they call
  //  renderWizard({ rig, mode: "fire", onSend: (v, a) => sent.push({verb:v,attrs:a}) })
  //  use that.)
  renderAttackWizard({ mode: "fire", onSend: (verb, attrs) => sent.push({ verb, attrs }) });
  vi.advanceTimersByTime(500);
  const declare = sent.find((c) => c.verb === "threat" && c.attrs.action === "declare");
  expect(declare).toBeTruthy();
  expect(declare!.attrs.target).toBeTruthy();
  vi.useRealTimers();
});

test("does not declare a threat in return-fire (react) mode", () => {
  vi.useFakeTimers();
  const sent: Array<{ verb: string; attrs: any }> = [];
  renderAttackWizard({ mode: "fire", react: true, onSend: (verb, attrs) => sent.push({ verb, attrs }) });
  vi.advanceTimersByTime(500);
  expect(sent.some((c) => c.verb === "threat")).toBe(false);
  vi.useRealTimers();
});
```

If the existing test file has no reusable `renderAttackWizard` helper, write a small local one modeled on the `Seed` + `V2Providers` pattern from `ThreatOverlay.test.tsx`, rendering `<AttackWizard rig={attackerRig} mode="fire" onClose={()=>{}} />` with two rigs (owner "a" active, owner "b" enemy) seeded into room state, session side "a", and a spy on the commands hook.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`
Expected: FAIL — no `threat` command is sent.

- [ ] **Step 3: Add the broadcast effect**

In `AttackWizard.tsx`, add `useMySide`:

```tsx
import { useMySide } from "../../hooks/useMySide";
```

Inside the component, near the other hooks (after `const { rigs, game } = useRoomState();`), add:

```tsx
  const mySide = useMySide();
```

Then add this effect after the existing open-animation effect (~after line 163), so it runs while the sheet is open:

```tsx
  // Attack telegraph: 500ms after opening on an enemy, broadcast a `threat` so
  // the defender's ThreatOverlay lights up. Re-declare when the target switches;
  // clear on unmount (close or after Fire). Skipped for return-fire (react).
  useEffect(() => {
    if (react || !state.target) return;
    const weaponName = weapons[flat ? "unit" : state.weapon] || "";
    const id = window.setTimeout(() => {
      sendCommand("threat", {
        action: "declare", target: state.target, mode, weapon: weaponName, side: mySide,
      });
    }, 500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.target, state.weapon, react]);

  useEffect(() => {
    if (react) return;
    return () => { sendCommand("threat", { action: "clear", side: mySide }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Note on timing: the first effect's 500ms timer is cleared and restarted whenever `state.target` or `state.weapon` changes — so switching target within 500ms re-points cleanly, and switching after re-declares (the server overwrites, same attacker → the overlay updates without re-klaxoning). The second effect's cleanup fires the `clear` when the wizard unmounts (the `close()` path calls `onClose` which unmounts it).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/overlays/AttackWizard.tsx client/src/v2/overlays/AttackWizard.test.tsx
git commit -m "feat(v2): AttackWizard broadcasts the threat telegraph on open"
```

---

## Task 8: Full-suite verification

- [ ] **Step 1: Run everything**

Run: `npm test`
Expected: all Vitest + node:test suites PASS.

- [ ] **Step 2: Typecheck**

Run the repo's typecheck (e.g. `npx tsc --noEmit -p client` or the `build` script).
Expected: no errors.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Two browser tabs joined to one seed room as sides A and B. As A, activate a rig and open Fire on a B Rig; confirm B's screen raises the loud overlay within ~0.5s with a klaxon, naming the right attacker/target/weapon. Close the sheet without firing → B's overlay clears. Re-open and Fire → overlay clears as the dice/recap play.

---

## Notes for the implementer

- **Live tree is `client/src/v2/`** (main.tsx → V2Boot). The parallel `client/src/components/` tree is legacy — do **not** edit it.
- The whole `room.game` object is sent to clients via `publicState` (which spreads `...room.game`), so `pendingThreat` needs no serializer change.
- `weapons[flat ? "unit" : state.weapon]` resolves the display weapon name; `state.weapon` is a slot key (`"longRange"`/`"melee"`), `weapons` maps slot→name.
- Keep `threat` out of `UNDO_VERBS` — it must never snapshot history.
- If `AttackWizard.test.tsx` doesn't exist yet, create it with the harness described in Task 7 Step 1.
